"use client";

import { useEffect, useState } from "react";

import type {
  AccessRole,
  GrantableAccess,
  Member,
  MemberScope,
  MembersPayload,
  PendingInvite,
} from "@/lib/members-types";

/**
 * Client half of the Members & access feature.
 *
 * `useScopeAccess` resolves the caller's access once per scope and shares the
 * result between the board toolbar and the Members modal through a small
 * module-level cache, so opening the modal does not refetch what the toolbar
 * already loaded.
 *
 * A `null` access means "could not be determined" — an unreadable board, a
 * catalog board with no real workspace, or a failed request. Callers must treat
 * that as unknown rather than as "view": gating on it would turn a transient
 * error into a locked-out board.
 */

interface ScopeState {
  loading: boolean;
  error: string | null;
  access: AccessRole | null;
  canManage: boolean;
  members: Member[];
  pendingInvites: PendingInvite[];
}

const IDLE: ScopeState = {
  loading: false,
  error: null,
  access: null,
  canManage: false,
  members: [],
  pendingInvites: [],
};

const LOADING: ScopeState = { ...IDLE, loading: true };

const cache = new Map<string, ScopeState>();
const inFlight = new Map<string, Promise<void>>();
const listeners = new Map<string, Set<() => void>>();

function scopeKey(
  scope: MemberScope,
  workspaceId: string | null,
  boardId?: string | null,
): string | null {
  if (!workspaceId) return null;
  if (scope === "board") return boardId ? `board::${boardId}` : null;
  return `workspace::${workspaceId}`;
}

function publish(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

function subscribe(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

function queryFor(
  scope: MemberScope,
  workspaceId: string,
  boardId?: string | null,
  q?: string,
): string {
  const params = new URLSearchParams({ scope });
  if (scope === "board") {
    params.set("board_id", boardId ?? "");
    params.set("workspace_id", workspaceId);
  } else {
    params.set("workspace_id", workspaceId);
  }
  if (q) params.set("q", q);
  return `/api/members?${params.toString()}`;
}

async function loadScope(
  key: string,
  scope: MemberScope,
  workspaceId: string,
  boardId: string | null,
) {
  if (inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    cache.set(key, LOADING);
    publish(key);

    try {
      const response = await fetch(queryFor(scope, workspaceId, boardId));
      const payload = (await response.json().catch(() => null)) as
        | (MembersPayload & { error?: string })
        | null;

      if (!response.ok || !payload?.success) {
        cache.set(key, {
          ...LOADING,
          loading: false,
          error: payload?.error ?? "Could not load members",
        });
        publish(key);
        return;
      }

      cache.set(key, {
        loading: false,
        error: null,
        access: payload.current_access,
        canManage: payload.can_manage,
        members: payload.members,
        pendingInvites: payload.pending_invites,
      });
      publish(key);
    } catch {
      cache.set(key, { ...LOADING, loading: false, error: "Could not load members" });
      publish(key);
    }
  })();

  inFlight.set(key, task);
  await task;
  inFlight.delete(key);
}

/** Re-read a scope after a mutation so every consumer sees the new state. */
export function invalidateScope(
  scope: MemberScope,
  workspaceId: string | null,
  boardId?: string | null,
) {
  const key = scopeKey(scope, workspaceId, boardId);
  if (!key) return;
  cache.delete(key);
  publish(key);
}

export function useScopeAccess(
  scope: MemberScope,
  workspaceId: string | null,
  boardId?: string | null,
) {
  const key = scopeKey(scope, workspaceId, boardId);
  const [state, setState] = useState<ScopeState>(() => (key ? cache.get(key) ?? LOADING : IDLE));

  useEffect(() => {
    if (!key || !workspaceId) {
      setState(IDLE);
      return;
    }

    let cancelled = false;
    setState(cache.get(key) ?? LOADING);
    const unsubscribe = subscribe(key, () => {
      if (!cancelled) setState(cache.get(key) ?? IDLE);
    });

    void loadScope(key, scope, workspaceId, boardId ?? null);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [key, scope, workspaceId, boardId]);

  return {
    access: state.access,
    loading: state.loading,
    error: state.error,
    members: state.members,
    pendingInvites: state.pendingInvites,
    canManageMembers: state.canManage,
    canEdit: state.access === "owner" || state.access === "edit",
    isOwner: state.access === "owner",
  };
}

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  return payload?.error ?? `${fallback} (${response.status})`;
}

export async function searchMemberCandidates(
  scope: MemberScope,
  workspaceId: string,
  boardId: string | null,
  query: string,
) {
  const response = await fetch(queryFor(scope, workspaceId, boardId, query));
  const payload = (await response.json().catch(() => null)) as MembersPayload | null;
  if (!response.ok || !payload?.success) return [];
  return payload.candidates;
}

export async function addMember(input: {
  scope: MemberScope;
  workspaceId: string;
  boardId: string | null;
  email: string;
  access: GrantableAccess;
}): Promise<{ invited: boolean }> {
  const response = await fetch("/api/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope: input.scope,
      workspace_id: input.workspaceId,
      board_id: input.boardId,
      email: input.email,
      access: input.access,
    }),
  });

  if (!response.ok) throw new Error(await readError(response, "Could not add that member"));

  const payload = (await response.json().catch(() => null)) as { invited?: boolean } | null;
  return { invited: payload?.invited === true };
}

export async function setMemberAccess(input: {
  scope: MemberScope;
  workspaceId: string;
  boardId: string | null;
  userId: string;
  access: GrantableAccess;
}) {
  const response = await fetch("/api/members", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "set_access",
      scope: input.scope,
      workspace_id: input.workspaceId,
      board_id: input.boardId,
      user_id: input.userId,
      access: input.access,
    }),
  });

  if (!response.ok) throw new Error(await readError(response, "Could not update access"));
}

/** Board scope only: drop the override so the workspace role applies again. */
export async function clearBoardOverride(input: {
  workspaceId: string;
  boardId: string;
  userId: string;
}) {
  const response = await fetch("/api/members", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "clear_override",
      scope: "board",
      workspace_id: input.workspaceId,
      board_id: input.boardId,
      user_id: input.userId,
    }),
  });

  if (!response.ok) throw new Error(await readError(response, "Could not update access"));
}

export async function removeMember(input: {
  scope: MemberScope;
  workspaceId: string;
  boardId: string | null;
  userId: string;
}) {
  const response = await fetch("/api/members", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope: input.scope,
      workspace_id: input.workspaceId,
      board_id: input.boardId,
      user_id: input.userId,
    }),
  });

  if (!response.ok) throw new Error(await readError(response, "Could not remove that member"));
}

export async function resendInvite(workspaceId: string, code: string) {
  const response = await fetch("/api/members", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resend_invite", workspace_id: workspaceId, code }),
  });

  if (!response.ok) throw new Error(await readError(response, "Could not resend that invite"));
}

export async function cancelInvite(workspaceId: string, code: string) {
  const response = await fetch("/api/members", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "workspace", workspace_id: workspaceId, code }),
  });

  if (!response.ok) throw new Error(await readError(response, "Could not cancel that invite"));
}