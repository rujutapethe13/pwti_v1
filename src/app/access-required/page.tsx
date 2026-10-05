import Link from "next/link";
import { redirect } from "next/navigation";

import { getAccessSnapshot } from "@/lib/rbac";
import { Button } from "@/components/ui/button";

/**
 * Access-required empty state.
 *
 * This is the page a signed-in user lands on when the database says they have no
 * workspace membership, or when a guard refused a resource. It replaces the old
 * behaviour, which was a broken dashboard or a raw "Unable to determine
 * organization" — both of which read like a bug rather than a state.
 *
 * Deliberately says nothing about *why*: a user with no membership and a user
 * refused a specific board should not be able to tell the difference, because
 * that difference is information about who has what.
 */
export default async function AccessRequiredPage() {
  const snapshot = await getAccessSnapshot();

  if (!snapshot.identity) {
    redirect("/signin");
  }

  // Anyone with a workspace is not supposed to be here. Send them to their work
  // rather than showing a page that claims they have nothing.
  if (snapshot.hasAnyWorkspace) {
    redirect("/workspace");
  }

  const { identity } = snapshot;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-8 text-center">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">
            Ask your account manager to give you access
          </h1>
          <p className="text-sm text-muted-foreground">
            Your account is set up, but it is not connected to a workspace yet.
            Once an admin adds you, your boards will appear here automatically.
          </p>
        </div>

        <dl className="space-y-2 rounded-md bg-muted/40 p-4 text-left text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Signed in as</dt>
            <dd className="truncate font-medium text-foreground">{identity.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Role</dt>
            <dd className="font-medium text-foreground">{identity.role}</dd>
          </div>
          {identity.organizationId ? null : (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Organization</dt>
              <dd className="font-medium text-foreground">Not assigned</dd>
            </div>
          )}
        </dl>

        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href="/access-required">Check again</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}