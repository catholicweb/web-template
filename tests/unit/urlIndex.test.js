import { describe, it, expect, vi } from "vitest";
import { emptyIndex, normalizeUrl, parseIndex, updateIndex, buildRedirectsFile, GONE_RETENTION_DAYS, MAX_PREVIOUS_PER_PAGE } from "../../docs/.vitepress/urlIndex.js";

const rec = (id, url, lang = "es") => ({ id, lang, url });
const day = (s) => new Date(s + "T12:00:00Z");

describe("normalizeUrl", () => {
  it("normalizes slashes, query and hash", () => {
    expect(normalizeUrl("/a/b/")).toBe("/a/b");
    expect(normalizeUrl("a")).toBe("/a");
    expect(normalizeUrl("/a?x=1#y")).toBe("/a");
    expect(normalizeUrl("/")).toBe("/");
    expect(normalizeUrl("")).toBe("");
  });
});

describe("updateIndex", () => {
  it("records a fresh page with no redirects on the first build", () => {
    const { index, redirects } = updateIndex(emptyIndex(), [rec("page:1", "/contacto")]);
    expect(index.entries["page:1"].urls.es).toEqual({ current: "/contacto", previous: [] });
    expect(redirects).toEqual([]);
  });

  it("redirects the old URL when the title (slug) changes", () => {
    const first = updateIndex(emptyIndex(), [rec("page:1", "/contacto")]).index;
    const { index, redirects } = updateIndex(first, [rec("page:1", "/contactanos")]);
    expect(index.entries["page:1"].urls.es).toEqual({ current: "/contactanos", previous: ["/contacto"] });
    expect(redirects).toEqual([{ from: "/contacto", to: "/contactanos" }]);
  });

  it("collapses chains: A -> B -> C gives A -> C and B -> C", () => {
    let idx = updateIndex(emptyIndex(), [rec("page:1", "/a")]).index;
    idx = updateIndex(idx, [rec("page:1", "/b")]).index;
    const { redirects } = updateIndex(idx, [rec("page:1", "/c")]);
    expect(redirects).toEqual(expect.arrayContaining([{ from: "/b", to: "/c" }, { from: "/a", to: "/c" }]));
    expect(redirects.every((r) => r.to === "/c")).toBe(true);
  });

  it("never redirects over a live page (slug reuse)", () => {
    let idx = updateIndex(emptyIndex(), [rec("page:1", "/misa"), rec("page:2", "/otra")]).index;
    // page 1 is renamed, page 2 takes over the old slug
    const { index, redirects } = updateIndex(idx, [rec("page:1", "/eucaristia"), rec("page:2", "/misa")]);
    expect(redirects.find((r) => r.from === "/misa")).toBeUndefined();
    expect(index.entries["page:1"].urls.es.previous).not.toContain("/misa");
    // and page 2's own old URL still redirects
    expect(redirects).toContainEqual({ from: "/otra", to: "/misa" });
  });

  it("drops a previous URL that comes back to life", () => {
    let idx = updateIndex(emptyIndex(), [rec("page:1", "/a")]).index;
    idx = updateIndex(idx, [rec("page:1", "/b")]).index;
    const { index, redirects } = updateIndex(idx, [rec("page:1", "/a")]);
    expect(index.entries["page:1"].urls.es).toEqual({ current: "/a", previous: ["/b"] });
    expect(redirects).toEqual([{ from: "/b", to: "/a" }]);
  });

  it("tracks languages independently", () => {
    let idx = updateIndex(emptyIndex(), [rec("page:1", "/contacto", "es"), rec("page:1", "/eu/harremana", "eu")]).index;
    const { redirects } = updateIndex(idx, [rec("page:1", "/contactanos", "es"), rec("page:1", "/eu/harremana", "eu")]);
    expect(redirects).toEqual([{ from: "/contacto", to: "/contactanos" }]);
  });

  it("namespaced ids do not collide", () => {
    const { index } = updateIndex(emptyIndex(), [rec("page:1", "/a"), rec("event:1", "/b")]);
    expect(Object.keys(index.entries).sort()).toEqual(["event:1", "page:1"]);
  });

  it("emits no redirect for pages that no longer exist, and keeps their history", () => {
    let idx = updateIndex(emptyIndex(), [rec("page:1", "/a")]).index;
    idx = updateIndex(idx, [rec("page:1", "/b")]).index;
    const { index, redirects } = updateIndex(idx, [], { now: day("2026-11-03") });
    expect(redirects).toEqual([]);
    expect(index.entries["page:1"].goneSince).toBe("2026-11-03");
    expect(index.entries["page:1"].urls.es.previous).toEqual(["/a"]);
  });

  it("restores a gone page that comes back", () => {
    let idx = updateIndex(emptyIndex(), [rec("page:1", "/a")]).index;
    idx = updateIndex(idx, [], { now: day("2026-11-03") }).index;
    const { index } = updateIndex(idx, [rec("page:1", "/a")], { now: day("2026-11-10") });
    expect(index.entries["page:1"].goneSince).toBeUndefined();
  });

  it("prunes gone pages after the retention window", () => {
    let idx = updateIndex(emptyIndex(), [rec("page:1", "/a")], { now: day("2026-01-01") }).index;
    idx = updateIndex(idx, [], { now: day("2026-01-02") }).index;
    const kept = updateIndex(idx, [], { now: day("2026-06-01") }).index;
    expect(kept.entries["page:1"]).toBeDefined();
    const pruned = updateIndex(idx, [], { now: new Date(day("2026-01-02").getTime() + (GONE_RETENTION_DAYS + 2) * 86_400_000) }).index;
    expect(pruned.entries["page:1"]).toBeUndefined();
  });

  it("bounds the history per page", () => {
    let idx = emptyIndex();
    for (let i = 0; i < MAX_PREVIOUS_PER_PAGE + 10; i++) idx = updateIndex(idx, [rec("page:1", `/v${i}`)]).index;
    const slot = idx.entries["page:1"].urls.es;
    expect(slot.previous).toHaveLength(MAX_PREVIOUS_PER_PAGE);
    expect(slot.previous[0]).toBe(`/v${MAX_PREVIOUS_PER_PAGE + 8}`); // newest first
  });

  it("lets the first claimant keep an old URL shared by two ids", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const prev = { version: 1, entries: { "page:1": { urls: { es: { current: "/x", previous: ["/old"] } } }, "page:2": { urls: { es: { current: "/y", previous: ["/old"] } } } } };
    const { redirects } = updateIndex(prev, [rec("page:1", "/x"), rec("page:2", "/y")]);
    expect(redirects).toEqual([{ from: "/old", to: "/x" }]);
    warn.mockRestore();
  });

  it("keeps the first page when an id produces two pages in a language", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { index } = updateIndex(emptyIndex(), [rec("page:1", "/a"), rec("page:1", "/b")]);
    expect(index.entries["page:1"].urls.es.current).toBe("/a");
    warn.mockRestore();
  });

  it("does not mutate the previous index", () => {
    const prev = updateIndex(emptyIndex(), [rec("page:1", "/a")]).index;
    const snapshot = JSON.stringify(prev);
    updateIndex(prev, [rec("page:1", "/b")]);
    expect(JSON.stringify(prev)).toBe(snapshot);
  });
});

