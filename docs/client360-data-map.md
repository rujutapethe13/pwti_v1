# Client 360 vs Cross-Board — Data Map

## 1. Where status is calculated

- **Client 360 KPIs** — `src/features/client-360/constants.ts` → `normalizeStatus()` (maps raw status to Completed / In progress / QA / Review / Overdue / Not started / Other). Consumed in `src/features/client-360/search-service.ts` and `src/app/(app)/client-dashboard/page.tsx` (`bucketStatus` / `rgbHex`).
- **Cross-Board counts** — `src/app/(app)/client-dashboard/page.tsx` → `bucketStatus()` (substring-based, case-insensitive, looser mapping).

## 2. Client ↔ job matching

- **Client 360 (search tab):** free-text `ilike` across `cell_values.value_text` AND `records.title` (case-insensitive, with `'s`/`s`/apostrophe variations). `search-service.ts` `searchClient360()`.
- **Cross-Board / dashboard:** exact `clientName` equality from `getCellValue` labels (client/client name/customer/account). No case normalization; relies on stored cell value.

## 3. Separate queries & scope

- **Client 360 search:** `searchClient360()` — queries `cell_values` + `records` (title), excludes archived records, service client, all non-archived boards.
- **fetchAllClient360Data / dashboard:** `fetchAllClient360Data()` — loads all boards (non-archived), columns, records (non-archived), cells; no practice filter; no de-duplication beyond record-id set.

## 4. Raw status labels → mapping

Raw labels seen: Done, Completed, Complete, Finished, Closed, Resolved, Delivered (→Completed); Overdue, Blocked, Stuck, Delayed, At risk (→Overdue); In progress, Working on it, Started, Active, Queued (→In progress); Not started, Todo, Backlog, Pending, Open (→Not started); QA, In-qa, Testing (→QA); Review, In review (→Review). Client 360 uses `normalizeStatus` exact-key lookup (lowercased). Cross-Board uses substring `bucketStatus` (looser, e.g. "done" substring).

## 5. Why Client 360 shows Done 0 / In progress 2 for Hokipo while Cross-Board shows 9 completed

Client 360's `normalizeStatus` requires the raw value to exactly match a key after lowercasing. If Hokipo's board stores status as "Done" with extra whitespace/casing or a label not in the map (e.g. "Done ✅", "Completed - Delivered"), it falls to "Other" → Done 0. Cross-Board's substring `bucketStatus` catches "done"/"complete"/"delivered" substrings → 9 Completed. Also the two tabs run separate queries/scope (see §3), so row sets can differ.

## Recommended order of changes

1. Unify status mapping — make Cross-Board use `normalizeStatus` (or extend map with missing labels). Touch: `src/app/(app)/client-dashboard/page.tsx` (`bucketStatus`, `rgbHex`), `src/features/client-360/constants.ts`.
2. Normalize raw status at read time (trim/case) in both tabs. Touch: `search-service.ts`, `page.tsx`.
3. Align query scope & de-dup by record id in both tabs. Touch: `search-service.ts` (`searchClient360`, `fetchAllClient360Data`).
4. Add practice filter / archived handling parity. Touch: `search-service.ts`, dashboard filters.
5. Add tests for status mapping parity. Touch: `src/tests/unit/*`.
