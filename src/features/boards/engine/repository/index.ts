/**
 * Repository Layer — Barrel Export
 *
 * All database access classes. Services depend on repositories,
 * not directly on Supabase.
 */

export { BaseRepository } from "./base-repository";
export type { RepositoryOptions, DatabaseRow } from "./base-repository";

export { BoardRepository } from "./board-repository";
export { GroupRepository } from "./group-repository";
export { ColumnRepository } from "./column-repository";
export { RecordRepository } from "./record-repository";
export { CellRepository } from "./cell-repository";
export { ViewRepository } from "./view-repository";
export { ActivityLogRepository } from "./activity-log-repository";

