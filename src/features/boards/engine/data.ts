// NOTE: This file uses demo data as fallback.
// The "server-only" guard is omitted because the barrel export
// (index.ts) is consumed by client components via navigation.ts.
// If server-side data loading is needed later, split into a separate
// module that is NOT re-exported from the barrel.

import { getDemoBoardPageData, type DemoBoardPageData } from "./demo-data";
import { loadBoardBySlug } from "./repository";

export async function loadBoardPageData(
  boardId: string,
  options?: {
    recordLimit?: number;
    recordOffset?: number;
  },
): Promise<DemoBoardPageData | undefined> {
  const fallback = getDemoBoardPageData(boardId);

  try {
    console.warn(`[loadBoardPageData] Loading board "${boardId}" from database...`);
    const loaded = await loadBoardBySlug(boardId, options);

    if (!loaded) {
      console.warn(`[loadBoardPageData] Board "${boardId}" not found in DB, using ${fallback ? "demo fallback" : "no fallback"}`);
      return fallback;
    }

    console.warn(`[loadBoardPageData] Board "${boardId}" loaded from DB: ${loaded.columns.length} columns, ${loaded.records.length} records, ${loaded.views.length} views, ${loaded.groups.length} groups`);

    return {
      ...loaded,
      metrics: fallback?.metrics ?? loaded.metrics,
      views: loaded.views?.length ? loaded.views : fallback?.views ?? [],
    };
  } catch (error) {
    console.error(`[loadBoardPageData] Error loading board "${boardId}":`, error);
    return fallback;
  }
}