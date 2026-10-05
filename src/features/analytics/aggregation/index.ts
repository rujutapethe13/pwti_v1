/**
 * Client Search Dashboard — Barrel Export
 *
 * NOTE: The aggregation-service is server-only and is NOT exported here
 * to prevent accidental client-side imports. Use the server action
 * (fetchClientSearchData) from ./actions instead.
 */

export { fetchClientSearchData } from "./actions";
export type {
  UnifiedDataset,
  UnifiedJobRow,
  DashboardFilters,
  ColumnTaxonomy,
  TaxonomyField,
  BoardColumnMap,
} from "./types";
