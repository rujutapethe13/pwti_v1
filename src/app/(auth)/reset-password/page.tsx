"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AlertTriangle, Loader2 } from "lucide-react";

import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  exceedsBcryptLimit,
  satisfiesPasswordPolicy,
} from "@/lib/password-policy";

import {
  PasswordRuleChecklist,
  PasswordStrengthMeter,
} from "@/features/account/password-strength";

/**
 * Forgot password — step two: set the new password.
 *
 * Same rules and the same checklist as the settings dialog, because both
 * enforce the same server-side policy and a user should not have to learn it
 * twice. Reached from a single-use token in the query string; the token is
 * never held in component state beyond the submit, so it cannot be read out of
 * the DOM.
 */

const RULES_ID = "reset-password-rules";
const NEW_ERROR_ID = "reset-password-new-error";
const CONFIRM_ERROR_ID = "reset-password-confirm-error";

export default function ResetPasswordPage() {
  // useSearchParams reads the token out of the query string. Next.js requires
  // that to happen inside a Suspense boundary, or the route cannot be
  // prerendered and the build fails.
  return (
    <React.Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordForm />
    </React.Suspense>
  );
}

function ResetPasswordFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-6 text-center">
        <Loader2
          className="mx-auto size-5 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<{
    newPassword?: string;
    confirmPassword?: string;
  }>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);

  const policyMet = satisfiesPasswordPolicy(newPassword);
  const withinLength = !exceedsBcryptLimit(newPassword);
  const passwordsMatch =
    newPassword.length > 0 && newPassword === confirmPassword;

  const canSubmit = !isPending && policyMet && withinLength && passwordsMatch;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !token) return;

    setIsPending(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        field?: "newPassword" | "confirmPassword" | null;
      };

      if (!response.ok || !payload.success) {
        const message =
          payload.error ?? "Could not reset your password. Please try again.";

        if (payload.field) {
          setFieldErrors({ [payload.field]: message });
        } else {
          setFormError(message);
        }
        return;
      }

      // Every session was revoked by the reset, so there is nothing to stay
      // signed in as. Back to /signin with a confirmation.
      router.push("/signin?password_updated=1");
    } catch {
      setFormError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setIsPending(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">
            This link is incomplete
          </h1>
          <p className="text-sm text-muted-foreground">
            The reset link is missing its token. Request a new one and try again.
          </p>
          <Button
            asChild
            className="h-11 w-full transform-gpu bg-brand text-brand-foreground shadow-none hover:bg-brand/90 hover:opacity-95 active:scale-95 active:opacity-100"
          >
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Please enter your details</p>
          <h1 className="mt-2 text-2xl font-bold text-foreground">
            Set new password
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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

          <div className="space-y-1.5">
            <label htmlFor="newPassword" className="text-sm font-medium text-foreground">
              New password
            </label>
            <PasswordInput
              id="newPassword"
              name="newPassword"
              autoComplete="new-password"
              autoFocus
              placeholder="New password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                if (fieldErrors.newPassword) {
                  setFieldErrors((prev) => ({ ...prev, newPassword: undefined }));
                }
              }}
              aria-invalid={Boolean(fieldErrors.newPassword)}
              aria-describedby={`${RULES_ID}${
                fieldErrors.newPassword ? ` ${NEW_ERROR_ID}` : ""
              }`}
              className={cn(
                "h-11",
                fieldErrors.newPassword &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
            <PasswordStrengthMeter password={newPassword} className="pt-1" />
            <PasswordRuleChecklist password={newPassword} id={RULES_ID} />
            {fieldErrors.newPassword && (
              <p id={NEW_ERROR_ID} className="text-sm text-destructive">
                {fieldErrors.newPassword}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="confirmPassword"
              className="text-sm font-medium text-foreground"
            >
              Confirm new password
            </label>
            <PasswordInput
              id="confirmPassword"
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
                fieldErrors.confirmPassword ? CONFIRM_ERROR_ID : undefined
              }
              className={cn(
                "h-11",
                fieldErrors.confirmPassword &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
            {fieldErrors.confirmPassword && (
              <p id={CONFIRM_ERROR_ID} className="text-sm text-destructive">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            className="h-11 w-full transform-gpu bg-brand text-brand-foreground shadow-none hover:bg-brand/90 hover:opacity-95 active:scale-95 active:opacity-100"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Resetting...
              </>
            ) : (
              "Reset password"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}