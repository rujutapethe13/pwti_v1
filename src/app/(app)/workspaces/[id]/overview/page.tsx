import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { getSessionIdentity } from "@/lib/rbac/resolve";
import { getUserWorkspaceAccess } from "@/lib/workspace-access";
import { getWorkspaceOverview } from "@/features/workspaces/overview-actions";
import {
  ActivityFeedSection,
  BoardsListSection,
  MembersListSection,
  PendingJobsCalloutSection,
  WorkspaceHeaderSection,
} from "@/features/workspaces/overview-sections";
import { ErrorState } from "@/components/shared/error-state";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkspaceOverviewPage({
  params,
}: PageProps) {
  const { id: workspaceId } = await params;

  // ── Server-side access gate: non-members never see data ───────────────
  const identity = await getSessionIdentity();
  const access = identity
    ? await getUserWorkspaceAccess(identity.userId, workspaceId)
    : null;
  if (!access) notFound();

  const { data, error } = await getWorkspaceOverview(workspaceId);
  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center py-20">
        <ErrorState variant="fullPage" title="Could not load overview" message={error.message} />
      </div>
    );
  }

  const overview = data ?? {
    workspace: { id: workspaceId, name: "Workspace", slug: "", role: "Member" },
    boards: [],
    totalPending: 0,
    members: [],
    activity: [],
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 px-6 py-10 sm:px-8 lg:px-12">
      <WorkspaceHeaderSection workspace={overview.workspace} />

      <PendingJobsCalloutSection totalPending={overview.totalPending} />

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="text-foreground text-base font-medium tracking-tight mb-3">
            Boards
          </h2>
          <Card className="border-border/60 p-6 shadow-none">
            <BoardsListSection boards={overview.boards} />
          </Card>
        </section>

        <section className="space-y-5">
          <Card className="border-border/60 p-6 shadow-none">
            <h2 className="text-foreground text-base font-medium tracking-tight mb-3">
              Members ({overview.members.length})
            </h2>
            <MembersListSection members={overview.members} />
          </Card>

          <Card className="border-border/60 p-6 shadow-none">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-foreground text-base font-medium tracking-tight">
                Recent activity
              </h2>
              <p className="text-muted-foreground text-xs">Last 10 events</p>
            </div>
            <ActivityFeedSection activity={overview.activity} />
          </Card>
        </section>
      </div>
    </div>
  );
}
