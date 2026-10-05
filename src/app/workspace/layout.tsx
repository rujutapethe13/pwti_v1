import { AppShell } from "@/components/shared/app-shell";
import { Toaster } from "@/components/ui/sonner";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Toaster />
      {children}
    </AppShell>
  );
}
