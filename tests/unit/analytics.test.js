import { describe, it, expect } from "vitest";
import { webAnalyticsHead } from "../../docs/.vitepress/analytics.js";

describe("webAnalyticsHead", () => {
  it("returns the Cloudflare RUM beacon head entry when a token is set", () => {
    const head = webAnalyticsHead("TOKEN123");
    expect(head).toHaveLength(1);
    expect(head[0][0]).toBe("script");
    expect(head[0][1]).toMatchObject({
      type: "module",
      src: "https://static.cloudflareinsights.com/beacon.min.js",
    });
    // data-cf-beacon must be the literal JSON object Cloudflare's beacon parses.
    expect(head[0][1]["data-cf-beacon"]).toBe('{"token":"TOKEN123"}');
  });

  it("returns an empty array when no token is set", () => {
    for (const falsy of [undefined, null, "", 0]) {
      expect(webAnalyticsHead(falsy)).toEqual([]);
    }
  });

  it("never emits the legacy goatcounter script", () => {
    expect(JSON.stringify(webAnalyticsHead("TOKEN123"))).not.toMatch(/goatcounter|gc\.zgo\.at/i);
  });
});