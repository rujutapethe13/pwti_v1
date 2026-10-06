import "server-only";

import bcrypt from "bcryptjs";

import { exceedsBcryptLimit } from "@/lib/password-policy";

/**
 * Password hashing.
 *
 * bcrypt with 12 rounds. Every hash this module produces is written to
 * account_credentials / account_password_history and is the only place a
 * password is ever persisted — plaintext is never stored, never logged, and
 * never leaves the request that carried it.
 *
 * bcrypt is also what Supabase GoTrue uses, so the two agree on the truncation
 * boundary and a password accepted here is accepted there.
 */

/**
 * 12 rounds is ~250ms on current server hardware, which is the usual target:
 * expensive enough to make offline cracking costly, cheap enough that a user
 * does not notice the login.
 */
const SALT_ROUNDS = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

/**
 * Constant-shape comparison. A malformed hash returns false rather than
 * throwing, so a corrupt row cannot turn into a 500 that tells an attacker
 * something about the state of the credential store.
 */
export async function verifyPassword(
  plaintext: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash || typeof hash !== "string") return false;

  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}

/**
 * True when `candidate` equals any of `hashes`.
 *
 * Used for reuse rejection against the live hash plus the retired ones. Runs
 * every comparison rather than stopping at the first match: bcrypt is
 * deliberately slow, so an early return would make the time taken depend on
 * *which* hash matched, and with it leak how recently the user rotated.
 */
export async function matchesAnyHash(
  candidate: string,
  hashes: Array<string | null | undefined>,
): Promise<boolean> {
  const usable = hashes.filter(
    (hash): hash is string => typeof hash === "string" && hash.length > 0,
  );

  if (usable.length === 0) return false;

  const results = await Promise.all(
    usable.map((hash) =>
      bcrypt.compare(candidate, hash).catch(() => false),
    ),
  );

  return results.some(Boolean);
}

/**
 * Reject anything bcrypt would truncate, before it reaches a hash function.
 *
 * The policy already caps at 72 UTF-8 bytes; this is the belt-and-braces check
 * at the boundary that actually writes, so a caller that bypassed the policy
 * module still cannot produce two passwords that hash the same.
 */
export function assertHashable(plaintext: string): void {
  if (exceedsBcryptLimit(plaintext)) {
    throw new Error("Password exceeds the maximum length bcrypt can hash.");
  }
}