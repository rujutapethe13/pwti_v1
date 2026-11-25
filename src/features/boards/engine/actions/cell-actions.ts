"use server";

import { updateCellSchema, bulkUpdateCellsSchema, clearCellSchema } from "../schemas/cell-schemas";
import { CellService } from "../services/cell-service";
import { checkChangeTriggers } from "@/features/triggers/engine";
import { canUserAccessBoard } from "@/lib/board-access";
import { eventBus } from "@/features/boards/engine/events/event-bus";
import type { ApiResponse } from "@/types";
import type { ColumnValue } from "../types";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { invalidateDataCache } from "@/lib/board-data-cache";

export async function updateCell(
  organizationId: string,
  workspaceId: string,
  boardId: string,
  recordId: string,
  columnId: string,
  value: ColumnValue,
): Promise<ApiResponse<{ id: string; value: ColumnValue }>> {
  const parsed = updateCellSchema.safeParse({
    organizationId,
    workspaceId,
    boardId,
    recordId,
    columnId,
    value,
  });

  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }

  // Read previous cell value so change-based triggers see old vs new.
  let previousValue: unknown = undefined;
  try {
    const serviceClient = await createServiceClient();
    const { data: existing } = await serviceClient
      .from("cell_values")
      .select("value_text, value")
      .eq("id", `${boardId}:${recordId}:${columnId}`)
      .maybeSingle();
    previousValue = existing?.value_text ?? existing?.value ?? undefined;
  } catch {
    // oldValue stays undefined if the read fails; never blocks the save.
  }

  const result = await CellService.update(parsed.data, "system");

  // The Overview / Client 360 dashboards read a short-lived materialized scope
  // cache. Bust it so a saved Client / Company name shows there immediately
  // instead of after the TTL. Best-effort; never fails the save.
  if (!result.error) {
    try {
      invalidateDataCache(organizationId);
    } catch (err) {
      console.error("[updateCell] cache invalidation failed:", err);
    }
  }

  // Record the acting user as last editor (writes use the service client,
  // so the DB trigger's auth.uid() is null).
  try {
    const userClient = await createClient();
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (userId) {
      const serviceClient = await createServiceClient();
      await serviceClient
        .from("records")
        .update({ last_edited_at: new Date().toISOString(), last_edited_by: userId })
        .eq("id", recordId);
      await serviceClient
        .from("cell_values")
        .update({ updated_by: userId })
        .eq("id", `${boardId}:${recordId}:${columnId}`);
    }
  } catch {
    // Never fail the save because of audit metadata.
  }

  // Change-based triggers run after the save, fire-and-forget: never awaited
  // by the user-facing path, and never able to fail the save.
  void (async () => {
    try {
      await checkChangeTriggers({
        boardId,
        recordId,
        boardName: boardId,
        columnId,
        oldValue: previousValue,
        newValue: value,
        startedBy: "system",
      });
    } catch {
      // Swallowed: trigger checks must never break a cell save.
    }
  })();

  return result;
}

/**
 * Gate a bulk write: the board must belong to the org/workspace, the acting
 * user must be able to access it, and every record/column id must belong to
 * that board. Rejects cross-board ids outright.
 */
async function verifyBulkWriteScope({
  serviceClient,
  userId,
  organizationId,
  workspaceId,
  boardId,
  recordIds = [],
  columnIds = [],
}: {
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>;
  userId: string | undefined;
  organizationId: string;
  workspaceId: string;
  boardId: string;
  recordIds?: string[];
  columnIds?: string[];
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data: board, error: boardError } = await serviceClient
    .from("boards")
    .select("id, organization_id, workspace_id")
    .eq("id", boardId)
    .maybeSingle();
  if (boardError || !board) {
    return { ok: false, error: "Board not found", status: 404 };
  }
  if (board.organization_id !== organizationId || board.workspace_id !== workspaceId) {
    return { ok: false, error: "Board does not belong to this organization/workspace", status: 403 };
  }

  // Access floor: a user who cannot access the board cannot edit it.
  if (userId && !(await canUserAccessBoard(userId, boardId, workspaceId))) {
    return { ok: false, error: "You cannot edit this board", status: 403 };
  }

  if (recordIds.length) {
    const { data: recs } = await serviceClient
      .from("records")
      .select("id")
      .eq("board_id", boardId)
      .in("id", recordIds);
    const found = new Set((recs || []).map((r: { id: string }) => r.id));
    const missing = recordIds.filter((id) => !found.has(id));
    if (missing.length) {
      return { ok: false, error: "Record(s) do not belong to this board", status: 400 };
    }
  }

  if (columnIds.length) {
    const { data: cols } = await serviceClient
      .from("columns")
      .select("id")
      .eq("board_id", boardId)
      .in("id", columnIds);
    const found = new Set((cols || []).map((c: { id: string }) => c.id));
    const missing = columnIds.filter((id) => !found.has(id));
    if (missing.length) {
      return { ok: false, error: "Column(s) do not belong to this board", status: 400 };
    }
  }

  return { ok: true };
}

