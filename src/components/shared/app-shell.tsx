"use client";

import { usePathname } from "next/navigation";
import { WorkspacePanel } from "@/components/shared/workspace-panel";
import { GlobalTopBar } from "@/components/shared/global-top-bar";
import { IconRail } from "@/components/shared/icon-rail";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWorkspaceRoute = pathname === "/workspace" || pathname.startsWith("/workspace/");

  if (isWorkspaceRoute) {
    return (
      <div className="flex h-screen overflow-hidden">
        <IconRail />
        <WorkspacePanel />
        <div className="flex min-w-0 flex-1 flex-col">
          <GlobalTopBar />
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <IconRail />
      <WorkspacePanel />
      <div className="flex min-w-0 flex-1 flex-col">
        <GlobalTopBar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}