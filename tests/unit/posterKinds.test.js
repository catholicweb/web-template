import { describe, it, expect } from "vitest";
import {
  buildSectionModel, contactsOf, defaultContent, printBlock, qrCandidates, sectionOptions, socialOf,
} from "../../docs/.vitepress/theme/poster/posterModel.js";

const config = {
  info: {
    title: "Parroquia de Betelu", description: "Comunidad", image: "/site.jpg",
    social: ["https://www.instagram.com/parroquiabetelu/", "https://youtube.com/@betelu", "info@betelu.org", "+34 948 123 456"],
    collaborators: [{ name: "P. Miguel", phonenumber: "600 123 456", social: ["miguel@betelu.org", "+34 600 123 456"] }, { name: "Sin teléfono" }],
    places: [{ name: "Leitza", image: "/leitza.jpg" }, { name: "Betelu" }, { image: "x" }],
  },
  theme: { accentHue: 200 },
};

describe("contacts and networks", () => {
  it("takes phones from collaborators and e-mails from their social entries", () => {
    expect(contactsOf(config)).toEqual({ contacts: [{ name: "P. Miguel", phone: "600 123 456" }], emails: ["miguel@betelu.org"] });
  });
  it("lists networks as short addresses, without e-mails or phones", () => {
    expect(socialOf(config)).toEqual(["instagram.com/parroquiabetelu", "youtube.com/@betelu"]);
    expect(socialOf({})).toEqual([]);
  });
});

describe("printBlock", () => {
  it("drops the tags that make no sense on paper and keeps the rest", () => {
    const section = { _block: "calendar", title: "Misas", tags: ["carousel", "medium", "3d", "horizontal", "dense"], events: { SA: {} } };
    expect(printBlock(section)).toEqual({ ...section, tags: ["medium", "dense"] });
    expect(section.tags).toHaveLength(5); // the page's section is untouched
    expect(printBlock({ _block: "text" }).tags).toEqual([]);
    expect(printBlock(undefined)).toEqual({});
  });
});

describe("sectionOptions / defaultContent", () => {
  const sections = [
    { _block: "hero", title: "Inicio" },
    { _block: "text-narrow", title: "Quiénes somos" },
    { _block: "map", title: "Dónde" },
    { _block: "calendar", title: "Misas" },
    { _block: "gallery", title: "Oculta", tags: ["hidden"] },
    null,
  ];
  const options = sectionOptions(sections);
  it("offers visible, printable sections with their position in the page", () => {
    expect(options.map((o) => o.index)).toEqual([0, 1, 3]);
    expect(options[1]).toMatchObject({ block: "text", title: "Quiénes somos", label: "text · Quiénes somos" });
    expect(sectionOptions(undefined)).toEqual([]);
  });
  it("prints the event on an event page, otherwise the first calendar, else the first titled section", () => {
    expect(defaultContent({ single: true, hasEvents: true, sections: options })).toBe("event");
    expect(defaultContent({ hasEvents: true, sections: options })).toBe("3"); // an event-type page: its calendar
    expect(defaultContent({ sections: options.filter((o) => o.block !== "calendar") })).toBe("0");
    expect(defaultContent({ sections: [{ index: 4, block: "gallery", title: "" }] })).toBe("4");
    expect(defaultContent({ hasEvents: true })).toBe("event");
    expect(defaultContent({})).toBe("");
  });
});

describe("buildSectionModel", () => {
  const sections = [{ _block: "hero", title: "Inicio", image: "/hero.jpg" }, { _block: "calendar", title: "Horario de misas", image: "" }];
  const m = (o = {}) => buildSectionModel({ section: sections[1], sections, config, lang: "Español:es", pageUrl: "https://s.es/?print", pageTitle: "Inicio", pageImage: "/page.jpg", ...o });

  it("titles the poster with the section and links the QR to it", () => {
    expect(m()).toMatchObject({ kind: "section", title: "Horario de misas", anchor: "horario-de-misas", pageUrl: "https://s.es/", siteName: "Parroquia de Betelu", hue: 200, second: null });
    expect(m().social).toEqual(["instagram.com/parroquiabetelu", "youtube.com/@betelu"]);
    expect(m().emails).toEqual(["miguel@betelu.org"]);
  });
  it("offers the pictures of the page and the site, the temple's first", () => {
    expect(m().images).toEqual(["/page.jpg", "/hero.jpg", "/site.jpg"]);
    const leitza = m({ place: config.info.places[0] });
    expect(leitza.title).toBe("Leitza");
    expect(leitza.images[0]).toBe("/leitza.jpg");
    expect(leitza.places.map((p) => p.name)).toEqual(["Leitza", "Betelu"]);
  });
  it("falls back to the page title, then the site name", () => {
    expect(m({ section: { _block: "calendar" } }).title).toBe("Inicio");
    expect(m({ section: undefined, pageTitle: "" }).title).toBe("Parroquia de Betelu");
    expect(m({ section: { _block: "calendar" } }).anchor).toBe("");
  });
});

describe("qrCandidates with a section anchor", () => {
  it("links to the section first, then to the page", () => {
    expect(qrCandidates("https://s.es/?print", { hash: "horario-de-misas" })).toEqual([
      "https://s.es/?s=poster#horario-de-misas",
      "https://s.es/#horario-de-misas",
      "https://s.es/",
    ]);
  });
});
