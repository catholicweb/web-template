import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";

// createFiles.js patches globalThis.fetch at module load, so we must save the
// original before the dynamic import and restore it afterward. It also reads
// `./docs/public/config.json` at import time, so we drop a deterministic fixture
// (nested, editor-style schema) there first — it is gitignored, so no repo files
// are touched.
const TEST_CONFIG = {
  site: { title: "Título del Sitio", description: "desc", languages: ["Español:es"] },
  dev: { webAnalyticsToken: "TESTTOKEN" },
  _media: { base: "https://data.parroquia.app" },
};

let createFiles;
let originalFetch;

beforeAll(async () => {
  fs.mkdirSync("docs/public", { recursive: true });
  fs.writeFileSync("docs/public/config.json", JSON.stringify(TEST_CONFIG));
  originalFetch = globalThis.fetch;
  createFiles = await import("../../docs/.vitepress/createFiles.js");
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync("docs/public/config.json", { force: true });
});

describe("resolveMedia", () => {
  it("passes absolute URLs through untouched", () => {
    expect(createFiles.resolveMedia("https://x.com/img.webp")).toBe("https://x.com/img.webp");
    expect(createFiles.resolveMedia("//cdn.example.com/img.webp")).toBe("//cdn.example.com/img.webp");
  });

  it("flattens legacy /media/ paths against the media base", () => {
    expect(createFiles.resolveMedia("/media/fotos/iglesia.jpg")).toBe(
      "https://data.parroquia.app/fotos-iglesia.jpg"
    );
  });

  it("returns falsy/non-media values unchanged", () => {
    expect(createFiles.resolveMedia("")).toBe("");
    expect(createFiles.resolveMedia("/foo.svg")).toBe("/foo.svg");
  });
});

describe("substitute", () => {
  it("replaces a whole-string double-brace token with the raw value", () => {
    expect(createFiles.substitute({ title: "{{name}}" }, { name: "Leitza" }).title).toBe("Leitza");
  });

  it("accepts the legacy single-brace form", () => {
    expect(createFiles.substitute({ title: "{name}" }, { name: "Leitza" }).title).toBe("Leitza");
  });

  it("substitutes inline tokens inside longer strings", () => {
    expect(createFiles.substitute({ title: "Iglesia de {{name}}" }, { name: "Leitza" }).title).toBe(
      "Iglesia de Leitza"
    );
  });

  it("splices a whole-string array token into an array context", () => {
    expect(createFiles.substitute({ list: ["{{images}}"] }, { images: ["a.webp", "b.webp"] }).list).toEqual([
      "a.webp",
      "b.webp",
    ]);
  });

  it("leaves unknown tokens untouched", () => {
    expect(createFiles.substitute({ title: "{{missing}}" }, {}).title).toBe("{{missing}}");
  });

  it("does not mutate the source template (deep clone)", () => {
    const tpl = { s: [{ x: "{name}" }] };
    const result = createFiles.substitute(tpl, { name: "N" });
    expect(tpl.s[0].x).toBe("{name}");
    expect(result.s[0].x).toBe("N");
  });

  it("lets inline tags override place fields", () => {
    const result = createFiles.substitute(
      { title: "{{foo}}" },
      { name: "Leitza", tags: [{ key: "foo", value: "bar" }] }
    );
    expect(result.title).toBe("bar");
  });

  it("derives `image` from the first image in `images`", () => {
    expect(createFiles.substitute({ src: "{image}" }, { images: ["x.webp"] }).src).toBe("x.webp");
  });
});

describe("bakeMedia", () => {
  it("passes absolute image URLs through", () => {
    const node = { image: "https://x.com/a.webp" };
    createFiles.bakeMedia(node);
    expect(node.image).toBe("https://x.com/a.webp");
  });

  it("rewrites /media/ image paths to remote URLs", () => {
    const node = { image: "/media/fotos/a.jpg" };
    createFiles.bakeMedia(node);
    expect(node.image).toBe("https://data.parroquia.app/fotos-a.jpg");
  });

  it("rewrites each entry of an `images` array, passing absolute URLs through", () => {
    const node = { images: ["/media/a.jpg", "https://x.com/b.webp"] };
    createFiles.bakeMedia(node);
    expect(node.images).toEqual([
      "https://data.parroquia.app/a.jpg",
      "https://x.com/b.webp",
    ]);
  });

  it("recurses into nested sections and elements", () => {
    const node = {
      sections: [{ elements: [{ image: "/media/deep.jpg" }], image: "/media/b.jpg" }],
    };
    createFiles.bakeMedia(node);
    expect(node.sections[0].elements[0].image).toBe("https://data.parroquia.app/deep.jpg");
    expect(node.sections[0].image).toBe("https://data.parroquia.app/b.jpg");
  });
});

describe("getConfig", () => {
  it("falls back to nested site.* / pages.languages fields", () => {
    const cfg = createFiles.getConfig();
    expect(cfg.title).toBe("Título del Sitio");
    expect(cfg.description).toBe("desc");
    expect(cfg.languages).toEqual(["Español:es"]);
    expect(cfg.theme).toEqual({});
  });

  it("exposes the Cloudflare web-analytics token and not the legacy goatcounter code", () => {
    const cfg = createFiles.getConfig();
    expect(cfg.webAnalyticsToken).toBe("TESTTOKEN");
    expect(cfg.goatcounter).toBeUndefined();
  });
});
