import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { searchClient360 } from "@/features/client-360/search-service";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "B";

  // Direct database check: what boards exist?
  const supabase = await createClient(await cookies());
  const boardCheck = await supabase.from("boards").select("id, name, workspace_id, status").neq("status", "archived").limit(20);
  const columnCheck = await supabase.from("columns").select("id, board_id, label, type").limit(100);
  const cellCheck = await supabase.from("cell_values").select("record_id, column_id, value, value_text").limit(200);

  // Run the actual search with debug
  const result = await searchClient360(query, { debug: true });

  return NextResponse.json({
    query,
    directQuery: {
      boards: boardCheck.data,
      boardsError: boardCheck.error,
      columns: columnCheck.data,
      columnsError: columnCheck.error,
      cellValues: cellCheck.data,
      cellValuesError: cellCheck.error,
    },
    searchResult: {
      totalItems: result.totalItems,
      matches: result.matches.slice(0, 5),
      workspacesMatched: result.workspacesMatched,
      boardsMatched: result.boardsMatched,
    },
  });
}
