import { afterEach, describe, expect, it, vi } from "vitest";
import { providerFor, sanitizeHeaderValue, sanitizeHeaderList } from "@/lib/email";

vi.mock("@/lib/email/gmail/crypto", () => ({
  encrypt: vi.fn((s: string) => `enc(${s})`),
  decrypt: vi.fn((s: string) => s.replace(/^\(/, "").replace(/\)$/, "")),
}));

process.env.EMAIL_ENCRYPTION_KEY =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const originalEnv = process.env.EMAIL_PROVIDER;
const originalAuth = process.env.EMAIL_PROVIDER_AUTH;

afterEach(() => {
  if (originalEnv === undefined) delete process.env.EMAIL_PROVIDER;
  else process.env.EMAIL_PROVIDER = originalEnv;
  if (originalAuth === undefined) delete process.env.EMAIL_PROVIDER_AUTH;
  else process.env.EMAIL_PROVIDER_AUTH = originalAuth;
});

describe("providerFor", () => {
  it("defaults to resend", () => {
    delete process.env.EMAIL_PROVIDER;
    expect(providerFor()).toBe("resend");
  });

  it("honours EMAIL_PROVIDER=gmail", () => {
    process.env.EMAIL_PROVIDER = "gmail";
    expect(providerFor()).toBe("gmail");
  });

  it("per-event override EMAIL_PROVIDER_AUTH=resend wins for auth events", () => {
    process.env.EMAIL_PROVIDER = "gmail";
    process.env.EMAIL_PROVIDER_AUTH = "resend";
    expect(providerFor("password-reset")).toBe("resend");
    expect(providerFor("password-changed")).toBe("resend");
    expect(providerFor("access-request")).toBe("gmail");
  });

  it("unknown override value falls back to global provider", () => {
    process.env.EMAIL_PROVIDER = "gmail";
    process.env.EMAIL_PROVIDER_AUTH = "nonsense";
    expect(providerFor("password-reset")).toBe("gmail");
  });
});

describe("sanitize", () => {
  it("sanitizeHeaderValue removes CR/LF", () => {
    expect(sanitizeHeaderValue("hello\r\nworld")).toBe("hello world");
    expect(sanitizeHeaderValue("a\rb\nc")).toBe("a b c");
    expect(sanitizeHeaderValue("plain")).toBe("plain");
  });
  it("sanitizeHeaderList trims and drops empty", () => {
    expect(sanitizeHeaderList([" a@b.com ", "\r\n", ""])).toEqual(["a@b.com"]);
  });
});
