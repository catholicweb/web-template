import { describe, it, expect } from "vitest";
import {
  slugify,
  applyComplexFilter,
  groupEvents,
  assembleOrder,
  DEFAULT_ORDERING,
  MASS_ORDERING,
  isMassFilter,
  formatDate,
  getCode,
  toArray,
  formatWeekdays,
  grid,
  getSectionClasses,
} from "../../docs/.vitepress/utils.js";

describe("slugify", () => {
  it("lowercases and joins words with dashes", () => {
    expect(slugify("Hola Mundo")).toBe("hola-mundo");
  });

  it("strips diacritics", () => {
    expect(slugify("Campaña de restauración")).toBe("campana-de-restauracion");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("falls back to a hash when no slug-safe chars remain", () => {
    const slug = slugify("???");
    expect(slug).toBeTruthy();
    expect(slug).toMatch(/^[a-z0-9]+$/);
  });

  it("trims surrounding whitespace and dedupes separators", () => {
    expect(slugify("  Hola   Mundo  ")).toBe("hola-mundo");
  });
});

describe("applyComplexFilter", () => {
  const obj = { title: "Misa", location: "Iglesia", notes: "cada semana" };

  it("returns true when filter is empty", () => {
    expect(applyComplexFilter(obj, "")).toBe(true);
    expect(applyComplexFilter(obj, undefined)).toBe(true);
  });

  it("matches a plain term contained in the serialized object", () => {
    expect(applyComplexFilter(obj, "Misa")).toBe(true);
    expect(applyComplexFilter(obj, "NoExiste")).toBe(false);
  });

  it("AND: every term must match", () => {
    expect(applyComplexFilter(obj, "Misa&Iglesia")).toBe(true);
    expect(applyComplexFilter(obj, "Misa&NoExiste")).toBe(false);
  });

  it("OR: any term may match", () => {
    expect(applyComplexFilter(obj, "Misa|NoExiste")).toBe(true);
    expect(applyComplexFilter(obj, "NoExiste1|NoExiste2")).toBe(false);
  });

  it("negation inverts a term", () => {
    expect(applyComplexFilter(obj, "!NoExiste")).toBe(true);
    expect(applyComplexFilter(obj, "!Misa")).toBe(false);
  });
});

describe("groupEvents", () => {
  const events = [
    { title: "Misa", times: ["10:00"], locations: ["Iglesia"] },
    { title: "Misa", times: ["12:00"], locations: ["Iglesia"] },
    { title: "Encuentro", times: ["18:00"], locations: ["Salon"] },
  ];

  it("returns events unchanged when no fields are given", () => {
    expect(groupEvents(events, [])).toEqual(events);
  });

  it("builds a nested key structure grouped by successive fields", () => {
    const grouped = groupEvents(events, ["title", "locations"]);
    expect(Object.keys(grouped).sort()).toEqual(["Encuentro", "Misa"]);
    expect(Object.keys(grouped.Misa)).toEqual(["Iglesia"]);
    expect(Object.keys(grouped.Encuentro)).toEqual(["Salon"]);
  });

  it("handles empty event lists", () => {
    expect(groupEvents([], ["title"])).toEqual({});
  });

  it("orders weekday keys from Monday to Sunday, before any dates", () => {
    const recurring = (byday, dates = []) => ({ title: "Misa", byday, dates });
    const grouped = groupEvents(
      [recurring(["SU"]), recurring([], ["2099-12-25"]), recurring(["SA"]), recurring(["MO", "TU", "WE", "TH", "FR"])],
      ["byday/dates"],
    );
    expect(Object.keys(grouped)).toEqual(["MO,TU,WE,TH,FR", "SA", "SU", "2099-12-25"]);
  });
});

describe("assembleOrder", () => {
  it("defaults to the smart ordering (5 levels)", () => {
    const order = assembleOrder({});
    expect(order).toEqual(DEFAULT_ORDERING);
    expect(order).toHaveLength(5);
  });

  it("returns a copy, so callers cannot mutate the default", () => {
    assembleOrder({}).push("x");
    expect(assembleOrder({})).toHaveLength(5);
  });

  it("honours a 5-field `ordering` string and trims its entries", () => {
    expect(assembleOrder({ ordering: "title, dates, skip, times, locations" })).toEqual(["title", "dates", "skip", "times", "locations"]);
  });

  it("falls back to the default when `ordering` has the wrong length", () => {
    expect(assembleOrder({ ordering: "title,dates" })).toEqual(DEFAULT_ORDERING);
  });

  it("keeps supporting the legacy `order` array", () => {
    expect(assembleOrder({ order: ["a", "b"] })).toEqual(["a", "b"]);
  });
});

describe("isMassFilter", () => {
  it("is true for the masses-only filter, however it is written", () => {
    expect(isMassFilter("mass")).toBe(true);
    expect(isMassFilter("  Mass ")).toBe(true);
    expect(isMassFilter('"type":"mass"')).toBe(true);
  });

  it("is true when masses are combined with other conditions", () => {
    expect(isMassFilter("mass&!byday:empty")).toBe(true);
    expect(isMassFilter("!dates:empty&mass")).toBe(true);
  });

  it("is false for filters that exclude or ignore masses", () => {
    expect(isMassFilter("!mass")).toBe(false);
    expect(isMassFilter("!byday:empty&!mass")).toBe(false);
    expect(isMassFilter("funeral")).toBe(false);
    expect(isMassFilter("!byday:empty")).toBe(false);
    expect(isMassFilter("{name}")).toBe(false);
  });

  it("needs masses in every OR alternative", () => {
    expect(isMassFilter("mass|funeral")).toBe(false);
    expect(isMassFilter("mass&!byday:empty|mass&byday:empty")).toBe(true);
  });

  it("is false for an empty or missing filter", () => {
    expect(isMassFilter("")).toBe(false);
    expect(isMassFilter("   ")).toBe(false);
    expect(isMassFilter(undefined)).toBe(false);
    expect(isMassFilter(null)).toBe(false);
  });
});

describe("assembleOrder: ordering chosen from the filter", () => {
  it("uses the mass ordering when the section shows only masses", () => {
    const order = assembleOrder({ filter: "mass" });
    expect(order).toEqual(MASS_ORDERING);
    expect(order).toEqual(["weekday", "times", "skip", "locations", "byday-weekday+byweek+notes"]);
  });

  it("treats an empty saved `ordering` (what the editor used to store) as not set", () => {
    expect(assembleOrder({ filter: "mass", ordering: "" })).toEqual(MASS_ORDERING);
    expect(assembleOrder({ filter: "funeral", ordering: "" })).toEqual(DEFAULT_ORDERING);
  });

  it("keeps the default for any other filter", () => {
    expect(assembleOrder({ filter: "!mass" })).toEqual(DEFAULT_ORDERING);
    expect(assembleOrder({ filter: "funeral" })).toEqual(DEFAULT_ORDERING);
    expect(assembleOrder({ filter: "" })).toEqual(DEFAULT_ORDERING);
  });

  it("lets legacy data win over the filter", () => {
    expect(assembleOrder({ filter: "mass", ordering: "title,dates,skip,times,locations" })).toEqual(["title", "dates", "skip", "times", "locations"]);
    expect(assembleOrder({ filter: "mass", order: ["a", "b"] })).toEqual(["a", "b"]);
  });

  it("returns a copy of the mass ordering", () => {
    assembleOrder({ filter: "mass" }).push("x");
    expect(assembleOrder({ filter: "mass" })).toHaveLength(5);
    expect(MASS_ORDERING).toHaveLength(5);
  });

  it("groups masses by weekday group, then time, then place", () => {
    const base = { byweek: [], notes: [], dates: [], byday: [] };
    const masses = [
      { ...base, title: "Misa", byday: ["SU"], times: ["12:00"], locations: ["Iglesia"] },
      { ...base, title: "Misa", byday: ["SA"], times: ["19:00"], locations: ["Iglesia"] },
      { ...base, title: "Misa", byday: ["MO", "TU", "WE", "TH", "FR"], times: ["08:00"], locations: ["Capilla"] },
    ];
    const grouped = groupEvents(masses, assembleOrder({ filter: "mass" }));
    expect(Object.keys(grouped)).toEqual(["MO,TU,WE,TH,FR", "SA", "SU"]);
    expect(Object.keys(grouped["MO,TU,WE,TH,FR"][""])).toEqual(["08:00"]);
    expect(Object.keys(grouped.SA[""]["19:00"])).toEqual(["Iglesia"]);
  });
});

describe("default ordering end to end", () => {
  const base = { byweek: [], notes: [], dates: [], byday: [] };
  const events = [
    { ...base, eventTypeTitle: "Misa", title: "Misa", byday: ["SU"], times: ["12:00"], locations: ["Iglesia"] },
    { ...base, eventTypeTitle: "Misa", title: "Misa", byday: ["SA"], times: ["19:00"], locations: ["Iglesia"] },
    { ...base, eventTypeTitle: "Misa", title: "Misa", byday: ["MO", "TU", "WE", "TH", "FR"], times: ["08:00"], locations: ["Capilla"] },
    { ...base, eventTypeTitle: "Adoración", title: "Adoración", byday: ["FR"], byweek: ["WEEK1"], times: ["20:00"], locations: ["Iglesia"] },
    {
      ...base,
      eventTypeTitle: "Concierto",
      title: "Concierto de Navidad",
      dates: ["2099-12-25"],
      times: ["20:00"],
      locations: ["Catedral"],
      notes: ["Entrada libre"],
    },
  ];
  const grouped = groupEvents(events, assembleOrder({}));

  it("makes one table per event type", () => {
    expect(Object.keys(grouped)).toEqual(["Misa", "Adoración", "Concierto"]);
  });

  it("lists recurring events by weekday, Monday first", () => {
    expect(Object.keys(grouped.Misa)).toEqual(["MO,TU,WE,TH,FR", "SA", "SU"]);
  });

  it("uses one line per time, never repeating the type title", () => {
    expect(Object.keys(grouped.Misa.SA[""])).toEqual(["19:00"]);
    expect(Object.keys(grouped.Misa.SA[""]["19:00"])).toEqual(["Iglesia"]);
  });

  it("shows the week of the month before the place", () => {
    expect(Object.keys(grouped["Adoración"].FR[""]["20:00"])).toEqual(["WEEK1", "Iglesia"]);
  });

  it("keeps a single line for one-off events, with the title first in the extra info", () => {
    const lines = grouped.Concierto["2099-12-25"][""];
    expect(Object.keys(lines)).toEqual(["20:00"]);
    expect(Object.keys(lines["20:00"])).toEqual(["Concierto de Navidad", "Catedral", "Entrada libre"]);
  });
});

describe("formatDate", () => {
  it("formats a Spanish date with month name", () => {
    expect(formatDate("25/12/2099", "Español:es")).toBe("25 Diciembre");
  });

  it("formats a future-year Basque date with leading month", () => {
    expect(formatDate("25/12/2099", "Euskara:eu")).toBe("Abenduak 25");
  });

  it("appends the year for a past date", () => {
    expect(formatDate("25/12/2020", "Español:es")).toBe("25 Diciembre (2020)");
  });

  it("returns empty string for non-string input", () => {
    expect(formatDate(123, "Español:es")).toBe("");
  });

  it("returns the input unchanged when lang is not a string", () => {
    expect(formatDate("25/12/2099", 5)).toBe("25/12/2099");
  });
});

describe("getCode", () => {
  it("extracts the code after the colon", () => {
    expect(getCode("Español:es")).toBe("es");
    expect(getCode("Euskara:eu")).toBe("eu");
  });

  it("falls back to the first two lowercase letters", () => {
    expect(getCode("es")).toBe("es");
    expect(getCode("Español")).toBe("es");
  });
});

describe("toArray", () => {
  it("returns non-empty arrays as-is", () => {
    expect(toArray(["a", "b"])).toEqual(["a", "b"]);
  });

  it("returns empty array for an empty array", () => {
    expect(toArray([])).toEqual([]);
  });

  it("wraps a string in an array", () => {
    expect(toArray("x")).toEqual(["x"]);
  });

  it("returns empty array for non-array non-string values", () => {
    expect(toArray(5)).toEqual([]);
    expect(toArray(null)).toEqual([]);
    expect(toArray(undefined)).toEqual([]);
  });
});

describe("formatWeekdays", () => {
  it("sorts days into week order", () => {
    expect(formatWeekdays(["FR", "SA"])).toEqual(["FR", "SA"]);
    expect(formatWeekdays(["SU", "MO"])).toEqual(["MO", "SU"]);
  });

  it("consolidates a full MO-FR run into a single token", () => {
    expect(formatWeekdays(["FR", "MO", "TU", "WE", "TH"])).toEqual(["MO,TU,WE,TH,FR"]);
  });

  it("keeps weekend days separate after an MO-FR consolidation", () => {
    expect(formatWeekdays(["SU", "MO", "TU", "WE", "TH", "FR", "SA"])).toEqual([
      "MO,TU,WE,TH,FR",
      "SA",
      "SU",
    ]);
  });
});
