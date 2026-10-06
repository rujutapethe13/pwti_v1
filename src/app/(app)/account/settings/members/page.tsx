"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MembersAccessModal } from "@/components/shared/members-access-modal";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/shared/skeleton";
import { useUser, useCanManageMembers } from "@/lib/user-context";
import {
  type Member,
  accessRoleLabel,
} from "@/lib/members-types";
import { cn } from "@/lib/utils";

export default function MembersSettingsPage() {
  const { user, loading, error, permissions } = useUser();
  const canManage = useCanManageMembers();
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!user || !canManage) return;
    setLoadingMembers(true);
    setMembersError(null);
    void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, canManage]);

  async function loadMembers() {
    try {
      const params = new URLSearchParams({ workspace_id: "default" });
      const res = await fetch(`/api/members?${params.toString()}`);
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        members?: Member[];
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Could not load members");
      }
      setMembers(json.members ?? []);
    } catch (cause) {
      setMembersError(cause instanceof Error ? cause.message : "Could not load members");
    } finally {
      setLoadingMembers(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Skeleton.Card />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <ErrorState
          title="Could not load your account"
          message={error ?? "Please refresh the page."}
        />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Members &amp; access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and editors can manage workspace members.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Members &amp; access
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage who can access this workspace and what they can do.
          </p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          Add member
        </Button>
      </div>

      {loadingMembers && (
        <div className="space-y-2">
          <Skeleton.Base className="h-12 w-full rounded-lg" />
          <Skeleton.Base className="h-12 w-full rounded-lg" />
          <Skeleton.Base className="h-12 w-full rounded-lg" />
        </div>
      )}

      {membersError && (
        <ErrorState
          title="Could not load members"
          message={membersError}
          onRetry={loadMembers}
        />
      )}

      {!loadingMembers && !membersError && (
        <Card className="divide-y divide-border overflow-hidden rounded-xl border-border">
          {members.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No members yet. Add your first member to get started.
            </div>
          )}
          {members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {member.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  member.role === "owner"
                    ? "bg-highlight/10 text-highlight"
                    : member.role === "edit"
                      ? "bg-brand/10 text-brand"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {accessRoleLabel(member.role)}
              </span>
            </div>
          ))}
        </Card>
      )}

      <MembersAccessModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        scope={{ kind: "workspace", id: "default" }}
        subjectName="Workspace"
        workspaceId="default"
      />
    </div>
  );
}