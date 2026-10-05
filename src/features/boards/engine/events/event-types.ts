/**
 * Domain Event Types
 *
 * All CRUD mutations publish domain events through the Event Bus.
 * Subscribers (Activity Log, Realtime, Notifications, Automations, AI)
 * react to these events without modifying CRUD logic.
 *
 * ── Event Naming Convention ─────────────────────────────────
 *   {Entity}.{Action}:{Status}
 *
 *   Examples:
 *     "board.created:after"
 *     "record.updated:before"
 *     "column.deleted:after"
 * ────────────────────────────────────────────────────────────
 */

import type { PermissionScope } from "../types";

// ── Event Identity ──────────────────────────────────────────

export type DomainEntity =
  | "board"
  | "group"
  | "column"
  | "record"
  | "cell"
  | "view"
  | "attachment"
  | "comment"
  | "relationship"
  | "mirror"
  | "lookup"
  | "rollup"
  | "formula";

export type DomainAction =
  | "create"
  | "update"
  | "rename"
  | "duplicate"
  | "archive"
  | "restore"
  | "delete"
  | "reorder"
  | "move"
  | "collapse"
  | "favorite"
  | "pin"
  | "hide"
  | "freeze"
  | "change_type"
  | "bulk_create"
  | "bulk_update"
  | "bulk_delete"
  | "link"
  | "unlink"
  | "recompute"
  | "update_options"
  | "update:color"
  | "update:statusOptions";

export type EventPhase = "before" | "after";

export type DomainEventName = `${DomainEntity}.${DomainAction}:${EventPhase}`;

// ── Event Payload ───────────────────────────────────────────

export interface DomainEventPayload {
  /** Unique event ID for deduplication */
  eventId: string;

  /** Fully qualified event name */
  eventName: DomainEventName;

  /** When the event was published */
  timestamp: string;

  /** Actor (user ID) who performed the mutation */
  actorUserId: string;

  /** Scoping context for permission checks */
  scope: PermissionScope;

  /** The entity state before the mutation (null for creates) */
  before: Record<string, unknown> | null;

  /** The entity state after the mutation (null for deletes) */
  after: Record<string, unknown> | null;

  /** Additional context (e.g., diff summary, affected children) */
  metadata: Record<string, unknown>;
}

// ── Event Subscription ─────────────────────────────────────

export type EventSubscriber = (
  payload: DomainEventPayload,
) => Promise<void> | void;

export interface EventSubscription {
  /** Subscriber name (for diagnostics) */
  name: string;

  /** Subscriber priority (higher = executed first) */
  priority: number;

  /** Whether this subscriber is async (fire-and-forget) */
  async: boolean;

  /** The handler function */
  handler: EventSubscriber;
}

// ── Event Bus Interface ─────────────────────────────────────

export interface EventBus {
  publish(event: DomainEventPayload): Promise<void>;

  subscribe(
    eventName: DomainEventName,
    subscription: EventSubscription,
  ): () => void;

  subscribeMany(
    eventNames: DomainEventName[],
    subscription: EventSubscription,
  ): () => void;

  /** Remove all subscriptions (testing / teardown) */
  clear(): void;
}