export async function bulkUpdateCells(
  organizationId: string,
  workspaceId: string,
  boardId: string,
  updates: Array<{ recordId: string; columnId: string; value: ColumnValue }>,
): Promise<ApiResponse<null>> {
  const parsed = bulkUpdateCellsSchema.safeParse({
    organizationId,
    workspaceId,
    boardId,
    updates,
  });

  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }

  // Authorization + membership gate: board must belong to org/workspace,
  // user must be able to edit it, and every record/column id must belong
  // to that board. Cross-board ids are rejected outright.
  const userClient = await createClient();
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  const serviceClient = await createServiceClient();
  const scope = await verifyBulkWriteScope({
    serviceClient,
    userId,
    organizationId,
    workspaceId,
    boardId,
    recordIds: parsed.data.updates.map((u) => u.recordId),
    columnIds: parsed.data.updates.map((u) => u.columnId),
  });
  if (!scope.ok) {
    return { data: null, error: scope.error, status: scope.status };
  }

  // Capture previous values for change-based triggers (one read, batched).
  const oldValues = new Map<string, unknown>();
  try {
    const cellIds = parsed.data.updates.map((u) => `${boardId}:${u.recordId}:${u.columnId}`);
    if (cellIds.length) {
      const { data: existing } = await serviceClient
        .from("cell_values")
        .select("id, value_text, value")
        .in("id", cellIds);
      for (const e of existing || []) oldValues.set(e.id, e.value_text ?? e.value ?? null);
    }
  } catch {
    // old values stay unset; never blocks the paste.
  }

  const result = await CellService.bulkUpdate(parsed.data, "system");

  // Update last_edited_at / last_edited_by on every touched record (one write
  // per distinct record, matching the single-cell updateCell behaviour).
  try {
    if (userId) {
      const now = new Date().toISOString();
      const distinctRecordIds = [...new Set(parsed.data.updates.map((u) => u.recordId))];
      await serviceClient
        .from("records")
        .update({ last_edited_at: now, last_edited_by: userId })
        .in("id", distinctRecordIds);
    }
  } catch {
    // Never fail the paste because of audit metadata.
  }

  // Fire change-based triggers once per pasted cell with old + new values.
  // One batched paste => one upsert; each cell still reports its old/new pair.
  for (const u of parsed.data.updates) {
    const cellId = `${boardId}:${u.recordId}:${u.columnId}`;
    void (async () => {
      try {
        await checkChangeTriggers({
          boardId,
          recordId: u.recordId,
          boardName: boardId,
          columnId: u.columnId,
          oldValue: oldValues.get(cellId),
          newValue: u.value,
          startedBy: "system",
        });
      } catch {
        // Swallowed: trigger checks must never break a paste.
      }
    })();
  }

  return result;
}

/**
 * Batched title update for paste / bulk rename.
 * Upserts all titles in a single records upsert, stamps last_edited_at/by,
 * fires change triggers per record, and publishes record.update:after events.
 */
export async function bulkUpdateRecordTitles(
  boardId: string,
  organizationId: string,
  workspaceId: string,
  updates: Array<{ recordId: string; title: string }>,
): Promise<ApiResponse<null>> {
  if (!updates.length) return { data: null, error: null, status: 200 };

  // Authorization + membership gate: board must belong to org/workspace,
  // user must be able to edit it, and every record id must belong to that
  // board. Cross-board ids are rejected outright.
  const userClient = await createClient();
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  const serviceClient = await createServiceClient();
  const scope = await verifyBulkWriteScope({
    serviceClient,
    userId,
    organizationId,
    workspaceId,
    boardId,
    recordIds: updates.map((u) => u.recordId),
  });
  if (!scope.ok) {
    return { data: null, error: scope.error, status: scope.status };
  }

  // Read previous titles so change-based triggers see old vs new.
  const oldTitles = new Map<string, string>();
  try {
    const { data: existing } = await serviceClient
      .from("records")
      .select("id, title")
      .in("id", updates.map((u) => u.recordId));
    for (const e of existing || []) oldTitles.set(e.id, e.title ?? "");
  } catch {
    // old titles stay unset; never blocks the paste.
  }

  const now = new Date().toISOString();

  const filtered = updates.filter((u) => {
    const incoming = (u.title ?? "").trim();
    const isPlaceholder = incoming === "" || incoming === "Untitled";
    const stored = oldTitles.get(u.recordId) ?? "";
    return !(isPlaceholder && stored);
  });

  const payload = filtered.map((u) => ({
    id: u.recordId,
    title: u.title,
    updated_at: now,
    ...(userId ? { last_edited_at: now, last_edited_by: userId } : {}),
  }));
  if (payload.length === 0) return { data: null, error: null, status: 200 };
  const { error } = await serviceClient.from("records").upsert(payload);
  if (error) {
    return { data: null, error: error.message, status: 500 };
  }

  // Fire change-based triggers once per title update.
  for (const u of updates) {
    void (async () => {
      try {
        await checkChangeTriggers({
          boardId,
          recordId: u.recordId,
          boardName: boardId,
          columnId: "__title__",
          oldValue: oldTitles.get(u.recordId) ?? null,
          newValue: u.title,
          startedBy: "system",
        });
      } catch {
        // Swallowed: trigger checks must never break a paste.
      }
    })();
  }

  // Publish record.update:after events for each title change.
  try {
    for (const u of updates) {
      await eventBus.publish({
        eventId: crypto.randomUUID(),
        eventName: "record.update:after",
        timestamp: now,
        actorUserId: userId ?? "system",
        scope: { organizationId, workspaceId, boardId },
        before: { title: oldTitles.get(u.recordId) ?? null },
        after: { title: u.title },
        metadata: { recordId: u.recordId },
      });
    }
  } catch {
    // Event publishing must never fail the save.
  }

  return { data: null, error: null, status: 200 };
}

export async function clearCell(
  organizationId: string,
  workspaceId: string,
  boardId: string,
  recordId: string,
  columnId: string,
): Promise<ApiResponse<null>> {
  const parsed = clearCellSchema.safeParse({
    organizationId,
    workspaceId,
    boardId,
    recordId,
    columnId,
  });

  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }

  return CellService.clear(parsed.data, "system");
}
