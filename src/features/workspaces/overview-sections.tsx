"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Activity, Clock, LayoutTemplate, AlertCircle } from "lucide-react";

interface SectionProps {
  isLoading?: boolean;
  error: string | null;
}

interface OverviewBoard {
  id: string;
  name: string;
  slug: string;
  jobsPending: number;
  jobsInProgress: number;
  jobsDone: number;
  jobsTotal: number;
}

interface OverviewMember {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
}

interface OverviewActivity {
  id: string;
  action: string;
  title: string;
  detail: string;
  timestamp: string;
}

function statusBadge(count: number, label: string, variant: "default" | "secondary" | "destructive" = "default") {
  return (
    <Badge variant={variant} className="shrink-0">
      {count} {label}
    </Badge>
  );
}

export function WorkspaceHeaderSection({
  workspace,
  isLoading = false,
  error = null,
}: SectionProps & { workspace: { name: string; slug: string; role: string } | null }) {
  if (isLoading) {
    return (
      <div className="flex items-start gap-4">
        <div className="flex shrink-0 items-center justify-center rounded-lg bg-muted size-16" />
        <div className="space-y-2 flex-1">
          <div className="bg-muted h-4 w-48 animate-pulse rounded" />
          <div className="bg-muted h-3 w-32 animate-pulse rounded" />
        </div>
      </div>
    );
  }
  if (error) return <ErrorState variant="inline" message={error} />;
  if (!workspace)
    return <EmptyState title="Workspace not found" description="This workspace does not exist." />;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground size-14 text-xs font-medium">
          {(workspace.name.charAt(0) ?? "W").toUpperCase()}
        </div>
        <div>
          <h1 className="text-foreground text-lg font-semibold">{workspace.name}</h1>
          <p className="text-muted-foreground text-xs">
            Workspace overview · {workspace.role}
          </p>
        </div>
      </div>
      <Badge>{workspace.role}</Badge>
    </div>
  );
}

export function PendingJobsCalloutSection({
  totalPending,
  isLoading = false,
  error = null,
}: SectionProps & { totalPending: number }) {
  if (isLoading) {
    return (
      <Card className="border-border p-4">
        <div className="bg-muted h-9 w-40 animate-pulse rounded" />
      </Card>
    );
  }
  if (error) return <ErrorState variant="inline" message={error} />;

  return (
    <Card className="border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Total pending jobs</p>
          <p className="text-foreground text-2xl font-bold">{totalPending}</p>
          {totalPending > 0 ? (
            <p className="text-xs text-muted-foreground mt-1">
              Jobs awaiting work across all boards in this workspace.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">No pending jobs — everything is caught up.</p>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-center rounded-full bg-amber-50 p-2">
          <AlertCircle className="size-5 text-amber-600" aria-hidden="true" />
        </div>
      </div>
    </Card>
  );
}

export function BoardsListSection({
  boards,
  isLoading = false,
  error = null,
}: SectionProps & { boards: OverviewBoard[] | null }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="bg-muted shrink-0 size-10 rounded" />
            <div className="flex-1 space-y-1.5">
              <div className="bg-muted h-4 w-40 rounded" />
              <div className="bg-muted h-3 w-24 rounded" />
              <div className="bg-muted h-3 w-16 rounded" />
              <div className="bg-muted h-3 w-12 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error) return <ErrorState variant="inline" message={error} />;
  if (!boards || boards.length === 0) {
    return (
      <EmptyState
        title="No boards yet"
        description="This workspace has no boards. Create one to start tracking jobs."
        compact
      />
    );
  }

  return (
    <div className="space-y-2">
      {boards.map((board) => (
        <Card
          key={board.id}
          className="border-border p-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="flex shrink-0 items-center justify-center rounded-md bg-muted size-8">
              <LayoutTemplate className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <Link
                href={`/${board.slug}`}
                className="text-foreground font-medium text-sm hover:underline"
                title={`Open ${board.name} board`}
              >
                {board.name}
              </Link>
              <p className="text-xs text-muted-foreground">{board.jobsTotal} jobs</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {statusBadge(board.jobsPending, "pending", "destructive")}
            {statusBadge(board.jobsInProgress, "in progress")}
            {statusBadge(board.jobsDone, "done")}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function MembersListSection({
  members,
  isLoading = false,
  error = null,
}: SectionProps & { members: OverviewMember[] | null }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="bg-muted shrink-0 size-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <div className="bg-muted h-4 w-32 rounded" />
              <div className="bg-muted h-3 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error) return <ErrorState variant="inline" message={error} />;
  if (!members || members.length === 0) {
    return <EmptyState title="No members" description="This workspace has no members yet." compact />;
  }

  return (
    <div className="space-y-1">
      {members.map((member) => (
        <div
          key={member.userId}
          className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
        >
          <div className="flex shrink-0 items-center justify-center rounded-full bg-muted size-8 text-[10px] font-medium">
            {member.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground truncate">{member.name}</p>
            <p className="text-xs text-muted-foreground truncate">{member.email}</p>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {member.role}
          </Badge>
        </div>
      ))}
    </div>
  );
}

export function ActivityFeedSection({
  activity,
  isLoading = false,
  error = null,
}: SectionProps & { activity: OverviewActivity[] | null }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="bg-muted mt-0.5 shrink-0 size-7 rounded-full animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="bg-muted h-4 w-32 animate-pulse rounded" />
              <div className="bg-muted h-3 w-48 animate-pulse rounded" />
              <div className="bg-muted h-3 w-16 animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error) return <ErrorState variant="inline" message={error} />;
  if (!activity || activity.length === 0) {
    return <EmptyState title="No recent activity" description="Events in this workspace will appear here." compact icon={Activity} />;
  }

  return (
    <div className="divide-y divide-border/60">
      {activity.map((event) => (
        <div key={event.id} className="flex items-start gap-3 py-3">
          <div className="flex shrink-0 items-center justify-center rounded-full bg-muted size-7 mt-0.5">
            <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-medium text-foreground">{event.title}</p>
            <p className="text-xs text-muted-foreground truncate">{event.detail}</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {event.timestamp}
          </span>
        </div>
      ))}
    </div>
  );
}
