import { describe, it, expect } from "vitest";
import { applyComplexFilter, searchableText, matchesLocation } from "../../docs/.vitepress/utils.js";

// Mirrors what calendar-core / calendar.js produce: `place` is the WHOLE place
// object from config.info.places, image URLs and address included.
const zubietaPlace = {
  id: "0e9230e6",
  name: "Zubieta",
  address: "Calle Principal, 31746 Zubieta, Navarra",
  images: [
    "https://upload.wikimedia.org/commons/Zubietako_joaldunak_iturendarren_bila.jpg",
    "https://upload.wikimedia.org/commons/Zubietako_zubiko_iturria.jpg",
  ],
};
const zubietaMass = {
  type: "mass",
  title: "Eucaristía",
  times: ["10:00"],
  byday: ["SU"],
  dates: [],
  notes: [],
  images: ["https://upload.wikimedia.org/commons/Ituren_church.jpg"],
  locations: ["Zubieta"],
  place: zubietaPlace,
  link: "/ituren-something/",
};
const iturenMass = { ...zubietaMass, locations: ["Ituren"], place: { id: "7dab", name: "Ituren", images: [] }, images: [], link: undefined };

describe("applyComplexFilter: unrelated fields must not match", () => {
  it("does not match a place name found only inside an image URL of the event's place", () => {
    // "iturendarren" (a Zubieta photo) contains "ituren"
    expect(applyComplexFilter(zubietaMass, "ituren")).toBe(false);
  });

  it("does not match the event's own image URLs or link", () => {
    expect(applyComplexFilter(zubietaMass, "ituren_church")).toBe(false);
    expect(applyComplexFilter(zubietaMass, "ituren-something")).toBe(false);
  });

  it("still matches the event's real location", () => {
    expect(applyComplexFilter(zubietaMass, "zubieta")).toBe(true);
    expect(applyComplexFilter(iturenMass, "ituren")).toBe(true);
  });

  it("keeps the structured terms working", () => {
    expect(applyComplexFilter(zubietaMass, '"type":"mass"')).toBe(true);
    expect(applyComplexFilter(zubietaMass, "!dates:empty")).toBe(false);
    expect(applyComplexFilter(zubietaMass, "dates:empty&mass")).toBe(true);
    expect(applyComplexFilter(zubietaMass, "!images:empty")).toBe(true);
    expect(applyComplexFilter(iturenMass, "images:empty")).toBe(true);
  });
});

describe("searchableText", () => {
  it("drops image URLs, place objects and links but keeps whether images exist", () => {
    const text = searchableText(zubietaMass);
    expect(text).not.toContain("ituren");
    expect(text).not.toContain("calle principal");
    expect(text).toContain('"images":[');
    expect(text).toContain("zubieta");
  });
});

describe("location: term", () => {
  const lesaka = { locations: ["Residencia Andra Mari (Lesaka)"], place: { name: "Residencia Andra Mari (Lesaka)" } };
  const donamaria = { locations: ["Carmelitas Donamaria"] };
  const free = { locations: ["Narbarte/Legasa"] };

  it("matches a whole word of a location name, ignoring case and accents", () => {
    expect(matchesLocation(lesaka, "Lesaka")).toBe(true);
    expect(matchesLocation(donamaria, "donamaria")).toBe(true);
    expect(matchesLocation(free, "narbarte")).toBe(true);
    expect(matchesLocation({ locations: ["Zubietá"] }, "zubieta")).toBe(true);
  });

  it("does not match part of a longer word", () => {
    expect(matchesLocation({ locations: ["Iturendarren"] }, "ituren")).toBe(false);
    expect(matchesLocation({ locations: ["Zubieta"] }, "ituren")).toBe(false);
  });

  it("works inside filters with & | !", () => {
    expect(applyComplexFilter(zubietaMass, "location:Zubieta&mass")).toBe(true);
    expect(applyComplexFilter(zubietaMass, "location:Ituren")).toBe(false);
    expect(applyComplexFilter(zubietaMass, "!location:Ituren")).toBe(true);
    expect(applyComplexFilter(zubietaMass, "location:Ituren|location:Zubieta")).toBe(true);
  });

  it("is false for an event without locations", () => {
    expect(matchesLocation({}, "ituren")).toBe(false);
    expect(matchesLocation({ locations: [] }, "")).toBe(false);
  });
});
