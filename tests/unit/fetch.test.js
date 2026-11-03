import { describe, it, expect, vi } from "vitest";
import { parseJSON, normalizeConfig, siteOrigin, downloadUrlIndex } from "../../docs/.vitepress/fetch.js";

const DATA = "https://data.parroquia.app";

describe("parseJSON", () => {
  it("parses well-formed JSON", () => {
    expect(parseJSON('{"title":"X"}')).toEqual({ title: "X" });
  });

  it("tolerates trailing commas before } and ]", () => {
    const text = '{"title":"X","theme":{"accent":"#fff",},"pages":["a","b",]}';
    expect(parseJSON(text)).toEqual({
      title: "X",
      theme: { accent: "#fff" },
      pages: ["a", "b"],
    });
  });

  it("returns the fallback on malformed JSON", () => {
    expect(parseJSON("{not json", { ok: false })).toEqual({ ok: false });
    expect(parseJSON("", "fallback")).toBe("fallback");
  });
});

describe("normalizeConfig", () => {
  it("passes flat top-level fields through untouched", () => {
    const raw = {
      title: "Parroquia",
      description: "desc",
      languages: ["Español:es"],
      theme: { accentColor: "#111" },
      social: ["https://x.com"],
      nav: [{ title: "M", links: [0] }],
    };
    const out = normalizeConfig(raw);
    expect(out.title).toBe("Parroquia");
    expect(out.description).toBe("desc");
    expect(out.languages).toEqual(["Español:es"]);
    expect(out.theme).toEqual({ accentColor: "#111" });
    expect(out.social).toEqual(["https://x.com"]);
    expect(out.nav).toEqual([{ title: "M", links: [0] }]);
    // media base defaults to the data host + slug (empty here)
    expect(out._media.base).toBe(`${DATA}/`);
  });

  it("falls back to the nested site.* / pages.* schema", () => {
    const raw = {
      site: { title: "Nested", description: "nd", theme: { accentColor: "#222" } },
      pages: { languages: ["Euskara:eu"] },
    };
    const out = normalizeConfig(raw);
    expect(out.title).toBe("Nested");
    expect(out.description).toBe("nd");
    expect(out.theme).toEqual({ accentColor: "#222" });
    expect(out.languages).toEqual(["Euskara:eu"]);
  });

  it("applies default fallbacks for missing keys", () => {
    const out = normalizeConfig({});
    expect(out.title).toBeUndefined();
    expect(out.theme).toEqual({});
    expect(out.nav).toEqual([]);
    expect(out.dev).toEqual({});
    expect(out._media.base).toBe(`${DATA}/`);
  });

  it("derives media base from _media.slug when present", () => {
    const out = normalizeConfig({ _media: { slug: "47herri" } });
    expect(out._media.base).toBe(`${DATA}/47herri`);
  });
});

describe("siteOrigin", () => {
  it("builds the parroquia.app origin from the slug", () => {
    expect(siteOrigin({}, "47herri")).toBe("https://47herri.parroquia.app");
    expect(siteOrigin({}, "test")).toBe("https://test.parroquia.app");
  });

  it("uses config.dev.siteurl when valid and forces https:// when missing protocol", () => {
    expect(siteOrigin({ dev: { siteurl: "https://evil.example.com" } }, "foo")).toBe(
      "https://evil.example.com"
    );
    expect(siteOrigin({ dev: { siteurl: "example.com" } }, "foo")).toBe(
      "https://example.com"
    );
    expect(siteOrigin({ dev: { siteurl: "http://example.com" } }, "foo")).toBe(
      "https://example.com"
    );
  });
});

describe("downloadUrlIndex", () => {
  const url = "https://x.parroquia.app/url-index.json";
  const ok = (body) => ({ ok: true, status: 200, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
  const status = (code) => ({ ok: false, status: code, text: async () => "" });
  const opts = (fetchImpl, extra = {}) => ({ fetchImpl, attempts: 3, delayMs: 0, allowReset: false, ...extra });

  it("returns the published index", async () => {
    const idx = { version: 1, entries: { "page:1": { urls: {} } } };
    expect(await downloadUrlIndex(url, opts(vi.fn(async () => ok(idx))))).toEqual(idx);
  });

  it("starts fresh on 404 (first build), without retrying", async () => {
    const f = vi.fn(async () => status(404));
    expect(await downloadUrlIndex(url, opts(f))).toEqual({ version: 1, entries: {} });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures and then succeeds", async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValueOnce(status(503)).mockResolvedValueOnce(ok({ version: 1, entries: {} }));
    expect(await downloadUrlIndex(url, opts(f))).toEqual({ version: 1, entries: {} });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("throws instead of starting empty when the download keeps failing", async () => {
    await expect(downloadUrlIndex(url, opts(vi.fn(async () => status(500))))).rejects.toThrow(/Refusing to build with an empty URL index/);
    await expect(downloadUrlIndex(url, opts(vi.fn(async () => { throw new Error("offline"); })))).rejects.toThrow(/offline/);
  });

  it("throws on a 200 that is not an index (e.g. an HTML catch-all)", async () => {
    await expect(downloadUrlIndex(url, opts(vi.fn(async () => ok("<!doctype html>"))))).rejects.toThrow(/Refusing/);
  });

  it("starts fresh on failure only when explicitly allowed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await downloadUrlIndex(url, opts(vi.fn(async () => status(500)), { allowReset: true }))).toEqual({ version: 1, entries: {} });
    warn.mockRestore();
  });
});
