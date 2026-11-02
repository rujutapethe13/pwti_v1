import { describe, it, expect } from "vitest";
import { normalizeSearchText, isTextMatch } from "@/features/client-360/search-service";

describe("Client 360 Search Service Matching", () => {
  it("matches Levi's when searching for levis (handles apostrophes and casing)", () => {
    expect(isTextMatch("LEVI'S", "levis")).toBe(true);
    expect(isTextMatch("Levi's", "levis")).toBe(true);
    expect(isTextMatch("LEVIS", "levis")).toBe(true);
    expect(isTextMatch("levi's", "LEVIS")).toBe(true);
  });

  it("matches Safari and Safari Creative Studio", () => {
    expect(isTextMatch("SAFARI", "safari")).toBe(true);
    expect(isTextMatch("Safari Creative Studio", "safari")).toBe(true);
  });

  it("matches Nasher Miles with spacing or punctuation variations", () => {
    expect(isTextMatch("Nasher Miles", "nasher")).toBe(true);
    expect(isTextMatch("Nasher Miles", "nashermiles")).toBe(true);
    expect(isTextMatch("Nasher-Miles", "nasher miles")).toBe(true);
  });

  it("normalizes text cleanly", () => {
    expect(normalizeSearchText("LEVI'S")).toBe("levis");
    expect(normalizeSearchText("House & Kinder")).toBe("house&kinder");
  });
});
