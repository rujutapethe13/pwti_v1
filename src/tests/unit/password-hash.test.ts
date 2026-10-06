import { describe, expect, it } from "vitest";

import {
  assertHashable,
  hashPassword,
  matchesAnyHash,
  verifyPassword,
} from "@/lib/password-hash";

/**
 * The hashing layer. These run real bcrypt rather than a stub, because the
 * properties worth asserting here — that the plaintext never appears in the
 * digest, that verification rejects a wrong password, that reuse detection
 * actually recognises a retired hash — are properties of bcrypt itself and a
 * mock would assert nothing.
 */

describe("hashPassword", () => {
  it("never stores the plaintext in the digest", async () => {
    const plaintext = "Str0ng!Pass";
    const hash = await hashPassword(plaintext);

    expect(hash).not.toContain(plaintext);
    expect(hash).not.toContain("Str0ng");
    // bcrypt digests are $2<variant>$<cost>$<22 char salt><31 char digest>
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it("salts, so the same password hashes differently each time", async () => {
    // Sequential, not Promise.all: bcrypt at the production cost of 12 rounds is
    // CPU-bound, and running two of them concurrently under a fully parallel
    // suite made this assertion flaky. The property being tested is about
    // salting, not about concurrency.
    const first = await hashPassword("Str0ng!Pass");
    const second = await hashPassword("Str0ng!Pass");

    expect(first).not.toBe(second);
    // The salt is the segment between the third and fourth '$'. Same password,
    // different salt: that is what salting means.
    expect(first.split("$")[3]).not.toBe(second.split("$")[3]);

    // ...while both still verify against it.
    await expect(verifyPassword("Str0ng!Pass", first)).resolves.toBe(true);
    await expect(verifyPassword("Str0ng!Pass", second)).resolves.toBe(true);
  });
});

describe("verifyPassword", () => {
  it("accepts the correct password", async () => {
    const hash = await hashPassword("Str0ng!Pass");
    await expect(verifyPassword("Str0ng!Pass", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Str0ng!Pass");
    await expect(verifyPassword("Wr0ng!Pass", hash)).resolves.toBe(false);
  });

  it.each([null, undefined, "", "not-a-hash"])(
    "returns false rather than throwing for the malformed hash %p",
    async (hash) => {
      await expect(verifyPassword("Str0ng!Pass", hash)).resolves.toBe(false);
    },
  );
});

describe("matchesAnyHash", () => {
  it("detects reuse of the live hash", async () => {
    const current = await hashPassword("Str0ng!Pass");

    await expect(matchesAnyHash("Str0ng!Pass", [current])).resolves.toBe(true);
    await expect(matchesAnyHash("Different1!", [current])).resolves.toBe(false);
  });

  it("detects reuse of a retired hash", async () => {
    const retired = await hashPassword("Old3r!Pass");

    await expect(
      matchesAnyHash("Old3r!Pass", [await hashPassword("N3w!Pass"), retired]),
    ).resolves.toBe(true);
  });

  it("returns false when there is nothing to compare against", async () => {
    await expect(matchesAnyHash("Str0ng!Pass", [])).resolves.toBe(false);
    await expect(matchesAnyHash("Str0ng!Pass", [null, undefined, ""])).resolves.toBe(
      false,
    );
  });

  it("ignores unusable entries without letting them match", async () => {
    const current = await hashPassword("Str0ng!Pass");

    await expect(
      matchesAnyHash("Str0ng!Pass", [null, "garbage", current]),
    ).resolves.toBe(true);
    await expect(matchesAnyHash("Absent1!", [null, "garbage"])).resolves.toBe(false);
  });
});

describe("assertHashable", () => {
  it("accepts a password inside the bcrypt input limit", () => {
    expect(() => assertHashable("Str0ng!Pass")).not.toThrow();
  });

  it("refuses a password bcrypt would truncate", () => {
    // Without this guard a caller bypassing the policy module could produce two
    // distinct passwords that hash identically.
    const tooLong = `Aa1!${"x".repeat(100)}`;
    expect(() => assertHashable(tooLong)).toThrow(/maximum length/i);
  });
});