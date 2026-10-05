/**
 * Connected Data — Dependency Graph
 *
 * Unified dependency graph covering ALL derived column types:
 * Mirror, Lookup, Rollup, Formula, and future types (AI, Automation, etc.).
 *
 * ── Design Decision ─────────────────────────────────────────
 * One graph, not five. Every dependency in the system is represented here:
 *   Production.Status → Mirror → Lookup → Rollup → Formula → Dashboard KPI → AI Insight
 *
 * This makes Automations, AI, and Analytics much easier later without
 * requiring another architectural rewrite.
 * ────────────────────────────────────────────────────────────
 */

import type {
  DependencyGraphNode,
  DependencyType,
  CycleDetectionResult,
} from "./types";
import type { ColumnDefinition } from "../types";

// ── Graph Builder ───────────────────────────────────────────

export interface GraphBuildInput {
  columns: ColumnDefinition[];
  /** Derived column configs — extracted from column.settings */
  derivedConfigs: Array<{
    columnId: string;
    type: DependencyType;
    dependencyColumnIds: string[];
    dependencyBoardIds: string[];
  }>;
}

/**
 * Build the complete dependency graph for a board.
 * This replaces the legacy buildColumnDependencyGraph in ../dependency-graph.ts
 * by adding cross-board relationship dependencies.
 */
export function buildDependencyGraph(input: GraphBuildInput): Map<string, DependencyGraphNode> {
  const graph = new Map<string, DependencyGraphNode>();

  // Initialize all columns as nodes
  for (const column of input.columns) {
    graph.set(column.id, {
      columnId: column.id,
      boardId: column.boardId,
      dependsOn: [],
      dependents: [],
    });
  }

  // Add edges from derived column configs
  for (const config of input.derivedConfigs) {
    const node = graph.get(config.columnId);
    if (!node) continue;

    for (const depColumnId of config.dependencyColumnIds) {
      // Add forward dependency
      node.dependsOn.push({
        columnId: depColumnId,
        boardId: config.dependencyBoardIds[0] ?? node.boardId,
        type: config.type,
      });

      // Add reverse dependent
      const depNode = graph.get(depColumnId);
      if (depNode) {
        depNode.dependents.push({
          columnId: config.columnId,
          boardId: node.boardId,
          type: config.type,
        });
      }
    }
  }

  return graph;
}

// ── Extract Dependency IDs from Column Configs ─────────────

/**
 * Extract dependency column IDs from a column's settings.
 * This is how we determine which columns a derived column depends on,
 * without knowing the specific derived type.
 */
export function extractDependencyIdsFromSettings(
  column: ColumnDefinition,
): string[] {
  const settings = column.settings ?? {};
  const deps: string[] = [];

  switch (column.type) {
    case "mirror": {
      // Mirror depends on the target column of the relationship
      const config = settings as { source_connect_column_id?: string; mirrored_column_id?: string };
      if (config.mirrored_column_id) deps.push(config.mirrored_column_id);
      break;
    }
    case "lookup": {
      // Lookup depends on the final hop's target column
      const config = settings as { targetColumnId?: string };
      if (config.targetColumnId) deps.push(config.targetColumnId);
      break;
    }
    case "rollup": {
      // Rollup depends on the target column for value extraction
      const config = settings as { targetColumnId?: string };
      if (config.targetColumnId) deps.push(config.targetColumnId);
      break;
    }
    case "formula": {
      // Formula explicitly lists its dependencies
      const config = settings as { dependencyColumnIds?: string[] };
      if (config.dependencyColumnIds) deps.push(...config.dependencyColumnIds);
      break;
    }
    case "connected_board": {
      // Connected Board itself doesn't have column dependencies,
      // but Mirror/Lookup/Rollup that reference it do.
      break;
    }
    default:
      break;
  }

  return deps;
}

// ── Extract Full Dependency Configs for a Board ────────────

export interface DerivedColumnConfig {
  columnId: string;
  type: DependencyType;
  dependencyColumnIds: string[];
  dependencyBoardIds: string[];
}

/**
 * Scan all columns on a board and extract derived column configs.
 * Used at board load time to build/rebuild the dependency graph.
 */
export function extractDerivedColumnConfigs(
  columns: ColumnDefinition[],
): DerivedColumnConfig[] {
  const configs: DerivedColumnConfig[] = [];

  for (const column of columns) {
    const type = mapColumnTypeToDependencyType(column.type);
    if (!type) continue;

    const dependencyColumnIds = extractDependencyIdsFromSettings(column);
    const dependencyBoardIds = extractDependencyBoardIds(column);

    configs.push({
      columnId: column.id,
      type,
      dependencyColumnIds,
      dependencyBoardIds,
    });
  }

  return configs;
}

function mapColumnTypeToDependencyType(type: string): DependencyType | null {
  switch (type) {
    case "mirror": return "mirror";
    case "lookup": return "lookup";
    case "rollup": return "rollup";
    case "formula": return "formula";
    case "connected_board": return "reference";
    default: return null;
  }
}

