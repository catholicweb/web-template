import { describe, it, expect } from "vitest";
import {
  buildPosterModel, describeRecurrence, fitQr, formatDates, pickLayout, plainText, qrCandidates, shortUrl, titleSize,
} from "../../docs/.vitepress/theme/poster/posterModel.js";
import { panelLabels, POSTER_LABELS, posterLabels } from "../../docs/.vitepress/theme/poster/posterLabels.js";

describe("plainText", () => {
  it("strips html and markdown, keeps link text", () => {
    expect(plainText("<p>Hola <b>mundo</b></p><p>[más info](https://x.es) aquí</p>")).toBe("Hola mundo más info aquí");
  });
  it("cuts long text at a word boundary with an ellipsis", () => {
    const out = plainText("palabra ".repeat(100), 50);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out).not.toMatch(/palab…$/);
  });
  it("copes with missing input", () => {
    expect(plainText(undefined)).toBe("");
  });
});

describe("formatDates", () => {
  const today = "2026-11-21";
  it("lists upcoming dates only, sorted, and counts the hidden ones", () => {
    const { items, more } = formatDates(["2026-12-05", "2026-01-01", "2026-11-28", "2026-12-12", "2026-12-19", "2027-01-02"], "es", { today, max: 3 });
    expect(items.map((i) => i.iso)).toEqual(["2026-11-28", "2026-12-05", "2026-12-12"]);
    expect(more).toBe(2);
    expect(items[0]).toMatchObject({ day: 28 });
    expect(items[0].weekday.toLowerCase()).toBe("sábado");
  });
  it("falls back to past dates when none is upcoming, ignores junk", () => {
    expect(formatDates(["2026-01-01", "nope", ""], "en", { today }).items.map((i) => i.iso)).toEqual(["2026-01-01"]);
    expect(formatDates(undefined, "en").items).toEqual([]);
  });
});

describe("describeRecurrence", () => {
  it("names weekdays and weeks of the month in the page language", () => {
    expect(describeRecurrence({ byday: ["TH"] }, "es")).toBe("Cada jueves");
    expect(describeRecurrence({ byday: ["TH", "SA"], byweek: ["WEEK1", "WEEK3"] }, "es")).toBe("Cada jueves y sábado · semana 1 y 3 del mes");
    expect(describeRecurrence({ byday: ["MO"] }, "en")).toBe("Every Monday");
  });
  it("is empty without weekdays", () => {
    expect(describeRecurrence({ dates: ["2026-12-01"] }, "es")).toBe("");
  });
});

describe("qr links", () => {
  const page = "https://site.es/es/campamento/?x=1#top";
  it("tags the link and falls back to the plain page", () => {
    expect(qrCandidates(page)).toEqual(["https://site.es/es/campamento/?s=poster", "https://site.es/es/campamento/"]);
  });
  it("points at the registration form when asked and possible", () => {
    expect(qrCandidates(page, { target: "register", registrationId: "ev 1" })[0]).toBe("https://site.es/es/campamento/?register=ev%201&s=poster");
    expect(qrCandidates(page, { target: "register" })).toHaveLength(2);
  });
  it("fitQr drops the tracking tag when the link is too long, and gives up when nothing fits", () => {
    const base = "https://s.es/" + "a".repeat(115); // 128 bytes; with ?s=poster 138 > 134
    expect(fitQr(qrCandidates(base))?.url).toBe(base);
    expect(fitQr(["x".repeat(200)])).toBeNull();
  });
  it("shortUrl hides protocol, query and trailing slash", () => {
    expect(shortUrl(page)).toBe("site.es/es/campamento");
  });
});

describe("layout rules", () => {
  const model = (o) => ({ images: ["a.jpg"], title: "Campamento", description: "", ...o });
  it("picks by available data", () => {
    expect(pickLayout(model({}))).toBe("image");
    expect(pickLayout(model({ images: [] }))).toBe("plain");
    expect(pickLayout(model({ title: "x".repeat(61) }))).toBe("text");
    expect(pickLayout(model({ description: "x".repeat(261) }))).toBe("text");
  });
  it("shrinks long titles", () => {
    expect(titleSize("Misa", "image")).toBeGreaterThan(titleSize("x".repeat(80), "image"));
  });
});

describe("buildPosterModel", () => {
  const event = {
    id: "e1", title: "Catequesis", dates: ["2026-12-05"], times: ["17:00", "18:30"], byday: [], notes: ["<p>Para niños</p>"],
    images: ["https://d/a.webp"], locations: ["Betelu"], place: { name: "Iglesia", address: "Calle 1", image: "https://d/p.webp" },
  };
  const config = { info: { title: "Parroquia", collaborators: [{ name: "Ana", phonenumber: "600 000 000" }, { name: "Sin" }] }, theme: { accentHue: 200 } };

  it("collects what the sheet shows", () => {
    const m = buildPosterModel({ event, config, lang: "es", pageUrl: "https://s.es/es/catequesis/?print", today: "2026-11-21", registrationEvents: [{ id: "e1", title: "Catequesis" }] });
    expect(m).toMatchObject({
      title: "Catequesis", times: "17:00 · 18:30", place: "Iglesia", address: "Calle 1", description: "Para niños",
      images: ["https://d/a.webp", "https://d/p.webp"], siteName: "Parroquia", hue: 200, registrationId: "e1", pageUrl: "https://s.es/es/catequesis/",
    });
    expect(m.contacts).toEqual([{ name: "Ana", phone: "600 000 000" }]);
    expect(m.dates.items).toHaveLength(1);
  });
  it("has sane defaults for sparse events", () => {
    const m = buildPosterModel({ event: { title: "Misa" }, lang: "eu:eu", pageUrl: "https://s.es/m/" });
    expect(m).toMatchObject({ hue: 250, registrationId: null, images: [], contacts: [], recurrence: "" });
    expect(m.labels.info).toBe("Informazio gehiago");
  });
});

describe("labels", () => {
  it("every poster language defines the English keys", () => {
    const keys = Object.keys(POSTER_LABELS.en).sort();
    for (const [code, l] of Object.entries(POSTER_LABELS)) expect(Object.keys(l).sort(), code).toEqual(keys);
    expect(Object.keys(panelLabels("es")).sort()).toEqual(Object.keys(panelLabels("en")).sort());
  });
  it("keeps the {n} placeholder and falls back to English", () => {
    for (const [code, l] of Object.entries(POSTER_LABELS)) expect(l.weeks, code).toContain("{n}");
    expect(posterLabels("ar").info).toBe("More information");
    expect(posterLabels("Euskara:eu").register).toBe("Izen-ematea irekita");
  });
});
