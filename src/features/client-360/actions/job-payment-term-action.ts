"use server";

import { getSessionIdentity } from "@/lib/rbac/resolve";
import { getUserOrganizationId } from "@/lib/organization";
import { createServiceClient } from "@/lib/supabase/server";
import { getLiveJobScope } from "../live-job-scope";
import { resolveClientGroup } from "../client-group";
import { isInvoicePending } from "../card-types";
import type { JobsDrawerBoard } from "../card-data";

async function requireAdmin(): Promise<
  | { ok: true; organizationId: string }
  | { ok: false; error: string }
> {
  const identity = await getSessionIdentity();
  if (!identity) return { ok: false, error: "Not authenticated" };
  if (identity.role !== "admin") return { ok: false, error: "Admin access required" };
  const organizationId = identity.organizationId || (await getUserOrganizationId());
  if (!organizationId) return { ok: false, error: "Unable to determine organization" };
  return { ok: true, organizationId };
}

function validateDays(days: number): string | null {
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    return "Payment term must be a whole number of days between 1 and 3650";
  }
  return null;
}

/** Boards for this client with a count of jobs not yet invoiced or paid. */
export async function getClientPendingBoardsAction(clientId: string): Promise<{
  ok: boolean;
  error?: string;
  boards: JobsDrawerBoard[];
  totalPending: number;
}> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return { ok: false, error: auth.error, boards: [], totalPending: 0 };

    const scope = await getLiveJobScope(auth.organizationId);
    const group = await resolveClientGroup(auth.organizationId, clientId);
    const clientJobs = scope.jobs.filter(
      (j) => j.client_id != null && group.ids.has(j.client_id),
    );

    const byBoard = new Map<string, JobsDrawerBoard>();
    for (const board of scope.boards) {
      byBoard.set(board.id, {
        boardId: board.id,
        boardName: board.name,
        jobCount: 0,
        pendingCount: 0,
      });
    }
    for (const job of clientJobs) {
      const entry =
        byBoard.get(job.board_id) ??
        {
          boardId: job.board_id,
          boardName: job.board_name,
          jobCount: 0,
          pendingCount: 0,
        };
      entry.jobCount += 1;
      if (isInvoicePending({ invoiceStatus: job.invoice_status })) {
        entry.pendingCount += 1;
      }
      byBoard.set(job.board_id, entry);
    }

    const boards = [...byBoard.values()]
      .filter((board) => board.jobCount > 0)
      .sort((a, b) => a.boardName.localeCompare(b.boardName));
    return {
      ok: true,
      boards,
      totalPending: boards.reduce((sum, board) => sum + board.pendingCount, 0),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load boards",
      boards: [],
      totalPending: 0,
    };
  }
}

/**
 * Apply a day count to every pending job on the selected boards for this
 * client only. Invoiced/paid jobs and unselected boards are untouched.
 */
export async function applyPaymentDaysToPendingJobsAction(input: {
  clientId: string;
  boardIds: string[];
  days: number;
}): Promise<{
  ok: boolean;
  error?: string;
  updated: number;
  boards: number;
  undo?: Array<{ recordId: string; previousDays: number | null }>;
}> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return { ok: false, error: auth.error, updated: 0, boards: 0 };
    const invalid = validateDays(input.days);
    if (invalid) return { ok: false, error: invalid, updated: 0, boards: 0 };
    if (!input.boardIds.length) {
      return { ok: false, error: "Select at least one board", updated: 0, boards: 0 };
    }

    const scope = await getLiveJobScope(auth.organizationId);
    const group = await resolveClientGroup(auth.organizationId, input.clientId);
    const selected = new Set(input.boardIds);
    const targets = scope.jobs.filter(
      (j) =>
        j.client_id != null &&
        group.ids.has(j.client_id) &&
        selected.has(j.board_id) &&
        isInvoicePending({ invoiceStatus: j.invoice_status }),
    );

    if (targets.length === 0) {
      return { ok: true, updated: 0, boards: input.boardIds.length };
    }

    const supabase = await createServiceClient();
    const ids = targets.map((j) => j.record_id);
    const chunkSize = 500;
    let updated = 0;
    const undo: Array<{ recordId: string; previousDays: number | null }> = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data: beforeRows, error: beforeError } = await supabase
        .from("records")
        .select("id, payment_term_days")
        .eq("organization_id", auth.organizationId)
        .in("id", chunk);
      if (beforeError) return { ok: false, error: beforeError.message, updated, boards: 0 };
      for (const row of beforeRows ?? []) {
        undo.push({
          recordId: String(row.id),
          previousDays: typeof row.payment_term_days === "number" ? row.payment_term_days : null,
        });
      }
      const { data, error } = await supabase
        .from("records")
        .update({ payment_term_days: input.days, updated_at: new Date().toISOString() })
        .eq("organization_id", auth.organizationId)
        .in("id", chunk)
        .select("id");
      if (error) return { ok: false, error: error.message, updated, boards: 0 };
      updated += data?.length ?? 0;
    }

    const { error: auditError } = await supabase.from("activity_logs").insert({
      organization_id: auth.organizationId,
      actor_user_id: (await getSessionIdentity())?.userId ?? null,
      action: "client.payment_terms_applied_to_jobs",
      payload: {
        client_id: input.clientId,
        board_ids: input.boardIds,
        days: input.days,
        updated_record_ids: ids,
      },
    });
    if (auditError) console.error("Failed to write payment-term application audit log:", auditError.message);

    return { ok: true, updated, boards: input.boardIds.length, undo };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to apply payment terms",
      updated: 0,
      boards: 0,
    };
  }
}

export async function undoPaymentDaysToPendingJobsAction(input: {
    records: Array<{ recordId: string; previousDays: number | null }>;
  }): Promise<{ ok: boolean; error?: string; updated: number }> {
    try {
      const auth = await requireAdmin();
      if (!auth.ok) return { ok: false, error: auth.error, updated: 0 };
      if (!input.records.length) return { ok: true, updated: 0 };

      const supabase = await createServiceClient();
      let updated = 0;
      for (const item of input.records) {
        const { data, error } = await supabase
          .from("records")
          .update({ payment_term_days: item.previousDays, updated_at: new Date().toISOString() })
          .eq("organization_id", auth.organizationId)
          .eq("id", item.recordId)
          .select("id");
        if (error) return { ok: false, error: error.message, updated };
        updated += data?.length ?? 0;
      }

      const { error: auditError } = await supabase.from("activity_logs").insert({
        organization_id: auth.organizationId,
        actor_user_id: (await getSessionIdentity())?.userId ?? null,
        action: "client.payment_terms_apply_undone",
        payload: { record_ids: input.records.map((item) => item.recordId) },
      });
      if (auditError) console.error("Failed to write payment-term undo audit log:", auditError.message);
      return { ok: true, updated };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to undo payment terms",
        updated: 0,
      };
  }
}

/** Per-job override. NULL clears the override so the job inherits the client term. */
export async function setJobPaymentTermAction(input: {
  recordId: string;
  days: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return { ok: false, error: auth.error };
    if (input.days != null) {
      const invalid = validateDays(input.days);
      if (invalid) return { ok: false, error: invalid };
    }

    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("records")
      .update({ payment_term_days: input.days, updated_at: new Date().toISOString() })
      .eq("organization_id", auth.organizationId)
      .eq("id", input.recordId)
      .select("id");

    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) return { ok: false, error: "Job not found" };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save job payment term",
    };
  }
}

