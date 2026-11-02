"use server";

import { cookies } from "next/headers";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getSessionIdentity } from "@/lib/rbac/resolve";
import {
  getUserWorkspaceAccess,
  workspaceRoleLabel,
} from "@/lib/workspace-access";

export interface OverviewBoard {
  id: string;
  name: string;
  slug: string;
  jobsPending: number;
  jobsInProgress: number;
  jobsDone: number;
  jobsTotal: number;
}

export interface OverviewMember {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
}

export interface OverviewActivity {
  id: string;
  action: string;
  title: string;
  detail: string;
  timestamp: string;
}

export interface OverviewData {
  workspace: {
    id: string;
    name: string;
    slug: string;
    role: string;
  };
  boards: OverviewBoard[];
  totalPending: number;
  members: OverviewMember[];
  activity: OverviewActivity[];
}

export interface OverviewResult {
  data: OverviewData | null;
  error: { message: string; status: number } | null;
}

const ACTIVITY_LIMIT = 10;

/**
 * Bucket a record's status into the overview's three status columns.
 * Status labels are configured per board (Not Started / Working on it /
 * Done …), so records are bucketed by the words stored in `records.status`.
 */
function bucketStatus(status: string | null): "pending" | "inProgress" | "done" {
  const s = (status ?? "").toLowerCase();
  if (s.includes("done")) return "done";
  if (
    s.includes("progres") ||
    s.includes("work") ||
    s === "active" ||
    (s.includes("start") && !s.includes("not"))
  ) {
    return "inProgress";
  }
  return "pending";
}

const actionTitle: Record<string, string> = {
  "record.create": "New job created",
  "record.update": "Job updated",
  "record.archive": "Job archived",
  "record.restore": "Job restored",
  "record.delete": "Job deleted",
  "record.duplicate": "Job duplicated",
  "record.rename": "Job renamed",
  "record.move": "Job moved",
  "cell.update": "Field updated",
  "board.create": "Board created",
  "board.update": "Board updated",
};

/**
 * Everything the Workspace Overview page needs in a single call:
 *
 * 1. the workspace row and the caller's role in it,
 * 2. every board in the workspace with aggregated job counts per status
 *    (one grouped pass over records, not one query per board),
 * 3. the member list,
 * 4. the last 10 activity events.
 *
 * Access is checked first (`resolve_workspace_access`), so a caller without
 * membership gets a 403 before any data is read.
 */
export async function getWorkspaceOverview(
  workspaceId: string,
): Promise<OverviewResult> {
  if (!workspaceId) {
    return { data: null, error: { message: "No workspace", status: 400 } };
  }

  let userId: string | null = null;
  try {
    const identity = await getSessionIdentity();
    userId = identity?.userId ?? null;
  } catch {
    return { data: null, error: { message: "Session required", status: 401 } };
  }

  if (!userId) {
    return { data: null, error: { message: "Session required", status: 401 } };
  }

  // ── 1. Access check — enforced server side before any data is read ──
  const access = await getUserWorkspaceAccess(userId, workspaceId);
  if (!access) {
    return { data: null, error: { message: "Forbidden", status: 403 } };
  }

  // ── 2. Workspace row ──
  const serviceClient = await createServiceClient();
  const { data: workspaceRow, error: workspaceError } = await serviceClient
    .from("workspaces")
    .select("id, name, slug, description")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceError || !workspaceRow) {
    return { data: null, error: { message: "Workspace not found", status: 404 } };
  }

  // ── 3. Boards + aggregated job counts (no N+1) ──
  const { data: boardRows, error: boardsError } = await serviceClient
    .from("boards")
    .select("id, name, slug, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (boardsError) {
    return {
      data: null,
      error: { message: boardsError.message, status: 500 },
    };
  }

  const boardIds = (boardRows ?? []).map((b) => b.id);
  const counts = new Map<string, { pending: number; inProgress: number; done: number }>();
  if (boardIds.length > 0) {
    const { data: recordRows } = await serviceClient
      .from("records")
      .select("board_id, status")
      .eq("workspace_id", workspaceId)
      .in("board_id", boardIds);

    for (const r of recordRows ?? []) {
      const c = counts.get(String(r.board_id)) ?? {
        pending: 0,
        inProgress: 0,
        done: 0,
      };
      c[bucketStatus(r.status)] += 1;
      counts.set(String(r.board_id), c);
    }
  }

  const boards: OverviewBoard[] = (boardRows ?? []).map((b) => {
    const c = counts.get(String(b.id)) ?? { pending: 0, inProgress: 0, done: 0 };
    return {
      id: String(b.id),
      name: String(b.name),
      slug: String(b.slug),
      jobsPending: c.pending,
      jobsInProgress: c.inProgress,
      jobsDone: c.done,
      jobsTotal: c.pending + c.inProgress + c.done,
    };
  });

  const totalPending = boards.reduce((sum, b) => sum + b.jobsPending, 0);

  // ── 4. Members (the RPC enforces can_view_workspace internally) ──
  const anonClient = await createClient(await cookies());
  const { data: memberRows } = await anonClient.rpc(
    "list_workspace_members",
    { p_workspace_id: workspaceId },
  );

  const members: OverviewMember[] = (memberRows as Array<Record<string, unknown>> | null ?? []).map((m) => ({
    userId: String(m["user_id"]),
    name: String(m["full_name"] ?? "User"),
    email: String(m["email"] ?? ""),
    avatarUrl: (m["avatar_url"] as string | null) ?? null,
    role: String(m["role"] ?? "member"),
  }));

  // ── 5. Recent activity, last 10 ──
  const { data: activityRows, error: activityError } = await serviceClient
    .from("activity_logs")
    .select("id, action, payload, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (activityError) {
    return {
      data: null,
      error: { message: activityError.message, status: 500 },
    };
  }

  const activity: OverviewActivity[] = (activityRows as Array<Record<string, unknown>> | null ?? []).map((r) => {
    let payload: Record<string, unknown> = {};
    if (r.payload && typeof r.payload === "object") {
      payload = r.payload as Record<string, unknown>;
    }
    const after = (payload.after ?? null) as Record<string, unknown> | null;    const rawTitle =
      (after?.title ?? after?.name ?? r.action ?? "") as string;
    const title = rawTitle.replace(/\./g, " ") || "Event";

    return {
      id: String(r.id),
      action: String(r.action ?? ""),
      title: title || actionTitle[String(r.action ?? "")],
      detail: title,
      timestamp: String(r.created_at ?? ""),
    };
  });

  return {
    data: {
      workspace: {
        id: workspaceRow.id,
        name: workspaceRow.name,
        slug: workspaceRow.slug,
        role: await workspaceRoleLabel(access),
      },
      boards,
      totalPending,
      members,
      activity,
    },
    error: null,
  };
}
