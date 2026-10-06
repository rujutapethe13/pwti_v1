"use client";

import * as React from "react";
import Link from "next/link";

import { AlertTriangle, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Forgot password — step one: request a reset link.
 *
 * The message shown on success is identical whether or not the address belongs
 * to an account, because that is the only way to keep this form from answering
 * "which emails are registered here" to anyone who asks.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address");
      return;
    }

    setIsPending(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      if (!response.ok) {
        setError("Could not send the reset email. Please try again.");
        return;
      }

      setSent(true);
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Please enter your details</p>
          <h1 className="mt-2 text-2xl font-bold text-foreground">Forgot password</h1>
        </div>

        {sent ? (
          <div className="space-y-6">
            <div
              role="status"
              className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-foreground"
            >
              <div className="flex items-start gap-2">
                <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>
                  If an account exists for {email.trim()}, we&apos;ve sent a link
                  to reset its password. The link can be used once and expires in
                  30 minutes.
                </span>
              </div>
            </div>

            <Button
              asChild
              className="h-11 w-full transform-gpu bg-brand text-brand-foreground shadow-none hover:bg-brand/90 hover:opacity-95 active:scale-95 active:opacity-100"
            >
              <Link href="/signin">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span>{error}</span>
                </div>
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
                autoFocus
                placeholder="Email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={cn(
                  "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50",
                  error && "border-destructive focus-visible:ring-destructive",
                )}
              />
            </div>

            <Button
              type="submit"
              disabled={isPending}
              className="h-11 w-full transform-gpu bg-brand text-brand-foreground shadow-none hover:bg-brand/90 hover:opacity-95 active:scale-95 active:opacity-100"
            >
              {isPending ? "Sending..." : "Send reset link"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link href="/signin" className="text-brand hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}