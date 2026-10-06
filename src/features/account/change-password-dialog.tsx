"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDeviceId } from "@/lib/device-session";
import { cn } from "@/lib/utils";
import {
  exceedsBcryptLimit,
  satisfiesPasswordPolicy,
} from "@/lib/password-policy";

import {
  PasswordRuleChecklist,
  PasswordStrengthMeter,
} from "./password-strength";

/**
 * Change password.
 *
 * One component covers both presentations rather than branching in JS: the
 * Dialog is a centred modal from `sm` up and a full-screen sheet below it,
 * which is what "modal on desktop, full-screen page on mobile" actually means
 * once it is responsive CSS rather than a user-agent check. That keeps one focus
 * trap, one Escape handler, and one form instead of two divergent ones.
 *
 * Client-side gating exists to make the button honest. It is not a control:
 * /api/auth/change-password re-validates every rule, re-checks reuse against
 * the stored hashes, and is what actually decides.
 */

const IDS = {
  current: "change-password-current",
  currentError: "change-password-current-error",
  new: "change-password-new",
  newError: "change-password-new-error",
  confirm: "change-password-confirm",
  confirmError: "change-password-confirm-error",
  rules: "change-password-rules",
} as const;

type FieldName = "currentPassword" | "newPassword" | "confirmPassword";

