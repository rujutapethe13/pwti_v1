/**
 * Connected Data — Event Bus Subscriber
 *
 * Listens to cell value changes and triggers recomputation of
 * Mirror, Lookup, Rollup, and Formula columns through the
 * dependency graph.
 *
 * ── Recalculation Strategy ──────────────────────────────────
 * 1. A `cell.update:after` event is fired when any cell value changes
 * 2. This subscriber finds the changed column in the dependency graph
 * 3. Traverses downstream to find all derived columns that depend on it
 * 4. For each affected derived column, calls the appropriate service
 *    to recompute the value
 * 5. Writes the recomputed value to the derived_values cache table
 *
 * This is INCREMENTAL recalculation — only columns whose inputs actually
 * changed are recomputed, not every column on the board.
 * ────────────────────────────────────────────────────────────
 */

import "server-only";

import { eventBus } from "../events/event-bus";
import { ColumnRepository } from "../repository/column-repository";
import { CellRepository } from "../repository/cell-repository";
import { RecordRepository } from "../repository/record-repository";
import { metadataCache } from "../cache/metadata-cache";
import { MirrorService } from "./mirror-service";
import { LookupService } from "./lookup-service";
import { RollupService } from "./rollup-service";
import { FormulaEngine } from "./formula-engine";
import { RelationshipEngine } from "./relationship-engine";
import {
  buildDependencyGraph,
  extractDerivedColumnConfigs,
  traverseDownstream,
} from "./dependency-graph";
import { DerivedValueCache } from "./cache";
import type { EventSubscription, DomainEventPayload } from "../events/event-types";
import type { ColumnDefinition, ColumnValue } from "../types";
import type { DependencyGraphNode, DerivedValue } from "./types";

const columnRepo = new ColumnRepository();
const cellRepo = new CellRepository();
const recordRepo = new RecordRepository();

/**
 * Handle a cell value change: recompute all derived columns
 * that depend on the changed value.
 */
async function handleCellUpdate(payload: DomainEventPayload): Promise<void> {
  const { scope, metadata } = payload;
  const boardId = scope.boardId;
  const recordId = metadata?.recordId as string | undefined;
  const changedColumnId = metadata?.columnId as string | undefined;

  if (!boardId || !recordId || !changedColumnId) return;

  // Load the board's columns
  const columnsResult = await columnRepo.findByBoard(boardId);
  if (!columnsResult.data) return;
  const columns = columnsResult.data;

  // Build the dependency graph for this board
  const derivedConfigs = extractDerivedColumnConfigs(columns);
  const graph = buildDependencyGraph({ columns, derivedConfigs });

  // Find all downstream columns that depend on the changed column
  const affected = traverseDownstream(graph, changedColumnId);

  // Process in dependency order (no cycles — guaranteed by config-time check)
  for (const { node } of affected) {
    const column = columns.find((c) => c.id === node.columnId);
    if (!column) continue;

    try {
      await recomputeDerivedValue(
        scope.organizationId,
        scope.workspaceId,
        boardId,
        recordId,
        column,
      );
    } catch (error) {
      console.error(
        `[ConnectedData] Failed to recompute ${column.type} column ${column.id}:`,
        error,
      );
    }
  }
}

/**
 * Recompute a single derived column value for a given record.
 */
async function recomputeDerivedValue(
  organizationId: string,
  workspaceId: string,
  boardId: string,
  recordId: string,
  column: ColumnDefinition,
): Promise<void> {
  let value: ColumnValue = null;

  switch (column.type) {
    case "mirror": {
      const result = await MirrorService.resolve(
        organizationId,
        workspaceId,
        boardId,
        recordId,
        column,
      );
      value = result.data;
      break;
    }
    case "lookup": {
      const result = await LookupService.resolve(
        organizationId,
        workspaceId,
        boardId,
        recordId,
        column,
      );
      value = result.data;
      break;
    }
    case "rollup": {
      const result = await RollupService.resolve(
        organizationId,
        workspaceId,
        boardId,
        recordId,
        column,
      );
      value = result.data;
      break;
    }
    case "formula": {
      // Build evaluation context from resolved values
      const resolvedValues = await buildFormulaContext(
        organizationId,
        workspaceId,
        boardId,
        recordId,
        column,
      );
      value = FormulaEngine.evaluate(
        (column.settings?.expression as string) ?? "",
        resolvedValues,
      );
      break;
    }
    default:
      return; // Not a derived column type
  }

  // Store the computed value in the derived_values table
  const now = new Date().toISOString();
  const derivedId = `${boardId}:${recordId}:${column.id}`;
  const valueText = typeof value === "string"
    ? value
    : JSON.stringify(value);

  await cellRepo.upsertMany([
    {
      id: derivedId,
      organization_id: organizationId,
      workspace_id: workspaceId,
      board_id: boardId,
      record_id: recordId,
      column_id: column.id,
      value: value,
      value_text: valueText,
      updated_at: now,
    },
  ]);

  // Update cache
  DerivedValueCache.set(recordId, column.id, value);

  // Publish domain-specific event
  const eventName = `${column.type}.recompute:after` as const;
  await eventBus.publish({
    eventId: crypto.randomUUID(),
    eventName,
    timestamp: now,
    actorUserId: "system",
    scope: { organizationId, workspaceId, boardId },
    before: null,
    after: { value, columnId: column.id, recordId },
    metadata: { columnId: column.id, recordId, columnType: column.type },
  });
}

