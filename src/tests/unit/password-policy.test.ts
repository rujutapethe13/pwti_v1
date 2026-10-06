import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_RULES,
  SPECIAL_CHARACTER_PATTERN,
  countSatisfiedRules,
  evaluatePasswordRules,
  exceedsBcryptLimit,
  formatPasswordChangedAt,
  satisfiesPasswordPolicy,
  scorePasswordStrength,
  validatePassword,
} from "@/lib/password-policy";

/**
 * The policy module is imported by both the settings form and the API route,
 * so these tests are the thing that keeps "what the checklist promises" and
 * "what the server enforces" from drifting apart.
 */

describe("password rules", () => {
  it("exposes exactly the five rules the UI advertises", () => {
    expect(PASSWORD_RULES.map((rule) => rule.id)).toEqual([
      "length",
      "uppercase",
      "lowercase",
      "number",
      "special",
    ]);
  });

  it("evaluates every rule rather than short-circuiting", () => {
    // The checklist renders one line per rule, so a failing early rule must not
    // hide the state of the later ones.
    const results = evaluatePasswordRules("short");
    expect(results).toHaveLength(5);
    expect(results.map((rule) => rule.ok)).toEqual([false, false, true, false, false]);
  });

  it("counts satisfied rules", () => {
    expect(countSatisfiedRules("")).toBe(0);
    expect(countSatisfiedRules("Password1!")).toBe(5);
  });
});

describe("satisfiesPasswordPolicy", () => {
  it("accepts a password meeting all five rules", () => {
    expect(satisfiesPasswordPolicy("Correct1!")).toBe(true);
  });

  it.each([
    ["Ab1!efg", "one short of 8 characters"],
    ["correct1!", "no uppercase letter"],
    ["CORRECT1!", "no lowercase letter"],
    ["CorrectOne!", "no number"],
    ["CorrectOne1", "no special character"],
  ])("rejects %s (%s)", (candidate) => {
    expect(satisfiesPasswordPolicy(candidate)).toBe(false);
  });

  it("does not accept a whitespace-only character as the special character", () => {
    // A space should not be the thing that satisfies "one special character":
    // "Abc def1 ghij" contains no special character by any reasonable reading.
    expect(SPECIAL_CHARACTER_PATTERN.test("Abc def1 ghij")).toBe(false);
    expect(SPECIAL_CHARACTER_PATTERN.test("Abc def1 ghij!")).toBe(true);
  });
});

describe("validatePassword", () => {
  it("rejects a missing value", () => {
    expect(validatePassword(undefined)).toEqual({ valid: false, error: "empty" });
    expect(validatePassword("")).toEqual({ valid: false, error: "empty" });
    expect(validatePassword(12345)).toEqual({ valid: false, error: "empty" });
  });

  it("reports the first unmet rule, in checklist order", () => {
    expect(validatePassword("short").error).toBe("too_short");
    expect(validatePassword("lowercase1!").error).toBe("missing_uppercase");
    expect(validatePassword("UPPERCASE1!").error).toBe("missing_lowercase");
    expect(validatePassword("NoDigits!!").error).toBe("missing_number");
    expect(validatePassword("NoSpecial11").error).toBe("missing_special");
  });

  it("accepts a compliant password", () => {
    expect(validatePassword("Str0ng!Pass")).toEqual({ valid: true, error: null });
  });

  it("caps length at bcrypt's real 72-byte input boundary", () => {
    // bcrypt consumes the first 72 bytes and ignores the rest, so anything past
    // that would hash identically to its own prefix.
    const exactly72 = `Aa1!${"x".repeat(72 - 4)}`;
    expect(exactly72).toHaveLength(PASSWORD_MAX_LENGTH);
    expect(exceedsBcryptLimit(exactly72)).toBe(false);
    expect(validatePassword(exactly72).valid).toBe(true);

    const tooLong = `Aa1!${"x".repeat(73 - 4)}`;
    expect(exceedsBcryptLimit(tooLong)).toBe(true);
    expect(validatePassword(tooLong)).toEqual({ valid: false, error: "too_long" });
  });

  it("measures the cap in bytes, not characters", () => {
    // 30 CJK characters are 90 UTF-8 bytes. A character-based cap would wave
    // this through and bcrypt would silently truncate it.
    const multibyte = "中".repeat(30);
    expect(multibyte).toHaveLength(30);
    expect(exceedsBcryptLimit(multibyte)).toBe(true);
    expect(validatePassword(multibyte).error).toBe("too_long");
  });
});

describe("scorePasswordStrength", () => {
  it("reports nothing usable for an empty password", () => {
    expect(scorePasswordStrength("")).toEqual({ strength: "weak", score: 0 });
  });

  it("rates a password failing most rules as weak", () => {
    expect(scorePasswordStrength("abc").strength).toBe("weak");
  });

  it("rates a compliant but short password as fair, not strong", () => {
    // All five rules met at 11 characters. It meets the policy, but calling it
    // "strong" would overstate a short password.
    const result = scorePasswordStrength("Str0ng!Ab");
    expect(result.strength).toBe("fair");
    expect(countSatisfiedRules("Str0ng!Ab")).toBe(5);
  });

  it("rates a compliant password of 12 characters or more as strong", () => {
    expect("Str0ng!AbcdE").toHaveLength(12);
    expect(scorePasswordStrength("Str0ng!AbcdE").strength).toBe("strong");
  });

  it("never exceeds three segments", () => {
    const long = `Aa1!${"x".repeat(60)}`;
    expect(scorePasswordStrength(long).score).toBeLessThanOrEqual(3);
  });
});

describe("formatPasswordChangedAt", () => {
  it("says Never when there is no date", () => {
    expect(formatPasswordChangedAt(null)).toBe("Never");
  });

  it("falls back to Never for an unparseable date rather than printing NaN", () => {
    expect(formatPasswordChangedAt("not-a-date")).toBe("Never");
  });

  it("formats an ISO timestamp as a date", () => {
    const formatted = formatPasswordChangedAt("2026-10-05T12:00:00.000Z");
    expect(formatted).not.toBe("Never");
    expect(formatted).toMatch(/2026/);
  });
});