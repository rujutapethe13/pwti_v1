import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCrypto = {
  randomUUID: () => "device-uuid",
};

describe("device-session", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      crypto: mockCrypto,
    } as unknown as Window & typeof globalThis);
  });

  describe("getDeviceId", () => {
    it("returns an existing id from localStorage", async () => {
      const { getDeviceId } = await import("@/lib/device-session");
      vi.mocked(window.localStorage.getItem).mockReturnValue("existing-device-id");
      expect(getDeviceId()).toBe("existing-device-id");
    });

    it("generates and stores a new id when none exists", async () => {
      const { getDeviceId } = await import("@/lib/device-session");
      vi.mocked(window.localStorage.getItem).mockReturnValue(null);
      const id = getDeviceId();
      expect(id).toBeTruthy();
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        "powerweave.device-id",
        id,
      );
    });

    it("returns null when localStorage is unavailable", async () => {
      const { getDeviceId } = await import("@/lib/device-session");
      vi.mocked(window.localStorage.getItem).mockImplementation(() => {
        throw new Error("disabled");
      });
      expect(getDeviceId()).toBeNull();
    });
  });

  describe("getDeviceLabel", () => {
    it("detects the browser and platform", async () => {
      const { getDeviceLabel } = await import("@/lib/device-session");
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      } as unknown as Navigator);
      expect(getDeviceLabel()).toBe("Chrome on Windows");
    });

    it("falls back to Unknown device when navigator is missing", async () => {
      const { getDeviceLabel } = await import("@/lib/device-session");
      vi.stubGlobal("navigator", undefined as unknown as Navigator);
      expect(getDeviceLabel()).toBe("Unknown device");
    });
  });
});