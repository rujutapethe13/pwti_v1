import { afterEach, describe, expect, it } from "vitest";

const TEST_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; // 32 zero bytes base64

async function loadCrypto() {
  process.env.EMAIL_ENCRYPTION_KEY = TEST_KEY;
  const mod = await import("@/lib/email/gmail/crypto");
  return { encrypt: mod.encrypt, decrypt: mod.decrypt };
}

describe("gmail crypto", () => {
  afterEach(() => {
    delete process.env.EMAIL_ENCRYPTION_KEY;
  });

  it("round-trips encrypt -> decrypt", async () => {
    const { encrypt, decrypt } = await loadCrypto();
    const plaintext = "my-refresh-token-value";
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(typeof ciphertext).toBe("string");
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext (random IV)", async () => {
    const { encrypt, decrypt } = await loadCrypto();
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same");
    expect(decrypt(b)).toBe("same");
  });

  it("throws on malformed ciphertext", async () => {
    const { decrypt } = await loadCrypto();
    expect(() => decrypt("not-valid-base64!!!")).toThrow();
  });
});
