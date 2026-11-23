"use server";

import { revalidatePath } from "next/cache";

import { getUserOrganizationId } from "@/lib/organization";
import { createServiceClient } from "@/lib/supabase/server";

export interface SaveDateMappingInput {
  boardId: string;
  uploadColumnId: string | null;
  receiveColumnId: string | null;
}

export interface SaveDateMappingResult {
  success: boolean;
  error: string | null;
}

/**
 * Persist a per-board override for the Upload date and Received date columns.
 *
 * Each field is written to `client_360_field_mappings` as a `manual_override`
 * row (upload_date / receive_date). Passing `null` clears the override so the
 * dashboard falls back to auto-detection again. Because the unique key is
 * (board_id, field_type), an upsert replaces any prior row for that field.
 */
export async function saveBoardDateMapping(
  input: SaveDateMappingInput,
): Promise<SaveDateMappingResult> {
  const organizationId = await getUserOrganizationId();
  if (!organizationId) {
    return { success: false, error: "Unable to determine organization." };
  }
  if (!input.boardId) {
    return { success: false, error: "No board selected." };
  }

  const supabase = await createServiceClient();

  // Verify the board belongs to this organization before writing.
  const { data: board, error: boardErr } = await supabase
    .from("boards")
    .select("id,organization_id")
    .eq("id", input.boardId)
    .maybeSingle();
  if (boardErr) return { success: false, error: boardErr.message };
  if (!board || String(board.organization_id) !== organizationId) {
    return { success: false, error: "Board not found in this workspace." };
  }

  const writes: Array<{
    board_id: string;
    organization_id: string;
    field_type: string;
    resolved_column_ref: string;
    source: string;
    confidence: number;
  }> = [];

  const upsertField = async (
    fieldType: string,
    columnId: string | null,
  ): Promise<string | null> => {
    if (columnId) {
      // Confirm the column is on this board before storing it.
      const { data: col } = await supabase
        .from("columns")
        .select("id,board_id")
        .eq("id", columnId)
        .eq("board_id", input.boardId)
        .maybeSingle();
      if (!col) return `Selected ${fieldType} column is not on this board.`;
      writes.push({
        board_id: input.boardId,
        organization_id: organizationId,
        field_type: fieldType,
        resolved_column_ref: columnId,
        source: "manual_override",
        confidence: 1,
      });
      return null;
    }
    // Clear any existing override for this field on this board.
    await supabase
      .from("client_360_field_mappings")
      .delete()
      .eq("board_id", input.boardId)
      .eq("organization_id", organizationId)
      .eq("field_type", fieldType)
      .eq("source", "manual_override");
    return null;
  };

  const uploadErr = await upsertField("upload_date", input.uploadColumnId);
  if (uploadErr) return { success: false, error: uploadErr };
  const receiveErr = await upsertField("receive_date", input.receiveColumnId);
  if (receiveErr) return { success: false, error: receiveErr };

  if (writes.length > 0) {
    const { error } = await supabase
      .from("client_360_field_mappings")
      .upsert(writes, { onConflict: "board_id,field_type" });
    if (error) return { success: false, error: error.message };
  }

  revalidatePath("/account/settings/date-mappings");
  revalidatePath("/");
  return { success: true, error: null };
}