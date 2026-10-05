import type { ColumnDependency, ColumnDefinition } from "./types";

export interface DependencyGraphNode {
  columnId: string;
  dependsOn: string[];
  dependents: string[];
}

export function buildColumnDependencyGraph(columns: ColumnDefinition[], dependencies: ColumnDependency[]): Map<string, DependencyGraphNode> {
  const graph = new Map<string, DependencyGraphNode>();

  for (const column of columns) {
    graph.set(column.id, { columnId: column.id, dependsOn: [], dependents: [] });
  }

  for (const dependency of dependencies) {
    const source = graph.get(dependency.sourceColumnId);
    const target = graph.get(dependency.targetColumnId);

    if (source) {
      source.dependsOn.push(dependency.targetColumnId);
    }

    if (target) {
      target.dependents.push(dependency.sourceColumnId);
    }
  }

  return graph;
}

export function detectCircularDependencies(graph: Map<string, DependencyGraphNode>): string[][] {
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(columnId: string, path: string[]): void {
    if (visiting.has(columnId)) {
      const cycleStart = path.indexOf(columnId);
      if (cycleStart >= 0) {
        cycles.push(path.slice(cycleStart).concat(columnId));
      }
      return;
    }

    if (visited.has(columnId)) {
      return;
    }

    visited.add(columnId);
    visiting.add(columnId);

    const node = graph.get(columnId);
    if (node) {
      for (const dependency of node.dependsOn) {
        visit(dependency, [...path, dependency]);
      }
    }

    visiting.delete(columnId);
  }

  for (const columnId of graph.keys()) {
    visit(columnId, [columnId]);
  }

  return cycles;
}

export function collectSafeDeleteImpact(columnId: string, graph: Map<string, DependencyGraphNode>): { blockedBy: string[]; dependents: string[] } {
  const node = graph.get(columnId);
  if (!node) {
    return { blockedBy: [], dependents: [] };
  }

  return {
    blockedBy: node.dependsOn,
    dependents: node.dependents,
  };
}
