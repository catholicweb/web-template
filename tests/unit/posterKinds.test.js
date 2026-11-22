import { describe, it, expect } from "vitest";
import {
  buildHomeModel, buildListModel, contactsOf, flattenSchedule, scheduleSections, socialOf,
} from "../../docs/.vitepress/theme/poster/posterModel.js";
import { posterLabels } from "../../docs/.vitepress/theme/poster/posterLabels.js";

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

describe("flattenSchedule", () => {
  const stub = [{}];
  const tree = {
    "MO,TU,WE,TH,FR": { "08:00": { "": { Betelu: { "": stub } } }, "19:30": { "": { Leitza: { "": stub }, Betelu: { "#2": stub } } } },
    SA: { "19:00": { "": { Leitza: { "1ª semana": stub } } } },
    "2026-01-01": { "10:00": { "": { Betelu: { "": stub } } } },
    "2026-12-24": { "22:00": { "": { Betelu: { "Misa del gallo": stub } } } },
  };
  const groups = flattenSchedule(tree, "Español:es", "Euskara:eu", { today: "2026-11-22" });

  it("makes one group per heading with a line per path: time first, the rest as text", () => {
    expect(groups.map((g) => g.heading)).toEqual(["Lunes a viernes", "Sábados", "24 Diciembre"]);
    expect(groups[0].lines).toEqual([
      { time: "08:00", text: "Betelu", text2: "" },
      { time: "19:30", text: "Leitza", text2: "" },
      { time: "19:30", text: "Betelu", text2: "" }, // the "#2" index suffix is hidden
    ]);
    expect(groups[1].lines[0]).toMatchObject({ time: "19:00", text: "Leitza · 1ª semana" });
  });
  it("adds the second language's headings, only when they differ", () => {
    expect(groups[0].heading2).toBe("Astelehenetik ostiralera");
    expect(flattenSchedule(tree, "Español:es", "", { today: "2026-11-22" })[0].heading2).toBe("");
  });
  it("drops dated headings in the past and puts dated ones after the weekly ones", () => {
    expect(groups.some((g) => g.key === "2026-01-01")).toBe(false);
    expect(groups.at(-1)).toMatchObject({ dated: true, key: "2026-12-24" });
  });
  it("caps the dated headings and copes with empty input", () => {
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`2026-12-${String(10 + i)}`, { "10:00": stub }]));
    expect(flattenSchedule(many, "es", "", { today: "2026-11-22", maxDated: 3 })).toHaveLength(3);
    expect(flattenSchedule(undefined, "es")).toEqual([]);
  });
});

describe("scheduleSections", () => {
  it("keeps calendar sections with events, masses first", () => {
    const sections = [{ _block: "text" }, { _block: "calendar", filter: "retiro", events: { a: {} } }, { _block: "calendar", filter: "mass", events: { b: {} } }, { _block: "calendar", filter: "mass", events: {} }];
    expect(scheduleSections(sections).map((s) => s.filter)).toEqual(["mass", "retiro"]);
  });
});

describe("buildListModel", () => {
  const events = [
    { id: "a", title: "Catequesis SA", byday: ["SA"], times: ["11:00"], locations: ["Betelu"], notes: ["<p>Niños</p>"], images: ["https://d/a.jpg"] },
    { id: "b", title: "Retiro", dates: ["2026-12-19", "2026-12-20", "2026-12-21"] },
    { id: "c", title: "Catequesis FR", byday: ["FR"] },
    { id: "d", title: "Encuentro", dates: ["2026-12-05"], times: ["17:30"], locations: ["Leitza"] },
    { id: "e", title: "Viejo", dates: ["2025-01-01"] },
  ];
  const m = buildListModel({ events, config, lang: "Español:es", pageUrl: "https://s.es/catequesis/?print", title: "Catequesis", today: "2026-11-22", images: ["https://d/type.jpg"] });

  it("lists upcoming dated events by date, then recurring ones by weekday, and drops finished ones", () => {
    expect(m.items.map((i) => i.key)).toEqual(["d", "b", "c", "a"]);
  });
  it("describes each row", () => {
    const [d, b, , a] = m.items;
    expect(d.day).toMatchObject({ day: 5, month: "dic", more: 0 });
    expect(d.whenLine).toBe("17:30 - Leitza");
    expect(b.day.more).toBe(2);
    expect(a).toMatchObject({ recurring: true, recurrence: "Cada sábado", description: "Niños", whenLine: "11:00 - Betelu" });
  });
  it("carries the page data: title, pictures, contacts", () => {
    expect(m).toMatchObject({ kind: "list", title: "Catequesis", pageUrl: "https://s.es/catequesis/", siteName: "Parroquia de Betelu", hue: 200 });
    expect(m.images).toEqual(["https://d/type.jpg", "https://d/a.jpg"]);
    expect(m.contacts).toHaveLength(1);
  });
  it("adds the second language titles when they differ", () => {
    const texts2 = events.map((e, i) => ({ title: i === 1 ? "Retiro" : `${e.title} (eu)`, description: "bai" }));
    const m2 = buildListModel({ events, texts2, config, lang: "es", pageUrl: "https://s.es/c/", today: "2026-11-22", second: { lang: "eu" } });
    expect(m2.second).toMatchObject({ code: "eu" });
    expect(m2.items.find((i) => i.key === "a").title2).toBe("Catequesis SA (eu)");
    expect(m2.items.find((i) => i.key === "b").title2).toBe(""); // same text in both languages
    expect(buildListModel({ events, texts2, config, lang: "es", pageUrl: "https://s.es/c/", today: "2026-11-22" }).items[0].title2).toBe("");
  });
});

describe("buildHomeModel", () => {
  const tree = { SU: { "10:00": { "": { Betelu: { "": [{}] } } } } };
  const sections = [{ _block: "calendar", filter: "retiro", title: "Retiros", events: { SA: { "11:00": [{}] } } }, { _block: "calendar", filter: "mass", events: tree }];
  const home = (o = {}) => buildHomeModel({ sections, config, lang: "Español:es", pageUrl: "https://s.es/?print", today: "2026-11-22", ...o });

  it("uses the mass calendar by default, with the site name and contact data", () => {
    const m = home();
    expect(m).toMatchObject({ kind: "home", title: "Parroquia de Betelu", scheduleTitle: "Horario de misas", pageUrl: "https://s.es/", social: ["instagram.com/parroquiabetelu", "youtube.com/@betelu"] });
    expect(m.groups.map((g) => g.heading)).toEqual(["Domingos"]);
    expect(m.calendars.map((c) => c.mass)).toEqual([true, false]);
    expect(m.emails).toEqual(["miguel@betelu.org"]);
  });
  it("can show another calendar, under the generic title", () => {
    const m = home({ calIndex: 1 });
    expect(m.scheduleTitle).toBe("Horarios");
    expect(m.groups[0].heading).toBe("Sábados");
  });
  it("lets a temple lend its name and picture", () => {
    const m = home({ place: config.info.places[0] });
    expect(m.title).toBe("Leitza");
    expect(m.images).toEqual(["/leitza.jpg", "/site.jpg"]);
    expect(m.places.map((p) => p.name)).toEqual(["Leitza", "Betelu"]); // unnamed place skipped
  });
  it("prints both languages when a second one is given", () => {
    const m = home({ second: { lang: "Euskara:eu" } });
    expect(m.scheduleTitle2).toBe(posterLabels("eu").mass);
    expect(m.groups[0].heading2).toBe("Igandetan");
  });
  it("has no groups without a calendar", () => {
    expect(home({ sections: [] }).groups).toEqual([]);
  });
});
