import { describe, expect, it, vi } from "vitest";
import {
  sanitizeHeaderValue,
  sanitizeHeaderList,
} from "@/lib/email";

vi.mock("@/lib/email/gmail/crypto", () => ({
  encrypt: vi.fn((s: string) => `enc(${s})`),
  decrypt: vi.fn((s: string) => s.replace(/^\(/, "").replace(/\)$/, "")),
}));

process.env.EMAIL_ENCRYPTION_KEY =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

describe("header injection (CR/LF stripping)", () => {
  it("strips CRLF and lone CR/LF from a header value", () => {
    expect(sanitizeHeaderValue("a\r\nb")).toBe("a b");
    expect(sanitizeHeaderValue("a\rb")).toBe("a b");
    expect(sanitizeHeaderValue("a\nb")).toBe("a b");
    expect(sanitizeHeaderValue("plain")).toBe("plain");
  });

  it("strips and trims header lists, dropping empties", () => {
    expect(sanitizeHeaderList(["a@b.com\r\n", "c@b.com"])).toEqual([
      "a@b.com",
      "c@b.com",
    ]);
    expect(sanitizeHeaderList("single@b.com")).toEqual(["single@b.com"]);
    expect(sanitizeHeaderList(["\r\n", ""])).toEqual([]);
  });

  it("prevents a new header line from being injected into subject", () => {
    const value = "Hello\r\nInjected-Header: x\r\nAnother: y";
    expect(sanitizeHeaderValue(value)).toBe("Hello Injected-Header: x Another: y");
    expect(sanitizeHeaderValue(value)).not.toContain("\r");
    expect(sanitizeHeaderValue(value)).not.toContain("\n");
  });
});
