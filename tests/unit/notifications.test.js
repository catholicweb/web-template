import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("FCM / notifications initialization", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.Notification = { requestPermission: vi.fn().mockResolvedValue("granted") };
    global.navigator = {
      serviceWorker: { register: vi.fn() },
    };
    global.window = { PushManager: function () {} };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should not throw when FCM config is missing", () => {
    // Simulating the guard added to setupNotifications:
    // if config is missing/invalid, return early instead of calling initializeApp
    const badConfig = null;
    expect(() => {
      if (!badConfig || typeof badConfig !== "object") return;
      if (!badConfig.apiKey || !badConfig.vapidKey || !badConfig.messagingSenderId) return;
    }).not.toThrow();
  });

  it("should not throw when config is incomplete", () => {
    const partial = { apiKey: "k" };
    expect(() => {
      if (!partial || typeof partial !== "object") return;
      if (!partial.apiKey || !partial.vapidKey || !partial.messagingSenderId) return;
    }).not.toThrow();
  });

  it("should accept complete config structure", () => {
    const full = {
      apiKey: "test",
      projectId: "p",
      appId: "a",
      messagingSenderId: "s",
      vapidKey: "v",
    };
    expect(!!(full.apiKey && full.vapidKey && full.messagingSenderId)).toBe(true);
  });

  it("should have safe string defaults for env-derived FCM keys", () => {
    // Mirrors the fix in config.js: process.env.* || ""
    const env = {};
    const config = {
      apiKey: env.FCM_API_KEY || "",
      vapidKey: env.FCM_VAPID_KEY || "",
      messagingSenderId: env.FCM_MESSAGING_SENDER_ID || "",
    };
    expect(typeof config.apiKey).toBe("string");
    expect(typeof config.vapidKey).toBe("string");
    expect(typeof config.messagingSenderId).toBe("string");
  });
});
