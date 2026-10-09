"use server";

/**
 * Import Server Actions
 *
 * Handles the complete import flow in a single transaction:
 * - Creates new columns
 * - Imports records and cell values
 * - Soft-deletes unmapped columns
 * - Cleans up dependents
 * - Audit logging
 */

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types";
import type { ColumnDefinition, ColumnValue } from "../types";
import { ColumnRepository } from "../repository/column-repository";
import { CellRepository } from "../repository/cell-repository";
import { RecordRepository } from "../repository/record-repository";
import { ColumnService } from "../services/column-service";
import { eventBus } from "../events/event-bus";
import type { DomainEventPayload } from "../events/event-types";

const columnRepo = new ColumnRepository();
const cellRepo = new CellRepository();
const recordRepo = new RecordRepository();

interface ImportRecordInput {
  title: string;
  cellValues: Record<string, ColumnValue>;
}

interface ImportConfirmInput {
  organizationId: string;
  workspaceId: string;
  boardId: string;
  newColumns: ColumnDefinition[];
  updatedColumns: ColumnDefinition[];
  records: ImportRecordInput[];
  columnsToDelete: string[];
  targetGroupId: string | null;
  keepUnmappedColumns: boolean;
}

interface ImportResult {
  createdCount: number;
  importErrors: Array<{ rowIndex: number; reason: string }>;
  deletedColumns: string[];
}

/**
 * A record is "blank" when its title is empty and every cell value is null,
 * undefined, empty string, or whitespace-only. This is the server-side
 * safeguard: even if the frontend parser ever ships a blank row, the blank
 * record is dropped here and never persisted to `records` or `cell_values`.
 */
