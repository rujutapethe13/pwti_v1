"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  PASSWORD_STRENGTH_LABELS,
  type PasswordStrength,
  evaluatePasswordRules,
  scorePasswordStrength,
} from "@/lib/password-policy";

/**
 * Strength meter and rule checklist for the new-password field.
 *
 * Both are live: every keystroke re-evaluates, so the user is never told they
 * are wrong and then left guessing. The checklist is the authoritative feedback
 * — the meter is a summary of it, not a second opinion.
 *
 * The checklist announces itself as one live-region status line rather than
 * five separate items. A screen reader re-reading five lines on each keystroke
 * hears a lot of noise, and the only thing that matters is how many rules are
 * left; the per-rule text is already in the list for anyone reading the page.
 */

const STRENGTH_SEGMENT_CLASS: Record<PasswordStrength, string> = {
  weak: "bg-destructive",
  fair: "bg-warning",
  strong: "bg-success",
};

export interface PasswordStrengthMeterProps {
  password: string;
  className?: string;
}

export function PasswordStrengthMeter({
  password,
  className,
}: PasswordStrengthMeterProps) {
  const { strength, score } = React.useMemo(
    () => scorePasswordStrength(password),
    [password],
  );

  // Nothing is shown for an empty field: a meter reading "Weak" over a blank
  // input criticises a password the user has not typed yet.
  if (password.length === 0) return null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className={cn(
              "h-1 flex-1 rounded-full bg-muted transition-colors",
              index < score && STRENGTH_SEGMENT_CLASS[strength],
            )}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-muted-foreground">
        {PASSWORD_STRENGTH_LABELS[strength]}
      </span>
    </div>
  );
}

export interface PasswordRuleChecklistProps {
  password: string;
  /** Referenced by the new-password input through aria-describedby. */
  id: string;
  className?: string;
}

export function PasswordRuleChecklist({
  password,
  id,
  className,
}: PasswordRuleChecklistProps) {
  const rules = React.useMemo(
    () => evaluatePasswordRules(password),
    [password],
  );

  const remaining = rules.filter((rule) => !rule.ok).length;

  return (
    <div id={id} className="space-y-1.5">
      <p className="sr-only" role="status" aria-live="polite">
        {remaining === 0
          ? "All password requirements met"
          : `${remaining} password requirement${remaining === 1 ? "" : "s"} remaining`}
      </p>

      <ul className={cn("grid gap-1 sm:grid-cols-2", className)}>
        {rules.map((rule) => (
          <li
            key={rule.id}
            className={cn(
              "flex items-center gap-1.5 text-xs",
              rule.ok ? "text-success" : "text-muted-foreground",
            )}
          >
            {/* Decorative: the text already carries the meaning, and the
                live region above announces the count. */}
            <Check
              className={cn(
                "size-3.5 shrink-0",
                rule.ok
                  ? "text-success"
                  : "text-muted-foreground/40",
              )}
              aria-hidden="true"
            />
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}