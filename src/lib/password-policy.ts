/**
 * Password Policy
 *
 * The single source of truth for what counts as an acceptable password. Both
 * the settings form and /api/auth/change-password import this module, so the
 * checklist the user ticks off and the check the server actually enforces can
 * never disagree.
 *
 * ── Why this is not a plain zod schema ────────────────────────────────────
 * The form needs the *individual* rule results, not a single failure string,
 * because the checklist renders one line per rule and ticks them off live as
 * the user types. A zod schema would collapse five failures into one message
 * and throw away everything the checklist needs to draw.
 *
 * This module is imported by client components, so it must stay free of
 * `server-only`, Node built-ins, and database access.
 *
 * ── The 72-byte cap ────────────────────────────────────────────────────────
 * bcrypt only consumes the first 72 *bytes* of its input and silently ignores
 * the rest, so `LongPassword...A` and `LongPassword...B` would hash identically
 * and both be accepted as "different" passwords while being the same secret.
 * Capping removes that ambiguity.
 *
 * The limit is measured in UTF-8 bytes, not characters, because that is what
 * bcrypt actually counts. A 72-character string of accented characters or
 * emoji is far more than 72 bytes and would be truncated; `bcrypt.truncates()`
 * enforces the same boundary server-side, so the two cannot disagree.
 *
 * It applies only to the *new* password, never to the current-password check,
 * so an account that somehow already holds a longer password can still rotate
 * it out rather than being locked out of its own account.
 */

export const PASSWORD_MIN_LENGTH = 8;

/** bcrypt's real input limit, in UTF-8 bytes. See the note above. */
export const PASSWORD_MAX_LENGTH = 72;

/**
 * Anything that is not a letter, a digit, or whitespace.
 *
 * Whitespace is excluded deliberately: a space should not be the thing that
 * satisfies "one special character", because "correct horse battery staple"
 * has no special character in it by any reasonable reading.
 */
export const SPECIAL_CHARACTER_PATTERN = /[^A-Za-z0-9\s]/;

export type PasswordRuleId =
  | "length"
  | "uppercase"
  | "lowercase"
  | "number"
  | "special";

export interface PasswordRule {
  id: PasswordRuleId;
  /** Rendered verbatim as the checklist line. */
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (value) => value.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "uppercase",
    label: "One uppercase letter",
    test: (value) => /[A-Z]/.test(value),
  },
  {
    id: "lowercase",
    label: "One lowercase letter",
    test: (value) => /[a-z]/.test(value),
  },
  {
    id: "number",
    label: "One number",
    test: (value) => /[0-9]/.test(value),
  },
  {
    id: "special",
    label: "One special character",
    test: (value) => SPECIAL_CHARACTER_PATTERN.test(value),
  },
];

export interface PasswordRuleResult {
  id: PasswordRuleId;
  label: string;
  ok: boolean;
}

/** Evaluate every rule against `value`. Never short-circuits: the checklist needs all five. */
export function evaluatePasswordRules(value: string): PasswordRuleResult[] {
  return PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    ok: rule.test(value),
  }));
}

/** True only when every rule in `PASSWORD_RULES` passes. */
export function satisfiesPasswordPolicy(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}

export type PasswordValidationError =
  | "empty"
  | "too_short"
  | "too_long"
  | "missing_uppercase"
  | "missing_lowercase"
  | "missing_number"
  | "missing_special";

export interface PasswordValidationResult {
  valid: boolean;
  /** First unmet rule, or "empty". Null when valid. Drives the inline field error. */
  error: PasswordValidationError | null;
}

const FIRST_FAILURE: Record<PasswordRuleId, PasswordValidationError> = {
  length: "too_short",
  uppercase: "missing_uppercase",
  lowercase: "missing_lowercase",
  number: "missing_number",
  special: "missing_special",
};

export const PASSWORD_VALIDATION_MESSAGES: Record<
  PasswordValidationError,
  string
> = {
  empty: "Password is required",
  too_short: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  too_long: `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`,
  missing_uppercase: "Password must include an uppercase letter",
  missing_lowercase: "Password must include a lowercase letter",
  missing_number: "Password must include a number",
  missing_special: "Password must include a special character",
};

/**
 * True when bcrypt would silently discard part of `value`.
 *
 * Measured in UTF-8 bytes because that is bcrypt's unit. Shared by the client
 * and the server so the inline error appears while typing rather than after a
 * round trip.
 */
export function exceedsBcryptLimit(value: string): boolean {
  return utf8ByteLength(value) > PASSWORD_MAX_LENGTH;
}

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }

  // Fallback for environments without TextEncoder. Buffer is Node-only, so it
  // is reached only when both are missing.
  return Buffer.byteLength(value, "utf8");
}

/**
 * Authoritative server-side check. Mirrors the UI exactly, and is the only
 * check that matters — the disabled button on the form is a convenience, not
 * a control.
 */
export function validatePassword(value: unknown): PasswordValidationResult {
  if (typeof value !== "string" || value.length === 0) {
    return { valid: false, error: "empty" };
  }

  if (exceedsBcryptLimit(value)) {
    return { valid: false, error: "too_long" };
  }

  for (const rule of PASSWORD_RULES) {
    if (!rule.test(value)) {
      return { valid: false, error: FIRST_FAILURE[rule.id] };
    }
  }

  return { valid: true, error: null };
}

export function passwordErrorMessage(error: PasswordValidationError): string {
  return PASSWORD_VALIDATION_MESSAGES[error];
}

/** How many of the five rules `value` satisfies. Drives the strength meter. */
export function countSatisfiedRules(value: string): number {
  return PASSWORD_RULES.reduce(
    (count, rule) => (rule.test(value) ? count + 1 : count),
    0,
  );
}

export type PasswordStrength = "weak" | "fair" | "strong";

export interface PasswordStrengthResult {
  strength: PasswordStrength;
  /** 0–3, the number of filled segments in the meter. */
  score: number;
}

/**
 * Three bands rather than a continuous score, because that is what the UI has
 * room to label honestly.
 *
 * A password that satisfies all five rules but is only 8 characters lands on
 * "fair", not "strong": it meets the policy, but length is the one dimension
 * an 8-character password is genuinely short on, and a meter that called it
 * "strong" would be overstating it.
 */
export function scorePasswordStrength(value: string): PasswordStrengthResult {
  if (!value) {
    return { strength: "weak", score: 0 };
  }

  const satisfied = countSatisfiedRules(value);
  let score = 0;

  if (satisfied >= 4) score += 1;
  if (satisfied === PASSWORD_RULES.length) score += 1;
  if (satisfied === PASSWORD_RULES.length && value.length >= 12) score += 1;

  const clamped = Math.min(score, 3);
  const strength: PasswordStrength =
    clamped >= 3 ? "strong" : clamped >= 2 ? "fair" : "weak";

  return { strength, score: clamped };
}

export const PASSWORD_STRENGTH_LABELS: Record<PasswordStrength, string> = {
  weak: "Weak",
  fair: "Fair",
  strong: "Strong",
};

/**
 * "Last changed: <date>" for the settings page.
 *
 * `date-fns` is already a dependency, but it is not needed for one fixed
 * format and this keeps the module free of imports the client bundle would
 * otherwise pull in for a single string.
 */
export function formatPasswordChangedAt(iso: string | null): string {
  if (!iso) return "Never";

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Never";

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}