interface FieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** False for an SSO account, which has no current password to supply. */
  hasPassword: boolean;
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
  hasPassword,
}: ChangePasswordDialogProps) {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);

  const currentRef = React.useRef<HTMLInputElement>(null);
  const newRef = React.useRef<HTMLInputElement>(null);

  const title = hasPassword ? "Change password" : "Set a password";
  const description = hasPassword
    ? "Choose a new password. Other sessions will be signed out."
    : "Your account signs in with Google, so it has no password yet. Add one to sign in with your email too.";

  const clearForm = React.useCallback(() => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setFieldErrors({});
    setFormError(null);
  }, []);

  // Reset on open so a previous attempt's values and errors never greet the
  // user, and so the first field reliably starts empty.
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      // Refuse to close mid-submit: unmounting the form would abort the request
      // and lose the outcome, leaving the user unsure whether it worked.
      if (isPending) return;
      if (!next) clearForm();
      onOpenChange(next);
    },
    [clearForm, isPending, onOpenChange],
  );

  // ── Gating ─────────────────────────────────────────────────────────────
  const policyMet = satisfiesPasswordPolicy(newPassword);
  const withinLength = !exceedsBcryptLimit(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const differsFromCurrent =
    !hasPassword || (currentPassword.length > 0 && newPassword !== currentPassword);

  const canSubmit =
    !isPending &&
    policyMet &&
    withinLength &&
    passwordsMatch &&
    differsFromCurrent &&
    (!hasPassword || currentPassword.length > 0);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsPending(true);
    setFieldErrors({});
    setFormError(null);

    try {
      // The device id lets the server keep this browser's row when it clears the
      // other sessions' rows, so the active-devices list on the Profile page
      // does not lose the device the user is sitting at.
      const deviceId = getDeviceId();
      const url = deviceId
        ? `/api/auth/change-password?device_id=${encodeURIComponent(deviceId)}`
        : "/api/auth/change-password";

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: hasPassword ? currentPassword : undefined,
          newPassword,
          confirmPassword,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        field?: FieldName | null;
      };

      if (!response.ok || !payload.success) {
        const message =
          payload.error ?? "Could not update your password. Please try again.";

        // Attach the message to the field it concerns when the server named one,
        // so it lands under the right input instead of in the banner.
        if (payload.field) {
          setFieldErrors({ [payload.field]: message });
        } else {
          setFormError(message);
        }
        return;
      }

      toast.success("Password updated");
      clearForm();
      onOpenChange(false);

      // The settings page shows "Last changed", and every other session has just
      // been signed out, so its cached server data is now wrong either way.
      router.refresh();
    } catch {
      // fetch only rejects on a transport failure, so this is offline, DNS, or
      // the request never reaching the server. Say so plainly and leave the
      // values in place so the user can retry without retyping.
      setFormError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        // Full-screen sheet on mobile, centred modal from sm up. The base
        // DialogContent hardcodes bg-white and a max-w-lg light-mode surface,
        // so both are overridden to keep this dark-mode safe.
        className={cn(
          "flex max-w-none flex-col gap-0 rounded-none border-0 bg-background p-0 text-foreground",
          "left-0 top-0 h-dvh w-screen translate-x-0 translate-y-0",
          "sm:max-w-md sm:rounded-lg sm:p-6",
          "sm:left-1/2 sm:top-1/2 sm:h-auto sm:w-full",
          "sm:-translate-x-1/2 sm:-translate-y-1/2",
        )}
        // Take focus from the first tabbable node (the close button) and put it
        // in the first field instead, which is where the user has to start.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const target = hasPassword ? currentRef.current : newRef.current;
          target?.focus();
        }}
      >
        <DialogHeader className="space-y-1.5 border-b border-border p-6 pb-4 sm:border-0 sm:p-0">
          <DialogTitle className="text-lg font-semibold leading-none tracking-tight text-foreground">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-6 sm:overflow-visible">
            {formError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span>{formError}</span>
                </div>
              </div>
            )}

            {hasPassword && (
              <Field
                id={IDS.current}
                label="Current password"
                error={fieldErrors.currentPassword}
                errorId={IDS.currentError}
              >
                <PasswordInput
                  id={IDS.current}
                  ref={currentRef}
                  name="currentPassword"
                  autoComplete="current-password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(event) => {
                    setCurrentPassword(event.target.value);
                    if (fieldErrors.currentPassword) {
                      setFieldErrors((prev) => ({ ...prev, currentPassword: undefined }));
                    }
                  }}
                  aria-invalid={Boolean(fieldErrors.currentPassword)}
                  aria-describedby={
                    fieldErrors.currentPassword ? IDS.currentError : undefined
                  }
                  className={cn(
                    // 44px on touch, the auth pages' 40px from sm up.
                    "h-11 sm:h-10",
                    fieldErrors.currentPassword &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                />
              </Field>
            )}

            <div className="space-y-1.5">
              <Field
                id={IDS.new}
                label="New password"
                error={fieldErrors.newPassword}
                errorId={IDS.newError}
              >
                <PasswordInput
                  id={IDS.new}
                  ref={newRef}
                  name="newPassword"
                  autoComplete="new-password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(event) => {
                    setNewPassword(event.target.value);
                    if (fieldErrors.newPassword) {
                      setFieldErrors((prev) => ({ ...prev, newPassword: undefined }));
                    }
                  }}
                  aria-invalid={Boolean(fieldErrors.newPassword)}
                  // Always points at the rules so the requirement list is
                  // announced with the field, and at the error too when present.
                  aria-describedby={`${IDS.rules}${
                    fieldErrors.newPassword ? ` ${IDS.newError}` : ""
                  }`}
                  className={cn(
                    "h-11 sm:h-10",
                    fieldErrors.newPassword &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                />
              </Field>

              <PasswordStrengthMeter password={newPassword} />
              <PasswordRuleChecklist password={newPassword} id={IDS.rules} />
            </div>

            <Field
              id={IDS.confirm}
              label="Confirm new password"
              error={fieldErrors.confirmPassword}
              errorId={IDS.confirmError}
            >
              <PasswordInput
                id={IDS.confirm}
                name="confirmPassword"
                autoComplete="new-password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  if (fieldErrors.confirmPassword) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      confirmPassword: undefined,
                    }));
                  }
                }}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={
                  fieldErrors.confirmPassword ? IDS.confirmError : undefined
                }
                className={cn(
                  "h-11 sm:h-10",
                  fieldErrors.confirmPassword &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
            </Field>

            {hasPassword && (
              <p className="text-sm">
                <Link
                  href="/forgot-password"
                  className="text-brand hover:underline"
                  // Leave the form and the dialog behind rather than trapping
                  // the user in a form they cannot complete.
                  onClick={() => handleOpenChange(false)}
                >
                  Forgot your current password?
                </Link>
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border p-6 pt-4 sm:flex-row sm:justify-end sm:border-0 sm:p-0 sm:pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
              className="h-11 sm:h-9"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
              className="h-11 transform-gpu bg-brand text-brand-foreground shadow-none hover:bg-brand/90 hover:opacity-95 active:scale-95 active:opacity-100 sm:h-9"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Updating...
                </>
              ) : (
                "Update password"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  errorId: string;
  children: React.ReactNode;
}

/**
 * Raw <label> rather than a Label component — the repo has none, and both
 * variants in use are hand-rolled at exactly these two scales.
 */
function Field({ id, label, error, errorId, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}