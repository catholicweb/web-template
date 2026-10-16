import { describe, it, expect } from "vitest";
import { buildEvents, labelEvents, typeLabelOf } from "../../docs/.vitepress/calendar-core.js";
import { translateObject, extractValues } from "../../docs/.vitepress/translate-core.js";

const config = {
  "event-types": {
    list: [
      { id: "mass", label: "Eucaristía", defaults: { title: "Misa" } },
      { id: "cat", defaults: { title: "Catequesis" } },
      { id: "talk", defaults: {} },
    ],
  },
  calendar: {
    events: {
      list: [
        { type: "mass", rrule: ["su"], times: ["10:00"] },
        { type: "mass", title: "Misa de difuntos", rrule: ["mo"], times: ["19:00"] },
        { type: "mass", title: "Eucaristía", rrule: ["tu"] },
        { type: "cat", title: "Catequesis jóvenes", rrule: ["fr"] },
        { type: "talk", title: "Conferencia", date: ["2099-01-01"] },
      ],
    },
  },
};

describe("typeLabelOf", () => {
  it("prefers label, then default title, then default name, never the id", () => {
    expect(typeLabelOf({ id: "x", label: "L", defaults: { title: "T" } })).toBe("L");
    expect(typeLabelOf({ id: "x", defaults: { title: "T", name: "N" } })).toBe("T");
    expect(typeLabelOf({ id: "x", defaults: { name: "N" } })).toBe("N");
    expect(typeLabelOf({ id: "uuid-1234", defaults: {} })).toBe("");
    expect(typeLabelOf(undefined)).toBe("");
  });
});

describe("buildEvents: typeLabel / subtitle", () => {
  const events = buildEvents(config, new Date("2026-06-01"));
  const by = (title) => events.find((e) => e.title === title);

  it("labels events with their type's public name", () => {
    expect(by("Misa").typeLabel).toBe("Eucaristía");
    expect(by("Catequesis jóvenes").typeLabel).toBe("Catequesis");
  });

  it("leaves subtitle empty when the title is just the type's own name", () => {
    expect(by("Misa").subtitle).toBe(""); // inherited default title
    expect(by("Eucaristía").subtitle).toBe(""); // equals the label
  });

  it("keeps the event title as subtitle when it adds information", () => {
    expect(by("Misa de difuntos").subtitle).toBe("Misa de difuntos");
    expect(by("Catequesis jóvenes").subtitle).toBe("Catequesis jóvenes");
  });

  it("types without any public name get no label and no subtitle", () => {
    expect(by("Conferencia")).toMatchObject({ typeLabel: "", subtitle: "" });
  });
});

describe("labelEvents", () => {
  it("labels events lacking the fields (ICS / stale calendar.json) and keeps labelled ones", () => {
    const out = labelEvents(
      [
        { type: "mass", title: "Misa de difuntos" },
        { type: "ics", title: "X" },
        { type: "mass", title: "Y", typeLabel: "Keep", subtitle: "k" },
      ],
      config,
    );
    expect(out[0]).toMatchObject({ typeLabel: "Eucaristía", subtitle: "Misa de difuntos" });
    expect(out[1]).toMatchObject({ typeLabel: "", subtitle: "" });
    expect(out[2]).toMatchObject({ typeLabel: "Keep", subtitle: "k" });
  });

  it("does not mutate its input", () => {
    const input = [{ type: "mass", title: "Z" }];
    labelEvents(input, config);
    expect(input[0]).not.toHaveProperty("typeLabel");
  });
});

describe("translation of the derived fields", () => {
  const ev = { typeLabel: "Eucaristía", subtitle: "Misa de difuntos", locations: ["Leitza"] };

  it("translates typeLabel and subtitle", () => {
    const out = translateObject(ev, { Eucaristía: "Eukaristia", "Misa de difuntos": "Hildakoen meza" });
    expect(out).toMatchObject({ typeLabel: "Eukaristia", subtitle: "Hildakoen meza", locations: ["Leitza"] });
  });

  it("harvests them for the dictionary", () => {
    expect(extractValues([ev])).toEqual(expect.arrayContaining(["Eucaristía", "Misa de difuntos"]));
  });
});
