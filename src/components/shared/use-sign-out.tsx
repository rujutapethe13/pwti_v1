"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { signOut } from "@/features/auth/actions";
import { hasUnsavedChanges } from "@/lib/unsaved-changes";
import { resetUserCache } from "@/lib/user-context";

/**
 * Signing out.
 *
 * Three things have to happen, in this order:
 *   1. Any open menu, sheet or dialog closes — otherwise it is left hanging
 *      over the sign-in page it navigates to.
 *   2. The cached user is dropped, so no reader renders the old identity on the
 *      way out.
 *   3. The session is revoked and the redirect to /signin is issued.
 *
 * Confirmation is asked for *only* when a form somewhere has unsaved edits. A
 * dirty form registers itself (see lib/unsaved-changes), so this does not need
 * to know which page it is on.
 *
 * The confirm dialog is mounted once by AppShell rather than per call site,
 * which is why the open flag lives in a module-level store: the item that
 * triggers it (a dropdown in the top bar, a row in the mobile drawer) and the
 * dialog that renders it are different components in different places.
 */

const confirmation = {
  open: false,
  listeners: new Set<() => void>(),
};

function setConfirmationOpen(open: boolean) {
  confirmation.open = open;
  confirmation.listeners.forEach((listener) => listener());
}

export function useSignOutConfirmationOpen(): boolean {
  const [open, setOpen] = React.useState(confirmation.open);

  React.useEffect(() => {
    const listener = () => setOpen(confirmation.open);
    confirmation.listeners.add(listener);
    return () => {
      confirmation.listeners.delete(listener);
    };
  }, []);

  return open;
}

export function useSignOut() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const performSignOut = React.useCallback(() => {
    setConfirmationOpen(false);
    resetUserCache();

    startTransition(async () => {
      try {
        await signOut();
      } catch {
        // The action redirects, which throws a control-flow sentinel rather
        // than an error. Reaching here means the session was already gone, so
        // send the user to sign-in anyway instead of stranding them.
        router.replace("/signin");
        router.refresh();
      }
    });
  }, [router]);

  const requestSignOut = React.useCallback(() => {
    if (hasUnsavedChanges()) {
      setConfirmationOpen(true);
      return;
    }
    performSignOut();
  }, [performSignOut]);

  return { requestSignOut, performSignOut, pending };
}

/** Mount once, next to AppShell. Renders nothing until confirmation is asked for. */
export function SignOutConfirmation() {
  const open = useSignOutConfirmationOpen();
  const { performSignOut, pending } = useSignOut();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setConfirmationOpen}
      title="Discard unsaved changes?"
      description="You have unsaved changes in a settings form. Signing out now will discard them. Save first, or sign out anyway."
      confirmLabel={pending ? "Signing out…" : "Sign out anyway"}
      cancelLabel="Stay signed in"
      onConfirm={performSignOut}
      disabled={pending}
    />
  );
}