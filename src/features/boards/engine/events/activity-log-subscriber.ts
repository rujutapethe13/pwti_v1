/**
 * Activity Log Subscriber
 *
 * Generic entity-based activity logging via the Event Bus.
 * Automatically generates Activity Log entries for every CRUD mutation.
 *
 * This subscriber listens to all `*.create:after`, `*.update:after`,
 * `*.archive:after`, `*.restore:after`, `*.delete:after` events and
 * writes structured log entries.
 *
 * ── Future Extensions ──────────────────────────────────────
 * The same pattern can be used for:
 * - Realtime: Broadcast changes to connected clients
 * - Notifications: Alert users about relevant changes
 * - Automations: Trigger workflow rules
 * - AI: Feed changes to AI assistant context
 * ────────────────────────────────────────────────────────────
 */

import type { DomainEventPayload, EventSubscription } from "./event-types";
import { ActivityLogRepository } from "../repository/activity-log-repository";
import { eventBus } from "./event-bus";

const logRepository = new ActivityLogRepository();

function createLogHandler(
  actionPrefix: string,
): EventSubscription["handler"] {
  return async (payload: DomainEventPayload) => {
    const entity = payload.eventName.split(".")[0];
    const action = `${entity}.${actionPrefix}`;

    // Never let a logging failure break the mutation that triggered it.
    try {
      await logRepository.create({
        id: crypto.randomUUID(),
        organizationId: payload.scope.organizationId,
        workspaceId: payload.scope.workspaceId,
        boardId: payload.scope.boardId,
        recordId: payload.scope.boardId && payload.metadata?.entityId
          ? String(payload.metadata.entityId)
          : undefined,
        actorUserId: payload.actorUserId,
        action,
        payload: {
          eventId: payload.eventId,
          entityId: payload.metadata?.entityId ?? null,
          before: payload.before,
          after: payload.after,
          summary: payload.metadata?.summary ?? "",
          details: payload.metadata,
        },
        createdAt: payload.timestamp,
      });
    } catch (err) {
      console.error(`[ActivityLog] Failed to write "${action}" entry:`, err);
    }
  };
}

// ── Subscription Definitions ───────────────────────────────

const createSubscription = (action: string): EventSubscription => ({
  name: `activity-log:${action}`,
  priority: 100,
  // Awaited, not fire-and-forget: the Activity feed must show the entry as
  // soon as the originating mutation returns, without a manual reload.
  async: false,
  handler: createLogHandler(action),
});

// ── Register Subscriptions ────────────────────────────────

const afterEvents = [
  "create:after",
  "update:after",
  "rename:after",
  "duplicate:after",
  "archive:after",
  "restore:after",
  "delete:after",
  "reorder:after",
  "move:after",
  "favorite:after",
] as const;

const entities = [
  "board",
  "group",
  "column",
  "record",
  "cell",
  "view",
  "relationship",
] as const;

/**
 * Initialize all activity log subscriptions.
 * Call once during application startup.
 */
let initialized = false;

export function initializeActivityLogging(): () => void {
  if (initialized) return () => {};
  initialized = true;

  const unsubscribers: Array<() => void> = [];

  for (const entity of entities) {
    for (const event of afterEvents) {
      const eventName = `${entity}.${event}` as const;
      const action = event.replace(":after", "");

      unsubscribers.push(
        eventBus.subscribe(eventName, createSubscription(action)),
      );
    }
  }

  // Return a function to unsubscribe all (for testing / cleanup)
  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
}

