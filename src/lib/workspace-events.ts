export type WorkspaceEventType =
  | "workspace:switched"
  | "workspace:created"
  | "workspace:renamed"
  | "workspace:deleted"
  | "board:favorite:toggled"
  | "favorites:updated";

export interface WorkspaceEvent {
  type: WorkspaceEventType;
  payload?: Record<string, unknown>;
}

const listeners = new Set<(event: WorkspaceEvent) => void>();

export function publishWorkspaceUpdate(event: WorkspaceEvent) {
  listeners.forEach((fn) => fn(event));
}

export function subscribeWorkspaceUpdates(fn: (event: WorkspaceEvent) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
