import { initializeActivityLogging } from "./activity-log-subscriber";

export type {
  DomainEntity,
  DomainAction,
  EventPhase,
  DomainEventName,
  DomainEventPayload,
  EventSubscriber,
  EventSubscription,
  EventBus,
} from "./event-types";

export { eventBus } from "./event-bus";
export { initializeActivityLogging } from "./activity-log-subscriber";

// Initialize activity log subscribers once at module load so that
// record.create:after, record.update:after, etc. events are written
// to the activity_logs table.
initializeActivityLogging();


