import { describe, it, expect } from "vitest";
import { buildSummary, cut, sentences, whenOf } from "../../docs/.vitepress/summary.js";
import { postComplete, addMeta } from "../../docs/.vitepress/pageBuilder.js";

const TODAY = "2027-07-01";
const camp = { title: "Campamento", dates: ["2027-07-20"], times: ["10:00"], byday: [], byweek: [], locations: ["Leitza"], place: { name: "Leitza", address: "Calle 1, Leitza" }, notes: ["Una semana de convivencia para jóvenes. Incluye excursiones y talleres. Plazas limitadas."] };

describe("helpers", () => {
  it("cut breaks at a word and marks the cut", () => {
    const t = cut("palabra ".repeat(40), 60);
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t.endsWith("…")).toBe(true);
    expect(cut("corto", 60)).toBe("corto");
  });
  it("sentences keeps whole sentences and cuts a first one that is too long", () => {
    expect(sentences("Uno dos. Tres cuatro. Cinco seis.", 25)).toBe("Uno dos. Tres cuatro.");
    expect(sentences("palabra ".repeat(30), 50).endsWith("…")).toBe(true);
  });
});

describe("whenOf", () => {
  it("formats dates and times in the page's language", () => {
    expect(whenOf(camp, "es", TODAY)).toMatch(/^martes, 20 de julio · 10:00$/i);
    expect(whenOf(camp, "en", TODAY)).toMatch(/^Tuesday, July 20 · 10:00$/);
    expect(whenOf(camp, "eu", TODAY)).toContain("10:00");
  });
  it("describes recurring events with the poster labels", () => {
    const mass = { byday: ["TH"], byweek: [], times: ["19:30"] };
    expect(whenOf(mass, "es", TODAY)).toBe("Cada jueves · 19:30");
    expect(whenOf(mass, "fr", TODAY)).toBe("Chaque jeudi · 19:30");
  });
  it("leaves the recurrence words out for languages without labels (no English inside a Romanian text)", () => {
    expect(whenOf({ byday: ["TH"], times: ["19:30"] }, "ro", TODAY)).toBe("19:30");
  });
});

describe("buildSummary", () => {
  it("event page: when, place and the first sentences of the notes, within 160 chars", () => {
    const s = buildSummary({ lang: "Español:es", seo: { event: camp } }, { today: TODAY });
    expect(s.startsWith("martes, 20 de julio · 10:00 · Leitza. Una semana de convivencia para jóvenes.")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(160);
  });
  it("is built from the translated notes of the language being emitted", () => {
    const eu = { ...camp, notes: ["Gazteentzako bizikidetza astea. Txangoak eta tailerrak."] };
    const s = buildSummary({ lang: "Euskara:eu", seo: { event: eu } }, { today: TODAY });
    expect(s).toContain("Gazteentzako bizikidetza astea.");
  });
  it("event page without notes is just the facts", () => {
    expect(buildSummary({ lang: "Español:es", seo: { event: { ...camp, notes: [] } } }, { today: TODAY })).toBe("martes, 20 de julio · 10:00 · Leitza");
  });
  it("type page: the first distinct groups, then the type text", () => {
    const events = [
      { title: "Misa", byday: ["SU"], times: ["11:00"], locations: ["Leitza"] },
      { title: "Misa", byday: ["SU"], times: ["11:00"], locations: ["Leitza"] },
      { title: "Misa", byday: ["SA"], times: ["19:00"], locations: ["Areso"] },
      { title: "Rosario", byday: ["MO"], times: ["18:00"], locations: ["Betelu"] },
    ];
    const s = buildSummary({ lang: "Español:es", description: "Horarios de culto.", seo: { events } }, { today: TODAY });
    expect(s).toContain("Misa: Cada domingo · 11:00 · Leitza; Misa: Cada sábado · 19:00 · Areso…");
    expect(s).not.toContain("Rosario");
    expect(s.length).toBeLessThanOrEqual(160);
  });
  it("place page: address then the first text, or the site title when there is nothing else", () => {
    const fm = { lang: "Español:es", seo: { place: { name: "Leitza", address: "Calle 1, Leitza" } } };
    expect(buildSummary(fm, { text: "Iglesia románica del siglo XII." })).toBe("Calle 1, Leitza. Iglesia románica del siglo XII.");
    expect(buildSummary({ ...fm, seo: { place: { name: "Leitza" } } }, { siteTitle: "Parroquia de Leitza" })).toBe("Parroquia de Leitza");
  });
  it("other pages: the start of the first text; an authored description or the home page are left alone", () => {
    expect(buildSummary({ lang: "Español:es" }, { text: "Bienvenidos a la parroquia." })).toBe("Bienvenidos a la parroquia.");
    expect(buildSummary({ lang: "Español:es", description: "Escrita a mano" }, { text: "Otro texto" })).toBe("");
    expect(buildSummary({ lang: "Español:es", home: true }, { text: "Otro texto" })).toBe("");
    expect(buildSummary({ lang: "Español:es" }, { text: "" })).toBe("");
  });
});

describe("page integration", () => {
  const ctx = { CFG: { siteurl: "https://s.app", title: "Parroquia", description: "Sitio" }, resolveMedia: (u) => u, NAMING: { filename: () => "" }, videos: [], instagram: [], deps: {} };
  it("postComplete stores the summary in metaDescription, keeps description and uses it for og/twitter", async () => {
    const fm = { lang: "Español:es", title: "Campamento", description: camp.notes[0], seo: { event: camp }, sections: [{ _block: "gallery", html: "Texto" }] };
    await postComplete(fm, ctx);
    expect(fm.metaDescription).toMatch(/^martes, 20 de julio/);
    expect(fm.description).toBe(camp.notes[0]);
    const og = fm.head.find((h) => h[1].property === "og:description");
    expect(og[1].content).toBe(fm.metaDescription);
  });
  it("a plain page without description gets the start of its first text block", async () => {
    const fm = { lang: "Español:es", title: "Catequesis", sections: [{ _block: "gallery", html: "**Catequesis** de infancia. Los sábados." }] };
    await postComplete(fm, ctx);
    expect(fm.metaDescription).toBe("Catequesis de infancia. Los sábados.");
    expect(fm.description).toBeUndefined();
  });
  it("addMeta falls back to the authored description, then the site's", () => {
    const a = { title: "T", description: "Mía" };
    addMeta(a, ctx);
    expect(a.head.find((h) => h[1].property === "og:description")[1].content).toBe("Mía");
    const b = { title: "T" };
    addMeta(b, ctx);
    expect(b.head.find((h) => h[1].property === "og:description")[1].content).toBe("Sitio");
  });
});
