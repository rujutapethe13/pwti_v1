"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type WorkspacePermissionLevel = "owner" | "admin" | "member" | "guest" | "unknown";

const MANAGING_ROLES = new Set(["owner", "admin"]);

export async function fetchWorkspacePermissionLevel(
  workspaceId: string,
): Promise<WorkspacePermissionLevel> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "unknown";

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, role_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return "unknown";

  // The RBAC `role` column is authoritative. The legacy role_id join is only a
  // fallback for rows written before the backfill; role_id became nullable in
  // migration 01 so new memberships do not have to pick one at all.
  const appRole = (data.role as string | null)?.toLowerCase();
  if (appRole === "admin") return "admin";
  if (appRole === "staff") return "member";
  if (appRole === "client") return "guest";
  if (appRole === "owner") return "owner";

  const roleId = data.role_id;
  if (!roleId) return "unknown";

  const { data: role } = await supabase
    .from("roles")
    .select("name")
    .eq("id", roleId)
    .single();

  const name = role?.name?.toLowerCase() ?? "";
  if (name === "owner") return "owner";
  if (name === "administrator" || name === "admin") return "admin";
  if (name === "manager") return "admin";
  if (name === "member") return "member";
  if (name === "guest") return "guest";
  return "unknown";
}

export function useWorkspacePermission(workspaceId: string | null) {
  const [level, setLevel] = useState<WorkspacePermissionLevel>("unknown");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setLevel("unknown");
      setLoading(false);
      return;
    }

    fetchWorkspacePermissionLevel(workspaceId).then((lvl) => {
      if (!cancelled) {
        setLevel(lvl);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const canManage = !loading && MANAGING_ROLES.has(level);

  return { level, loading, canManage };
}
