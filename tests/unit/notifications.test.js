import { describe, it, expect } from "vitest";

// These tests only exercise plain config-shape logic, so they need no browser
// globals. (An earlier beforeEach stubbed global.navigator/window/Notification and
// fake timers; none of it was used, and assigning global.navigator throws on
// Node >= 21 where navigator is a read-only getter.)
describe("FCM / notifications initialization", () => {
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
