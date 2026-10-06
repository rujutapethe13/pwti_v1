"use client";

import * as React from "react";
import Link from "next/link";

import { AlertTriangle } from "lucide-react";

import { PasswordInput } from "@/components/auth/password-input";
import { GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signInWithEmail } from "@/features/auth/actions";

type FieldErrors = {
  email?: string;
  password?: string;
};

export default function SignInPage() {
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [rememberMe, setRememberMe] = React.useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verified = params.get("verified");
    const errorParam = params.get("error");
    const passwordUpdated = params.get("password_updated");

    if (passwordUpdated === "1") {
      // Arrive here from the set-new-password page after a reset.
      setSuccess("Password updated. You can sign in with your new password.");
    } else if (verified === "true") {
      setError("Email verified! You can now sign in.");
    } else if (errorParam === "verification_failed") {
      setError("Verification failed. Please try again or request a new link.");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const newFieldErrors: FieldErrors = {};
    if (!email) newFieldErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newFieldErrors.email = "Invalid email format";
    if (!password) newFieldErrors.password = "Password is required";

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }

    startTransition(async () => {
      const result = await signInWithEmail(formData);
      if (result?.error) {
        setError(result.error);
        if (result.unverified) {
          setError("Please verify your email before signing in");
        }
      }
    });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Please enter your details</p>
          <h1 className="mt-2 text-2xl font-bold text-foreground">Welcome back</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {success && (
            <div
              role="status"
              className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
            >
              {success}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Email address"
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50",
                (fieldErrors.email || error) &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
            {fieldErrors.email && (
              <p className="text-sm text-destructive">{fieldErrors.email}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Password
            </label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              placeholder="Password"
              className={cn(
                (fieldErrors.password || error) &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
            {fieldErrors.password && (
              <p className="text-sm text-destructive">{fieldErrors.password}</p>
            )}
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-brand"
              />
              Remember for 30 days
            </label>
            <Link href="/forgot-password" className="text-brand hover:underline">
              Forgot password
            </Link>
          </div>

          <Button
            type="submit"
            disabled={isPending}
            className="w-full transform-gpu bg-brand text-brand-foreground shadow-none hover:bg-brand/90 hover:opacity-95 active:scale-95 active:opacity-100"
          >
            {isPending ? "Signing in..." : "Sign in"}
          </Button>

          <GoogleButton text="Sign in with Google" />

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-brand hover:underline">
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
