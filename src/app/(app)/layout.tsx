import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shared/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { siteConfig } from "@/config/site";
import { getAccessSnapshot } from "@/lib/rbac";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
};

/** Development-only notice: production deployments must run `npm run build` + `next start`, not `next dev`. */
function DevModeNotice() {
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <div className="fixed top-0 left-0 right-0 bg-amber-500/10 border-b border-amber-200/60 p-3 text-xs text-amber-900 z-50">
      Running in development mode ({process.env.NODE_ENV}). Production deployments should run npm run build then next start -- not next dev.
    </div>
  );
}

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const snapshot = await getAccessSnapshot();

  if (!snapshot.identity) {
    redirect("/signin");
  }

  if (!snapshot.hasAnyWorkspace) {
    redirect("/access-required");
  }

  return (
    <>
      <DevModeNotice />
      <TooltipProvider delayDuration={300}>
        <AppShell>{children}</AppShell>
      </TooltipProvider>
      <Toaster />
    </>
  );
}