function extractDependencyBoardIds(column: ColumnDefinition): string[] {
  const settings = column.settings ?? {};
  const boardIds: string[] = [];

  // Mirror and Rollup reference the connected column which determines the board
  const config = settings as {
    targetBoardId?: string;
    hops?: Array<{ targetBoardId?: string }>;
  };

  if (config.targetBoardId) boardIds.push(config.targetBoardId);
  if (config.hops) {
    for (const hop of config.hops) {
      if (hop.targetBoardId) boardIds.push(hop.targetBoardId);
    }
  }

  return boardIds;
}

// ── Cycle Detection ─────────────────────────────────────────

/**
 * Detect cycles in the dependency graph.
 * Called at config time (when a user adds/edits a derived column),
 * NEVER at runtime. This prevents circular Mirror/Lookup/Rollup/Formula chains
 * before they can cause infinite recomputation loops.
 */
export function detectCycles(
  graph: Map<string, DependencyGraphNode>,
): CycleDetectionResult {
  const cycles: Array<{ path: string[]; description: string }> = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(columnId: string, path: string[]): void {
    if (visiting.has(columnId)) {
      const cycleStart = path.indexOf(columnId);
      if (cycleStart >= 0) {
        const cyclePath = path.slice(cycleStart).concat(columnId);
        cycles.push({
          path: cyclePath,
          description: `Circular dependency detected: ${cyclePath.join(" → ")}`,
        });
      }
      return;
    }

    if (visited.has(columnId)) return;

    visiting.add(columnId);
    visited.add(columnId);

    const node = graph.get(columnId);
    if (node) {
      for (const dep of node.dependsOn) {
        visit(dep.columnId, [...path, dep.columnId]);
      }
    }

    visiting.delete(columnId);
  }

  for (const columnId of graph.keys()) {
    visit(columnId, [columnId]);
  }

  return {
    hasCycle: cycles.length > 0,
    cycles,
  };
}

// ── Topological Sort (Recalculation Order) ─────────────────

/**
 * Get the dependency-respecting order for recalculation.
 * Returns column IDs in topologically sorted order (dependencies first).
 * Throws if a cycle is detected.
 */
export function getRecalculationOrder(
  graph: Map<string, DependencyGraphNode>,
): string[] {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(columnId: string): void {
    if (visited.has(columnId)) return;
    if (visiting.has(columnId)) {
      throw new Error(
        `Cycle detected in dependency graph at column ${columnId}. ` +
        `Cannot determine recalculation order.`,
      );
    }

    visiting.add(columnId);

    const node = graph.get(columnId);
    if (node) {
      for (const dep of node.dependsOn) {
        visit(dep.columnId);
      }
    }

    visiting.delete(columnId);
    visited.add(columnId);
    sorted.push(columnId);
  }

  for (const columnId of graph.keys()) {
    visit(columnId);
  }

  return sorted;
}

// ── Traversal API (for future Automation/AI/Query engines) ─

export interface DependencyTraversalResult {
  node: DependencyGraphNode;
  depth: number;
}

/**
 * Walk the dependency graph upstream (toward dependencies).
 * Generic enough for Automation Engine, AI Query Layer, and Analytics Studio
 * to consume without changes to this layer.
 */
export function traverseUpstream(
  graph: Map<string, DependencyGraphNode>,
  startColumnId: string,
  maxDepth = 10,
): DependencyTraversalResult[] {
  const results: DependencyTraversalResult[] = [];
  const visited = new Set<string>();

  function walk(columnId: string, depth: number): void {
    if (depth > maxDepth || visited.has(columnId)) return;
    visited.add(columnId);

    const node = graph.get(columnId);
    if (!node) return;

    results.push({ node, depth });

    for (const dep of node.dependsOn) {
      walk(dep.columnId, depth + 1);
    }
  }

  walk(startColumnId, 0);
  return results;
}

/**
 * Walk the dependency graph downstream (toward dependents).
 * Generic enough for the cached invalidation system.
 */
export function traverseDownstream(
  graph: Map<string, DependencyGraphNode>,
  startColumnId: string,
  maxDepth = 10,
): DependencyTraversalResult[] {
  const results: DependencyTraversalResult[] = [];
  const visited = new Set<string>();

  function walk(columnId: string, depth: number): void {
    if (depth > maxDepth || visited.has(columnId)) return;
    visited.add(columnId);

    const node = graph.get(columnId);
    if (!node) return;

    results.push({ node, depth });

    for (const dep of node.dependents) {
      walk(dep.columnId, depth + 1);
    }
  }

  walk(startColumnId, 0);
  return results;
}

// ── Impact Analysis ─────────────────────────────────────────

export interface DeleteImpact {
  blockedBy: string[];
  dependents: Array<{ columnId: string; boardId: string; type: DependencyType }>;
}

/**
 * Analyze the impact of deleting a column.
 * Returns what blocks the deletion and what would be affected downstream.
 */
export function analyzeDeleteImpact(
  graph: Map<string, DependencyGraphNode>,
  columnId: string,
): DeleteImpact {
  const node = graph.get(columnId);
  if (!node) {
    return { blockedBy: [], dependents: [] };
  }

  return {
    blockedBy: node.dependsOn.map((d) => d.columnId),
    dependents: node.dependents.map((d) => ({
      columnId: d.columnId,
      boardId: d.boardId,
      type: d.type,
    })),
  };
}

