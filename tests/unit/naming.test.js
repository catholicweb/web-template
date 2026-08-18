import { describe, it, expect } from "vitest";
import { createNaming, buildConfigPages } from "../../docs/.vitepress/naming.js";

const es = "Español:es";
const eu = "Euskara:eu";

describe("createNaming().filename", () => {
  const naming = createNaming({ languages: [es, eu], dictionary: {} });

  it("treats the index page as root for the default language", () => {
    expect(naming.filename("index.md", "Portada", es)).toBe("index");
  });

  it("routes the index page under the language code for other languages", () => {
    expect(naming.filename("index.md", "Portada", eu)).toBe("eu/index");
  });

  it("keeps the 404 basename fixed for every language", () => {
    expect(naming.filename("404.md", "Página no encontrada", es)).toBe("404");
    expect(naming.filename("404.md", "Página no encontrada", eu)).toBe("eu/404");
  });

  it("uses the translated-title slug for .md names", () => {
    expect(naming.filename("contacto.md", "Contacto", es)).toBe("contacto");
    expect(naming.filename("contacto.md", "Contacto", eu)).toBe("eu/contacto");
  });

  it("uses the slug verbatim for plain (non-.md) names", () => {
    expect(naming.filename("contacto", "Contacto", es)).toBe("contacto");
  });

  it("keeps a date-suffixed event slug in the URL for every language", () => {
    // Event pages are emitted with filenameMode:"original" so /misa-2027-07-20/
    // never collapses to /misa/ (or worse, collides with another "Misa").
    expect(naming.filename("misa-2099-12-25", "Misa", es)).toBe("misa-2099-12-25");
    expect(naming.filename("misa-2099-12-25", "Misa", eu)).toBe("eu/misa-2099-12-25");
  });

  it("applies the per-language dictionary to the translated title", () => {
    const docked = createNaming({
      languages: [es, eu],
      dictionary: { [eu]: { "Contacto": "Harremanetarako" } },
    });
    expect(docked.filename("contacto.md", "Contacto", eu)).toBe("eu/harremanetarako");
  });
});

describe("createNaming().resolveSlug", () => {
  const naming = createNaming({ languages: [es], dictionary: {} });

  it("resolves the index page", () => {
    expect(naming.resolveSlug({ home: true })).toBe("index");
    expect(naming.resolveSlug({ protected: "Portada" })).toBe("index");
    expect(naming.resolveSlug({ title: "Portada" })).toBe("index");
    expect(naming.resolveSlug({ slug: "index" })).toBe("index");
  });

  it("prefers an explicit slug", () => {
    expect(naming.resolveSlug({ slug: "contacto", title: "Contacto" })).toBe("contacto");
  });

  it("slugifies the title otherwise", () => {
    expect(naming.resolveSlug({ title: "Hola Mundo" })).toBe("hola-mundo");
  });

  it("falls back to 'page' when nothing resolves", () => {
    expect(naming.resolveSlug({})).toBe("page");
  });
});

describe("buildConfigPages", () => {
  const naming = createNaming({ languages: [es, eu], dictionary: {} });

  it("filters out the town and event template pages and resolves slugs", () => {
    const config = {
      pages: {
        list: [
          { id: "home", title: "Portada", protected: "Portada" },
          { id: "contact", title: "Contacto", slug: "contacto" },
          { id: "town", title: "{{name}}", protected: "Plantilla pueblos" },
          { id: "event", title: "{{title}}", protected: "Plantilla eventos" },
        ],
      },
    };
    const pages = buildConfigPages(config, naming);
    expect(pages.map((p) => p.id)).toEqual(["home", "contact"]);
    expect(pages[0].slug).toBe("index"); // Portada → index
    expect(pages[1].slug).toBe("contacto");
  });

  it("promotes the first page to index when none is marked", () => {
    const config = {
      pages: {
        list: [
          { id: "a", title: "A", slug: "a" },
          { id: "b", title: "B", slug: "b" },
        ],
      },
    };
    const pages = buildConfigPages(config, naming);
    expect(pages).toHaveLength(2);
    expect(pages[0].slug).toBe("index");
    expect(pages[0].home).toBe(true);
    expect(pages[1].slug).toBe("b");
  });

  it("returns an empty list for an empty config", () => {
    expect(buildConfigPages({}, naming)).toEqual([]);
  });
});