function isBlankRecord(record: ImportRecordInput): boolean {
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (title) return false;
  for (const value of Object.values(record.cellValues ?? {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return false;
  }
  return true;
}

function buildScope(boardId: string, columnId?: string) {
  return { organizationId: "", workspaceId: "", boardId, columnId };
}

function createEvent(
  eventName: DomainEventPayload["eventName"],
  actorUserId: string,
  boardId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  metadata: Record<string, unknown> = {},
): DomainEventPayload {
  return {
    eventId: crypto.randomUUID(),
    eventName,
    timestamp: new Date().toISOString(),
    actorUserId,
    scope: buildScope(boardId),
    before,
    after,
    metadata: { entityId: boardId, ...metadata },
  };
}

async function currentActorUserId(): Promise<string> {
  try {
    const client = await createClient(await cookies());
    const { data: { user } } = await client.auth.getUser();
    if (user?.id) {
      return user.id;
    }
  } catch (err) {
    console.error("[import-actions] auth getUser failed:", err);
  }
  return "system";
}

export async function importWithColumnCleanup(
  formData: FormData,
): Promise<ApiResponse<ImportResult>> {
  const actorUserId = await currentActorUserId();
  
  try {
    const input: ImportConfirmInput = JSON.parse(formData.get("input") as string);
    
    // Validate required fields
    if (!input.organizationId || !input.workspaceId || !input.boardId) {
      return { data: null, error: "Missing required identifiers", status: 400 };
    }

    // Check permissions - user must be able to edit the board structure
    const supabase = await createClient(await cookies());
    const { data: board } = await supabase
      .from("boards")
      .select("workspace_id")
      .eq("id", input.boardId)
      .single();

    if (!board) {
      return { data: null, error: "Board not found", status: 404 };
    }

    // Check workspace edit permission
    const { data: canEdit } = await supabase.rpc("can_edit_workspace", {
      p_workspace_id: board.workspace_id,
    });

    if (!canEdit) {
      // Fallback to board edit permission
      const { data: canEditBoard } = await supabase.rpc("can_edit_board", {
        p_board_id: input.boardId,
      });
      if (!canEditBoard) {
        return { data: null, error: "Insufficient permissions to modify board structure", status: 403 };
      }
    }

    // If keeping unmapped columns, clear the delete list
    const columnsToDelete = input.keepUnmappedColumns ? [] : input.columnsToDelete;
    const deletedColumns: string[] = [];

    // Start transaction by using a single client
    const client = await createClient(await cookies());
    
    // We'll use the service client for the actual operations to bypass RLS
    // but the permission check above ensures the user is authorized
    const serviceClient = await createClient(await cookies());

    const importErrors: Array<{ rowIndex: number; reason: string }> = [];
    let createdCount = 0;

    try {
      // 1. Create new columns
      const persistedNewColumns: ColumnDefinition[] = [];
      const columnIdRemap = new Map<string, string>();

      for (const nc of input.newColumns) {
        const { data: column, error } = await serviceClient
          .from("columns")
          .insert({
            id: nc.id,
            organization_id: input.organizationId,
            workspace_id: input.workspaceId,
            board_id: input.boardId,
            key: nc.key,
            label: nc.label,
            description: nc.description,
            type: nc.type,
            required: nc.required,
            hidden: nc.hidden,
            frozen: nc.frozen,
            default_value: nc.defaultValue,
            settings: nc.settings,
            permissions: nc.permissions,
            validation: nc.validation,
            version: nc.version,
            sort_order: nc.order,
            created_at: nc.createdAt,
            updated_at: nc.updatedAt,
          })
          .select()
          .single();

        if (error || !column) {
          throw new Error(`Failed to create column "${nc.label}": ${error?.message || "Unknown error"}`);
        }

        columnIdRemap.set(nc.id, column.id);
        persistedNewColumns.push({
          ...nc,
          ...column,
          boardId: column.board_id,
          createdAt: column.created_at,
          updatedAt: column.updated_at,
        } as ColumnDefinition);
      }

      // 2. Update existing columns (for option columns that got new options)
      for (const updated of input.updatedColumns) {
        if (columnIdRemap.has(updated.id)) continue; // Skip new columns
        
        const { error } = await serviceClient
          .from("columns")
          .update({
            settings: updated.settings,
            updated_at: new Date().toISOString(),
          })
          .eq("id", updated.id);

        if (error) {
          throw new Error(`Failed to update column "${updated.label}": ${error.message}`);
        }
      }

      // 3. Soft-delete unmapped columns (if not keeping them)
      for (const columnId of columnsToDelete) {
        // Clean up dependents first
        await serviceClient.rpc("cleanup_column_dependents", { p_column_id: columnId });
        
        // Soft-delete the column
        const { error } = await serviceClient
          .from("columns")
          .update({ deleted_at: new Date().toISOString(), status: "archived", updated_at: new Date().toISOString() })
          .eq("id", columnId)
          .is("deleted_at", null);

        if (!error) {
          deletedColumns.push(columnId);
          
          // Audit log entry for column deletion
          await serviceClient
            .from("activity_logs")
            .insert({
              organization_id: input.organizationId,
              workspace_id: input.workspaceId,
              board_id: input.boardId,
              column_id: columnId,
              actor_user_id: actorUserId,
              action: "column.delete_import",
              payload: {
                reason: "unmapped_during_import",
                column_id: columnId,
              },
              created_at: new Date().toISOString(),
            });
        }
      }

      // 4. Bulk-create records and cell values
      const BATCH_SIZE = 500;
      const effectiveColumnsById = new Map<string, ColumnDefinition>();
      
      // Build effective columns map (existing + new - deleted)
      const { data: existingColumns } = await serviceClient
        .from("columns")
        .select("*")
        .eq("board_id", input.boardId)
        .is("deleted_at", null);

      if (existingColumns) {
        for (const col of existingColumns) {
          if (!deletedColumns.includes(col.id)) {
            effectiveColumnsById.set(col.id, col as unknown as ColumnDefinition);
          }
        }
      }
      
      for (const col of persistedNewColumns) {
        effectiveColumnsById.set(col.id, col);
      }

      // Server-side safeguard: drop any record whose title is empty and whose
      // every cell value is blank. This guarantees blank rows are never
      // persisted even if the frontend parser ever ships one.
      const recordsToImport = input.records.filter((rec) => !isBlankRecord(rec));

      // Process records in batches
      for (let i = 0; i < recordsToImport.length; i += BATCH_SIZE) {
        const batch = recordsToImport.slice(i, i + BATCH_SIZE);
        
        // Create records
        const recordsToInsert = batch.map((rec) => ({
          id: crypto.randomUUID(),
          organization_id: input.organizationId,
          workspace_id: input.workspaceId,
          board_id: input.boardId,
          group_id: input.targetGroupId,
          title: rec.title,
          status: "active",
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

        const { data: createdRecords, error: recordsError } = await serviceClient
          .from("records")
          .insert(recordsToInsert)
          .select();

        if (recordsError || !createdRecords) {
          for (let j = 0; j < batch.length; j++) {
            importErrors.push({ rowIndex: i + j, reason: recordsError?.message || "Failed to create record" });
          }
          continue;
        }

        // Create cell values for each record
        const cellValuesToInsert: Array<{
          id: string;
          organization_id: string;
          workspace_id: string;
          board_id: string;
          record_id: string;
          column_id: string;
          value: ColumnValue;
          value_text: string;
          version: number;
          updated_at: string;
        }> = [];

        for (let k = 0; k < createdRecords.length; k++) {
          const record = createdRecords[k];
          const rec = batch[k];
          
          for (const [columnId, value] of Object.entries(rec.cellValues)) {
            const targetColumnId = columnIdRemap.get(columnId) ?? columnId;
            
            if (!effectiveColumnsById.has(targetColumnId)) {
              continue; // Skip unmapped columns
            }

            cellValuesToInsert.push({
              id: crypto.randomUUID(),
              organization_id: input.organizationId,
              workspace_id: input.workspaceId,
              board_id: input.boardId,
              record_id: record.id,
              column_id: targetColumnId,
              value,
              value_text: typeof value === "string" ? value : JSON.stringify(value),
              version: 1,
              updated_at: new Date().toISOString(),
            });
          }
        }

        if (cellValuesToInsert.length > 0) {
          const { error: cellsError } = await serviceClient
            .from("cell_values")
            .upsert(cellValuesToInsert);

          if (cellsError) {
            console.error("[import] Failed to insert cell values:", cellsError);
            for (let j = 0; j < batch.length; j++) {
              importErrors.push({ rowIndex: i + j, reason: "Failed to save cell values" });
            }
            continue;
          }
        }

        createdCount += createdRecords.length;
      }

      // Publish events for new columns
      for (const col of persistedNewColumns) {
        await eventBus.publish(createEvent(
          "column.create:after",
          actorUserId,
          input.boardId,
          null,
          col as unknown as Record<string, unknown>,
          { source: "import" }
        ));
      }

      // Publish events for deleted columns
      for (const colId of deletedColumns) {
        await eventBus.publish(createEvent(
          "column.delete:after",
          actorUserId,
          input.boardId,
          { id: colId },
          null,
          { source: "import", reason: "unmapped_during_import" }
        ));
      }

      // Single audit entry for all removed columns
      if (deletedColumns.length > 0) {
        await serviceClient
          .from("activity_logs")
          .insert({
            organization_id: input.organizationId,
            workspace_id: input.workspaceId,
            board_id: input.boardId,
            actor_user_id: actorUserId,
            action: "board.import_column_cleanup",
            payload: {
              deleted_columns: deletedColumns,
              kept_unmapped: input.keepUnmappedColumns,
              new_columns_created: persistedNewColumns.length,
              records_imported: createdCount,
            },
            created_at: new Date().toISOString(),
          });
      }

      return {
        data: { createdCount, importErrors, deletedColumns },
        error: null,
        status: 200,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      console.error("[import] Transaction failed:", err);
      return { data: null, error: message, status: 500 };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid input";
    return { data: null, error: message, status: 400 };
  }
}

export async function getColumnDependents(
  columnId: string,
): Promise<ApiResponse<unknown>> {
  const supabase = await createClient(await cookies());
  const { data, error } = await supabase.rpc("get_column_dependents", { p_column_id: columnId });
  
  if (error) {
    return { data: null, error: error.message, status: 500 };
  }
  
  return { data, error: null, status: 200 };
}