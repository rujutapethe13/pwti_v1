/**
 * Connected Data Engine — Barrel Export
 *
 * The Connected Data Engine sits between Board and View Engine:
 *   Board → Relationship Engine → Connected Records → Mirror Engine → Lookup Engine
 *         → Rollup Engine → Formula Engine → View Engine
 *
 * All exports are metadata-driven. No relationship type, board name,
 * or business logic is hardcoded anywhere in this layer.
 */

// ── Types ───────────────────────────────────────────────────
export * from "./types";

// ── Repository ──────────────────────────────────────────────
export { RelationshipRepository } from "./relationship-repository";

// ── Relationship Engine ─────────────────────────────────────
export { RelationshipEngine } from "./relationship-engine";
export type { CreateRelationshipInput, UpdateRelationshipInput } from "./relationship-engine";

// ── Group-Scoped Relationships ─────────────────────────────
export { GroupScopedRelationships } from "./group-scoped-relationships";

// ── Mirror Service ──────────────────────────────────────────
export { MirrorService } from "./mirror-service";

// ── Lookup Service ──────────────────────────────────────────
export { LookupService } from "./lookup-service";

// ── Rollup Service ──────────────────────────────────────────
export { RollupService } from "./rollup-service";

// ── Formula Engine ──────────────────────────────────────────
export { FormulaEngine } from "./formula-engine";
export type { FormulaToken, FormulaTokenType, AstNode, FormulaEvalContext } from "./formula-engine";

// ── Dependency Graph ────────────────────────────────────────
export {
  buildDependencyGraph,
  extractDependencyIdsFromSettings,
  extractDerivedColumnConfigs,
  detectCycles,
  getRecalculationOrder,
  traverseUpstream,
  traverseDownstream,
  analyzeDeleteImpact,
} from "./dependency-graph";
export type { GraphBuildInput, DerivedColumnConfig, DependencyTraversalResult, DeleteImpact } from "./dependency-graph";

// ── Cache ───────────────────────────────────────────────────
export { RelationshipCache, DerivedValueCache, DependencyGraphCache } from "./cache";

// ── Event Subscriber ────────────────────────────────────────
export { initializeConnectedDataSubscribers } from "./event-subscriber";

// ── Plugin Registrations ────────────────────────────────────
export {
  registerConnectedDataPlugins,
  connectedBoardPlugin,
  mirrorPlugin,
  lookupPlugin,
  rollupPlugin,
  formulaPlugin,
} from "./plugin-registrations";

// ── Query Engine Extension ──────────────────────────────────
export { ConnectedDataQueryExtension } from "./query-engine-extension";

