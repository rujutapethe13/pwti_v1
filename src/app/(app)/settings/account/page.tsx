import { getPasswordStateForSelf } from "@/lib/account-security";

import { PasswordSection } from "@/features/account/password-section";

/**
 * Settings > Account & security.
 *
 * Additive: /settings itself is untouched and still renders its board. This
 * lives at its own URL because that page is data-driven from
 * loadBoardPageData("settings") and has no place to host a hand-authored form.
 *
 * The password state is read on the server so "Last changed" renders in the
 * first paint rather than after a client fetch.
 */
export default async function AccountSettingsPage() {
  const { hasPassword, passwordChangedAt } = await getPasswordStateForSelf();

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Account &amp; security
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage how you sign in to Powerweave Studio OS.
            </p>
          </div>

          <PasswordSection
            hasPassword={hasPassword}
            passwordChangedAt={passwordChangedAt}
          />
        </div>
      </div>
    </div>
  );
}