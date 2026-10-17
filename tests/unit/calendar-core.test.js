import { describe, it, expect } from "vitest";
import { buildEvents, buildTypeTitles } from "../../docs/.vitepress/calendar-core.js";

const config = {
  "event-types": {
    list: [
      { id: "Mass", label: "Misa", defaults: { title: "Eucaristía" } },
      { id: "talk", defaults: { name: "Charla" } },
      { id: "bare" },
    ],
  },
  calendar: {
    events: {
      list: [
        { type: "mass", title: "Misa de 12", times: ["12:00"] },
        { type: "talk", times: ["20:00"] },
        { type: "bare", title: "Retiro" },
        { type: "unknown", title: "Otro" },
        { title: "Sin tipo" },
      ],
    },
  },
};

describe("buildTypeTitles", () => {
  it("prefers the label, then defaults.title, then defaults.name", () => {
    const titles = buildTypeTitles(config);
    expect(titles.mass).toBe("Misa");
    expect(titles.talk).toBe("Charla");
  });

  it("leaves out types without any title (no fallback to the raw id)", () => {
    expect(buildTypeTitles(config)).not.toHaveProperty("bare");
  });

  it("tolerates a config without event types", () => {
    expect(buildTypeTitles({})).toEqual({});
  });
});

describe("buildEvents eventTypeTitle", () => {
  const events = buildEvents(config);

  it("uses the type title when the type has one", () => {
    expect(events[0].eventTypeTitle).toBe("Misa");
    expect(events[1].eventTypeTitle).toBe("Charla");
  });

  it("falls back to the event title for untitled, unknown or missing types", () => {
    expect(events[2].eventTypeTitle).toBe("Retiro");
    expect(events[3].eventTypeTitle).toBe("Otro");
    expect(events[4].eventTypeTitle).toBe("Sin tipo");
  });

  it("keeps the event's own title untouched", () => {
    expect(events[0].title).toBe("Misa de 12");
  });
});
