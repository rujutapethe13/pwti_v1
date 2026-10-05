"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PasswordInput } from "@/components/auth/password-input";
import { GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signUpWithEmail, resendVerificationEmail } from "@/features/auth/actions";

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
};

export default function SignUpPage() {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [signupComplete, setSignupComplete] = React.useState(false);
  const [confirmedEmail, setConfirmedEmail] = React.useState<string>("");
  const [resendCooldown, setResendCooldown] = React.useState(0);

  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const newFieldErrors: FieldErrors = {};
    if (!name) newFieldErrors.name = "Name is required";
    if (!email) newFieldErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newFieldErrors.email = "Invalid email format";
    if (!password) newFieldErrors.password = "Password is required";
    else if (password.length < 8) newFieldErrors.password = "Password must be at least 8 characters";

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }

    startTransition(async () => {
      const result = await signUpWithEmail(formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        setConfirmedEmail(result.email);
        setSignupComplete(true);
      }
    });
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResendCooldown(45);
    const formData = new FormData();
    formData.append("email", confirmedEmail);
    const result = await resendVerificationEmail(formData);
    if (result?.error) {
      setError(result.error);
      setResendCooldown(0);
    }
  };

  if (signupComplete) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">Sign up</h1>
          <div className="rounded-md border border-border bg-card p-6 text-left shadow-sm">
            <p className="text-sm text-foreground">
              We&apos;ve sent a verification link to{" "}
              <span className="font-medium">{confirmedEmail}</span>. Please check your inbox to verify your
              account.
            </p>
            <div className="mt-4 space-y-3">
              <Button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="w-full bg-brand text-brand-foreground hover:bg-brand/90 shadow-none"
              >
                {resendCooldown > 0
                  ? `Resend verification email (${resendCooldown}s)`
                  : "Resend verification email"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/signin")}
                className="w-full"
              >
                Back to Sign in
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">Sign up</h1>
        </div>

        <div className="rounded-md border border-border bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
          Signups are currently restricted. Only the workspace owner can create an account.
        </div>

        <form onSubmit={handleSignup} className="space-y-5">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium text-foreground">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Name"
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50",
              )}
            />
            {fieldErrors.name && (
              <p className="text-sm text-destructive">{fieldErrors.name}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Email"
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50",
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
              autoComplete="new-password"
              placeholder="Password"
            />
            {fieldErrors.password && (
              <p className="text-sm text-destructive">{fieldErrors.password}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isPending}
            className="w-full bg-brand text-brand-foreground hover:bg-brand/90 shadow-none"
          >
            {isPending ? "Creating account..." : "Sign Up"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/signin" className="text-brand hover:underline">
              Log In
            </Link>
          </p>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <GoogleButton text="Sign up with Google" />
        </form>
      </div>
    </div>
  );
}
