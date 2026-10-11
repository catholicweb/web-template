import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  createContext,
  prepare,
  autocomplete,
  finalize,
  bakeMedia,
  createResolveMedia,
} from "../../docs/.vitepress/pageBuilder.js";
import { buildEvents, sortEvents } from "../../docs/.vitepress/calendar-core.js";

const config = {
  site: { title: "Parroquia", description: "d", languages: ["Español:es", "Euskara:eu"] },
  _media: { base: "https://data.parroquia.app/x" },
  "event-types": { list: [{ id: "mass", defaults: { name: "Misa", title: "Misa" } }] },
  info: { places: [{ id: "leitza", name: "Leitza" }] },
  calendar: {
    events: {
      list: [
        { type: "mass", times: ["10.00", "19:30"], rrule: ["SU"], location: "Leitza" },
        { type: "mass", title: "Pasada", date: ["2001-01-01"], times: ["12:00"], location: "Leitza" },
      ],
    },
  },
  pages: {
    list: [
      { id: "p1", title: "Inicio", home: true, sections: [] },
      { id: "p2", title: "Contacto", description: "Escríbenos", sections: [] },
    ],
  },
};
const dictionary = { "es:es": {}, "Euskara:eu": { Hola: "Kaixo" } };

const makeCtx = (extra = {}) =>
  createContext({ config, calendar: sortEvents(buildEvents(config)), dictionary, ...extra });

describe("browser-safety of the shared modules", () => {
  // These modules are imported by Layout.vue's preview, so they must never pull
  // in node-only code (fs, path, node_utils, gray-matter, ical.js...).
  const shared = ["pageBuilder", "calendar-core", "translate-core", "naming", "faq", "utils", "gospel"];
  for (const name of shared) {
    it(`${name}.js has no node-only imports`, () => {
      const src = fs.readFileSync(`docs/.vitepress/${name}.js`, "utf8");
      const imports = [...src.matchAll(/^\s*import[^"']*["']([^"']+)["']/gm)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec).not.toMatch(/^node:|^fs$|^path$|node_utils|gray-matter|fast-glob|ical\.js|translate\.js|seo\.js|oembed/);
      }
    });
  }
});

describe("createResolveMedia / bakeMedia", () => {
  it("resolves /media paths against _media.base", () => {
    const r = createResolveMedia(config);
    expect(r("/media/a/b.jpg")).toBe("https://data.parroquia.app/x/a-b.jpg");
    expect(r("https://x.com/i.png")).toBe("https://x.com/i.png");
  });

  it("bakes image/images anywhere in the tree", () => {
    const r = createResolveMedia(config);
    const out = bakeMedia({ image: "/media/a.jpg", sections: [{ images: ["/media/b/c.jpg"] }] }, r);
    expect(out.image).toBe("https://data.parroquia.app/x/a.jpg");
    expect(out.sections[0].images[0]).toBe("https://data.parroquia.app/x/b-c.jpg");
  });
});

describe("calendar-core", () => {
  it("builds native events, dropping fully-past one-off dates", () => {
    const events = buildEvents(config, new Date("2026-06-01"));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "mass", title: "Misa", byday: ["SU"], times: ["10:00", "19:30"] });
  });
});

describe("preview pipeline (prepare -> autocomplete -> finalize)", () => {
  it("renders markdown, bakes media and groups calendar events", async () => {
    const ctx = makeCtx();
    const data = prepare({
      title: "Inicio",
      home: true,
      sections: [
        { type: "text", html: "**Hola**", image: "/media/a/b.jpg" },
        { type: "calendar", filter: "" },
      ],
    });
    await autocomplete(data, ctx.pages, ctx);
    const out = await finalize(data, "Español:es", ctx);

    expect(out.sections[0].html).toContain("<strong>Hola</strong>");
    expect(out.sections[0]._block).toBe("gallery");
    expect(out.sections[0].image).toBe("https://data.parroquia.app/x/a-b.jpg");
    expect(out.sections[1].events).toBeTypeOf("object");
    expect(JSON.stringify(out.sections[1].events)).toContain("Misa");
    expect(out.lang).toBe("Español:es");
  });

  it("translates with the dictionary for the requested language", async () => {
    const ctx = makeCtx();
    const data = prepare({ title: "Hola", sections: [{ type: "text", html: "Hola" }] });
    await autocomplete(data, ctx.pages, ctx);
    const out = await finalize(data, "Euskara:eu", ctx);
    expect(out.title).toBe("Kaixo");
    expect(out.sections[0].html).toContain("Kaixo");
  });

  it("resolves page-id links to cards without any network access", async () => {
    const ctx = makeCtx();
    const data = prepare({ title: "x", sections: [{ _block: "links", links: ["p2"] }] });
    await autocomplete(data, ctx.pages, ctx);
    expect(data.sections[0].elements[0]).toMatchObject({ title: "Contacto", file: "contacto.md" });
    expect(data.sections[0]._block).toBe("gallery-feature");
  });

  it("uses injected deps for external links (browser stub by default)", async () => {
    const calls = [];
    const ctx = makeCtx({ deps: { getPreview: async (u) => (calls.push(u), { title: "T", src: u }) } });
    const data = prepare({ title: "x", sections: [{ _block: "links", links: ["https://example.com/a"] }] });
    await autocomplete(data, ctx.pages, ctx);
    expect(calls).toEqual(["https://example.com/a"]);

    const stubbed = makeCtx();
    const d2 = prepare({ title: "x", sections: [{ _block: "links", links: ["https://example.com/a"] }] });
    await autocomplete(d2, stubbed.pages, stubbed);
    expect(d2.sections[0].elements[0].src).toBe("https://example.com/a");
  });

  it("tolerates pages without sections", async () => {
    const ctx = makeCtx();
    const data = prepare({ title: "Vacía" });
    await autocomplete(data, ctx.pages, ctx);
    const out = await finalize(data, "Español:es", ctx);
    expect(out.title).toBe("Vacía");
  });
});
