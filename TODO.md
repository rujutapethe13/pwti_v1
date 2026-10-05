# Powerweave Studio OS — Implementation Master TODO

## Architectural Commitments
- **One generic `relationships` table** (not per-type tables)
- **Derived values are cache** — Query Service can recompute on miss
- **One unified dependency graph** covering Mirror, Lookup, Rollup, Formula
- **Domain-specific event names** (RelationshipCreated, MirrorValueRecomputed, etc.)
- **RelationshipService** layer between Repository and Query Service
- **Formula Engine** receives resolved values through Query Service, never queries DB directly
- **Existing Metadata Cache** extended with `relationships`, `derivedValues`, `dependencyGraph`

## ✅ Connected Data Engine (COMPLETE)
### Phase 0: Foundation
- [x] **0.1** Migration SQL: `relationships`, `derived_values`, `dependency_graph_edges` tables with indexes + RLS
- [x] **0.2** Updated `cache-types.ts`: added `"relationship"`, `"derivedValue"`, `"dependencyGraph"` namespaces
- [x] **0.3** Updated `event-types.ts`: added domain entities `"relationship"`, `"mirror"`, `"lookup"`, `"rollup"`, `"formula"`
- [x] **0.4** Updated `activity-log-subscriber.ts`: added `"relationship"` to entities array
- [x] **0.5** Created `connected-data/types.ts`: full type definitions for Relationship, ConnectedBoardConfig, MirrorConfig, LookupConfig, RollupConfig, FormulaConfig
- [x] **0.6** Created `connected-data/relationship-repository.ts`: extends BaseRepository<Relationship>
- [x] **0.7** Updated `types.ts` + `column-registry.ts`: moved 5 types from "future" to proper configs with settings schemas

### Phase 1: Relationship Engine + Dependency Graph
- [x] **1.1** Created `connected-data/relationship-engine.ts`: full CRUD with delete rules (cascade/restrict/set-null)
- [x] **1.2** Created `connected-data/relationship-service.ts`: business logic layer between repo and services
- [x] **1.3** Created `connected-data/dependency-graph.ts`: unified graph with cycle detection + traversal API
- [x] **1.4** Created `connected-data/group-scoped-relationships.ts`: arbitrary configurable group scoping

### Phase 2: Event Bus + Recalculation Pipeline
- [x] **2.1** Created `connected-data/event-subscriber.ts`: subscribes to `cell.update:after`, traverses dependency graph, triggers recalculation
- [x] **2.2** Created `connected-data/mirror-service.ts`: resolve mirror with caching (DB trigger → event-bus subscriber → incremental)
- [x] **2.3** Created `connected-data/lookup-service.ts`: resolve lookup across relationship chains (single, multi, joined, array)
- [x] **2.4** Created `connected-data/rollup-service.ts`: aggregation (count, sum, avg, min, max, first, last, median, mode, count-empty, count-filled)
- [x] **2.5** Created `connected-data/formula-engine.ts`: full parser + evaluator with dependency extraction (18 operators, IF/AND/OR/NOT, TODAY/NOW, DATE_DIFF)

### Phase 3: Query Service Extension + Cache
- [x] **3.1** Created `connected-data/query-engine-extension.ts`: extends QueryService with relationship traversal, deep fetch, lazy eval
- [x] **3.2** Created `connected-data/cache.ts`: relationship + derived value caching via existing MetadataCache

### Phase 4: Column Config + Plugin Registration
- [x] **4.1** Updated `column-registry.ts`: settings schemas for connected_board, mirror, lookup, rollup, formula
- [x] **4.2** Created `connected-data/plugin-registrations.ts`: 5 plugin registrations via PluginRegistry (no switch/case)

### Phase 5: Cell Renderers
- [x] **5.1** Created `cell-renderers/connected-board-cell.tsx`: relationship picker UI with linked records display
- [x] **5.2** Created `cell-renderers/mirror-cell.tsx`: read-only mirror display with loading/error states
- [x] **5.3** Created `cell-renderers/lookup-cell.tsx`: read-only lookup display
- [x] **5.4** Created `cell-renderers/rollup-cell.tsx`: read-only rollup display
- [x] **5.5** Created `cell-renderers/formula-cell.tsx`: read-only formula display
- [x] **5.6** Registered all 5 renderers in `cell-renderers/index.ts`

### Phase 6: Relationship Picker UI
- [x] **6.1** Created `connected-data/relationship-picker.tsx`: search, infinite scroll, keyboard nav, quick-create, favorites, multi-select, record preview, deep links

### Phase 7: Integration + Barrel Exports
- [x] **7.1** Updated `index.ts` barrel: exports connected-data module
- [x] **7.2** Created `initializeConnectedDataEngine()` function for app startup
- [x] **7.3** App initialization path ready for subscriber registration

### Phase 8: Documentation
- [x] **8.1** README section: "How to Add a Sixth Derived-Column Type"

## ✅ Dashboard & Analytics Engine (COMPLETE)
### Contracts Layer
- [x] Created `src/lib/analytics/contracts.ts` — all type contracts with [ASSUMPTION] markers (15 sections)

### Dashboard Engine
- [x] Created `dashboard-engine/types.ts` — dashboard-specific types (Dashboard, WidgetInstance, etc.)
- [x] Created `dashboard-engine/layout-engine.ts` — react-grid-layout compatible multi-breakpoint layout management
- [x] Created `dashboard-engine/filter-engine.ts` — dashboard-level filtering + 12 date range presets
- [x] Created `dashboard-engine/dashboard-repository.ts` — data access layer (create, read, update, delete, reorder)
- [x] Created `dashboard-engine/dashboard-service.ts` — business logic (load, create, add/remove/move/resize widgets)
- [x] Created `dashboard-engine/index.ts` — barrel export

### Widget Registry
- [x] Created `widget-registry/widget-registry.ts` — plugin-based widget system (register, get, list, getRenderer)

### Widgets (6 concrete + 1 relationship)
- [x] KPI widget — with trend, change percentage, colored indicators
- [x] Chart widget — bar/line/area/pie stub (recharts integration point)
- [x] Table widget — inline scrollable data table
- [x] Progress widget — progress bar toward target
- [x] Markdown widget — rich text content display
- [x] Heatmap widget — row × column aggregation stub
- [x] Relationship widget — connected records display

## 📋 Verification Pending
- [ ] **9.1** Create Production board + Purchase Order board (test fixtures)
- [ ] **9.2** Add Connected Board column on Production linking to PO
- [ ] **9.3** Link a Production record to a PO record via Relationship Picker
- [ ] **9.4** Add Mirror column showing PO status; confirm live update
- [ ] **9.5** Add Lookup column resolving Vendor Name/GST through PO→Vendor
- [ ] **9.6** Add Rollup column summing Invoice totals per Production record
- [ ] **9.7** Add Formula column combining mirror + lookup + static value
- [ ] **9.8** Switch between Table, Kanban, Calendar views — all values correct
- [ ] **9.9** Page refresh — all relationships and derived values persist

## Future Milestones (Design Ready, Not Implemented)
- [ ] **Automation Engine** — Trigger/Action graph model over dependency graph
- [ ] **AI Assistant** — Natural language query over dependency graph + metadata
- [ ] **Realtime Collaboration** — WebSocket presence + live cursors
- [ ] **Analytics Studio** — Full charting with recharts library
- [ ] **Workflow Builder** — Visual workflow editor
- [ ] **External Integrations** — Slack, Google Drive, etc.
- [ ] **Template Marketplace** — Board template import/export
- [ ] **Public API** — REST/gRPC endpoints for board data
