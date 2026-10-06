"use client";

import { usePathname } from "next/navigation";
import { UserProvider } from "@/lib/user-context";
import { MobileBottomNav } from "@/components/shared/mobile-bottom-nav";
import { MobileHeader } from "@/components/shared/mobile-header";
import { SignOutConfirmation } from "@/components/shared/use-sign-out";
import { WorkspacePanel } from "@/components/shared/workspace-panel";
import { GlobalTopBar } from "@/components/shared/global-top-bar";
import { IconRail } from "@/components/shared/icon-rail";

/**
 * The shell around every signed-in page.
 *
 * ── Two layouts, one component tree ──────────────────────────────────────────
 * From 768px up: the 72px icon rail, the workspace panel, the full top bar.
 * Below it: a compact header, the page, and a bottom navigation bar.
 *
 * The desktop chrome is hidden with breakpoints rather than swapped for a second
 * tree, so the page is mounted once and moving between the two layouts does not
 * remount it. `hidden md:contents` on the rail and the panel is what keeps that
 * cheap: at `md` and above, `display: contents` removes the wrapper from layout
 * entirely, so the rail and the panel become flex children of this element
 * exactly as they were before, with no extra node in between.
 *
 * ── The bottom bar is a sibling of the scroll area, not an overlay ───────────
 * That is what "sticky" means here without any page having to reserve space for
 * it: `main` scrolls, the bar does not, and no content is ever hidden underneath.
 *
 * ── Sign-out confirmation is mounted once ────────────────────────────────────
 * The item that triggers it can be in the top bar, the drawer or the bottom
 * sheet, so the dialog lives at the shell rather than at any of those call sites.
 *
 * ── Settings pages hide the workspace panel ──────────────────────────────────
 * On /settings and /account/settings/* routes, only the icon rail remains.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSettingsPage = pathname === "/settings" || pathname.startsWith("/account/settings");

  return (
    <UserProvider>
      <div className="flex h-screen overflow-hidden">
        <div className="hidden md:contents">
          <IconRail />
          {!isSettingsPage && <WorkspacePanel />}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <GlobalTopBar />
          <MobileHeader />
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
          <MobileBottomNav />
        </div>
      </div>

      <SignOutConfirmation />
    </UserProvider>
  );
}