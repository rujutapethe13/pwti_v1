import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useBootIdSync } from "@/hooks/use-boot-sync";
import * as bootSync from "@/lib/boot-sync";

vi.mock("@/lib/boot-sync", () => ({
  syncBootId: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(bootSync.syncBootId).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useBootIdSync", () => {
  it("exposes not-ready initially, then ready with the fetched boot id", async () => {
    vi.mocked(bootSync.syncBootId).mockResolvedValue({
      bootId: "boot-xyz",
      reset: false,
      reason: "match",
    });

    const { result } = renderHook(() => useBootIdSync());

    expect(result.current.ready).toBe(false);
    expect(result.current.bootId).toBeNull();
    expect(result.current.result.reason).toBe("unreachable");

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.bootId).toBe("boot-xyz");
    expect(result.current.result).toMatchObject({ bootId: "boot-xyz", reset: false, reason: "match" });
    expect(bootSync.syncBootId).toHaveBeenCalledTimes(1);
  });

  it("still marks ready when the server is unreachable", async () => {
    vi.mocked(bootSync.syncBootId).mockResolvedValue({
      bootId: null,
      reset: false,
      reason: "unreachable",
    });

    const { result } = renderHook(() => useBootIdSync());

    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.bootId).toBeNull();
    expect(result.current.result.reset).toBe(false);

    expect(bootSync.syncBootId).toHaveBeenCalledTimes(1);
  });
});