/**
 * Build a Formula evaluation context for a record.
 * Resolves all dependencies of the formula column.
 */
async function buildFormulaContext(
  organizationId: string,
  workspaceId: string,
  boardId: string,
  recordId: string,
  formulaColumn: ColumnDefinition,
): Promise<{ recordValues: Record<string, ColumnValue>; today: string; now: string }> {
  const recordValues: Record<string, ColumnValue> = {};
  const settings = formulaColumn.settings ?? {};
  const dependencyColumnIds = (settings.dependencyColumnIds ?? []) as string[];

  // Load all cell values for this record
  const cellResult = await cellRepo.findByRecord(recordId);
  if (cellResult.data) {
    for (const cell of cellResult.data) {
      recordValues[cell.columnId] = cell.value;
      // Also index by column key for formula references
      recordValues[cell.columnId] = cell.value;
    }
  }

  // Also add the record title
  const recordResult = await recordRepo.findById(recordId);
  if (recordResult.data) {
    recordValues["title"] = recordResult.data.title;
  }

  // Resolve any derived dependencies (mirror/lookup/rollup referenced by formula)
  for (const depColumnId of dependencyColumnIds) {
    if (recordValues[depColumnId] !== undefined) continue;

    // Try to resolve it as a derived value
    const depColumn = await columnRepo.findById(depColumnId);
    if (depColumn.data) {
      const derivedResult = await recomputeDerivedValue(
        organizationId,
        workspaceId,
        boardId,
        recordId,
        depColumn.data,
      );
      // derivedResult is void — value is stored in cell_values
      // Read it back
      const cell = await cellRepo.findByRecordAndColumn(recordId, depColumnId);
      if (cell.data) {
        recordValues[depColumnId] = cell.data.value;
      }
    }
  }

  return {
    recordValues,
    today: new Date().toISOString().split("T")[0],
    now: new Date().toISOString(),
  };
}

// ── Subscription Registration ───────────────────────────────

/**
 * Initialize all Connected Data event subscriptions.
 * Call once during application startup alongside initializeActivityLogging().
 */
export function initializeConnectedDataSubscribers(): () => void {
  const unsubscribers: Array<() => void> = [];

  // Listen for cell value changes → trigger derived column recomputation
  const cellUpdateSub: EventSubscription = {
    name: "connected-data:cell-update",
    priority: 200, // After activity logging (100)
    async: true,
    handler: handleCellUpdate,
  };

  unsubscribers.push(
    eventBus.subscribe("cell.update:after", cellUpdateSub),
  );

  // Listen for relationship changes → invalidate caches
  const relationshipChangeSub: EventSubscription = {
    name: "connected-data:relationship-change",
    priority: 150,
    async: true,
    handler: async (payload: DomainEventPayload) => {
      const boardId = payload.scope.boardId;
      if (boardId) {
        metadataCache.invalidate("relationship", boardId);
        metadataCache.invalidate("dependencyGraph", boardId);
      }
    },
  };

  unsubscribers.push(
    eventBus.subscribe("relationship.create:after", relationshipChangeSub),
  );
  unsubscribers.push(
    eventBus.subscribe("relationship.delete:after", relationshipChangeSub),
  );
  unsubscribers.push(
    eventBus.subscribe("relationship.update:after", relationshipChangeSub),
  );

  // Return cleanup function
  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
}

