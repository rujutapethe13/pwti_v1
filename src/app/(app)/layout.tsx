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
      <TooltipProvider delayDuration={300}>
        <AppShell>{children}</AppShell>
      </TooltipProvider>
      <Toaster />
    </>
  );
}