describe("parseIndex", () => {
  it("accepts a valid index (object or string)", () => {
    expect(parseIndex('{"version":1,"entries":{}}').entries).toEqual({});
    expect(parseIndex({ entries: { a: {} } }).version).toBe(1);
  });
  it("throws on anything else, never returning an empty index", () => {
    expect(() => parseIndex("<html>")).toThrow();
    expect(() => parseIndex("[]")).toThrow(/unexpected shape/);
    expect(() => parseIndex({ version: 1 })).toThrow(/unexpected shape/);
    expect(() => parseIndex("null")).toThrow(/unexpected shape/);
  });
});

describe("buildRedirectsFile", () => {
  it("emits a 301 for the path with and without trailing slash", () => {
    const out = buildRedirectsFile([{ from: "/contacto", to: "/contactanos" }]);
    expect(out).toContain("/contacto /contactanos 301\n");
    expect(out).toContain("/contacto/ /contactanos 301\n");
  });

  it("skips unsafe paths (whitespace, placeholders, absolute URLs, the root)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = buildRedirectsFile([
      { from: "/a b", to: "/c" },
      { from: "/a\n/evil", to: "/c" },
      { from: "/:splat", to: "/c" },
      { from: "/ok", to: "https://evil.example" },
      { from: "/ok", to: "//evil.example" },
      { from: "/", to: "/x" },
      { from: "/fine", to: "/target" },
    ]);
    const rules = out.split("\n").filter((l) => l && !l.startsWith("#"));
    expect(rules).toEqual(["/fine /target 301", "/fine/ /target 301"]);
    warn.mockRestore();
  });

  it("respects the Cloudflare rule limit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const many = Array.from({ length: 10 }, (_, i) => ({ from: `/o${i}`, to: "/n" }));
    const rules = buildRedirectsFile(many, { max: 6 }).split("\n").filter((l) => l && !l.startsWith("#"));
    expect(rules).toHaveLength(6);
    warn.mockRestore();
  });

  it("is just a header when there is nothing to redirect", () => {
    expect(buildRedirectsFile([]).split("\n").filter((l) => l && !l.startsWith("#"))).toEqual([]);
  });
});
