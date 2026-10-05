import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAllPersisted } from "@/lib/storage";
import {
  fetchBootId,
  getStoredBootId,
  setStoredBootId,
  clearStoredBootId,
  syncBootId,
} from "@/lib/boot-sync";

vi.mock("@/lib/storage", () => ({
  clearAllPersisted: vi.fn(),
  clearLegacyStorage: vi.fn(),
}));

const BOOT_ID_KEY = "app:last-boot-id";

function stubFetch(bootId: string | null, ok = true) {
  if (bootId === null) {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    return;
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok,
    json: async () => ({ bootId }),
  }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(clearAllPersisted).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("boot id storage helpers", () => {
  it("getStoredBootId / setStoredBootId / clearStoredBootId round-trip", () => {
    expect(getStoredBootId()).toBeNull();
    setStoredBootId("abc");
    expect(getStoredBootId()).toBe("abc");
    clearStoredBootId();
    expect(getStoredBootId()).toBeNull();
  });
});

describe("fetchBootId", () => {
  it("resolves the boot id on an ok response", async () => {
    stubFetch("server-1");
    await expect(fetchBootId()).resolves.toBe("server-1");
  });

  it("returns null on a non-ok response", async () => {
    stubFetch("server-1", false);
    await expect(fetchBootId()).resolves.toBeNull();
  });

  it("returns null when the payload omits bootId", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(fetchBootId()).resolves.toBeNull();
  });

  it("returns null when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(fetchBootId()).resolves.toBeNull();
  });
});

describe("syncBootId", () => {
  it("first-run: stores boot id and keeps data, no wipe", async () => {
    localStorage.removeItem(BOOT_ID_KEY);
    stubFetch("boot-1");
    const res = await syncBootId();
    expect(res).toMatchObject({ bootId: "boot-1", reset: false, reason: "first-run" });
    expect(clearAllPersisted).not.toHaveBeenCalled();
    expect(getStoredBootId()).toBe("boot-1");
  });

  it("match: keeps data and boot id, no wipe", async () => {
    setStoredBootId("boot-1");
    stubFetch("boot-1");
    const res = await syncBootId();
    expect(res).toMatchObject({ bootId: "boot-1", reset: false, reason: "match" });
    expect(clearAllPersisted).not.toHaveBeenCalled();
    expect(getStoredBootId()).toBe("boot-1");
  });

  it("restart: wipes persisted data and records the new boot id", async () => {
    setStoredBootId("old-boot");
    stubFetch("new-boot");
    const res = await syncBootId();
    expect(res).toMatchObject({ bootId: "new-boot", reset: true, reason: "restart" });
    expect(clearAllPersisted).toHaveBeenCalledTimes(1);
    expect(getStoredBootId()).toBe("new-boot");
  });

  it("unreachable: keeps data and boot id intact, no wipe", async () => {
    setStoredBootId("old-boot");
    stubFetch(null);
    const res = await syncBootId();
    expect(res).toMatchObject({ bootId: null, reset: false, reason: "unreachable" });
    expect(clearAllPersisted).not.toHaveBeenCalled();
    expect(getStoredBootId()).toBe("old-boot");
  });
});
