/**
 * Event Bus
 *
 * Typed publish/subscribe event bus for domain events.
 * All CRUD mutations publish events through this bus.
 * Subscribers (Activity Logs, Realtime, Notifications, Automations, AI)
 * are completely decoupled from the CRUD logic.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   import { eventBus } from "./events/event-bus";
 *
 *   // Publish an event after creating a record
 *   await eventBus.publish({
 *     eventId: crypto.randomUUID(),
 *     eventName: "record.created:after",
 *     timestamp: new Date().toISOString(),
 *     actorUserId: "user-123",
 *     scope: { organizationId: "org-1", workspaceId: "ws-1", boardId: "board-1" },
 *     before: null,
 *     after: { id: "record-1", title: "New Record", ... },
 *     metadata: {},
 *   });
 *
 *   // Subscribe to record-created events
 *   const unsubscribe = eventBus.subscribe("record.created:after", {
 *     name: "activity-logger",
 *     priority: 100,
 *     async: true,
 *     handler: async (payload) => { console.log(payload); },
 *   });
 * ────────────────────────────────────────────────────────────
 */

import type {
  DomainEventName,
  DomainEventPayload,
  EventBus,
  EventSubscription,
} from "./event-types";

class DefaultEventBus implements EventBus {
  private subscribers = new Map<DomainEventName, EventSubscription[]>();
  private isPublishing = false;

  async publish(event: DomainEventPayload): Promise<void> {
    const subscriptions = this.subscribers.get(event.eventName) ?? [];
    const wildcardSubscriptions = this.subscribers.get("*" as DomainEventName) ?? [];

    const allSubscriptions = [...subscriptions, ...wildcardSubscriptions]
      .sort((a, b) => b.priority - a.priority);

    if (allSubscriptions.length === 0) {
      return;
    }

    this.isPublishing = true;

    try {
      // Run synchronous subscribers in order
      for (const sub of allSubscriptions) {
        if (!sub.async) {
          await sub.handler(event);
        }
      }

      // Fire-and-forget async subscribers
      const asyncPromises = allSubscriptions
        .filter((sub) => sub.async)
        .map((sub) =>
          Promise.resolve(sub.handler(event)).catch((err: unknown) => {
            console.error(`[EventBus] Async subscriber "${sub.name}" failed:`, err);
          }),
        );

      if (asyncPromises.length > 0) {
        Promise.all(asyncPromises).catch((err) => {
          console.error("[EventBus] Async subscriber batch failed:", err);
        });
      }
    } finally {
      this.isPublishing = false;
    }
  }

  subscribe(
    eventName: DomainEventName,
    subscription: EventSubscription,
  ): () => void {
    const existing = this.subscribers.get(eventName) ?? [];
    existing.push(subscription);
    this.subscribers.set(eventName, existing);

    // Return unsubscribe function
    return () => {
      const current = this.subscribers.get(eventName) ?? [];
      this.subscribers.set(
        eventName,
        current.filter((s) => s !== subscription),
      );
    };
  }

  subscribeMany(
    eventNames: DomainEventName[],
    subscription: EventSubscription,
  ): () => void {
    const unsubscribers = eventNames.map((eventName) =>
      this.subscribe(eventName, { ...subscription }),
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }

  clear(): void {
    this.subscribers.clear();
  }
}

// Singleton instance
export const eventBus: EventBus = new DefaultEventBus();

