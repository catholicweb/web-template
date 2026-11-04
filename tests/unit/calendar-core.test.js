import { describe, it, expect } from "vitest";
import { buildEvents, buildTypeTitles, asSections } from "../../docs/.vitepress/calendar-core.js";

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

describe("buildEvents ids", () => {
  it("carries the editor id so the event page URL can be tracked", () => {
    const events = buildEvents({ calendar: { events: { list: [{ id: "ev_1", title: "Retiro" }, { title: "Sin id" }] } } });
    expect(events[0].id).toBe("ev_1");
    expect(events[1].id).toBeUndefined();
  });
});

describe("buildEvents sections", () => {
  const typeSection = { _block: "text", html: "from the type" };
  const eventSection = { _block: "text", html: "from the event" };
  const build = (evt, defaults = { sections: [typeSection] }) =>
    buildEvents({
      "event-types": { list: [{ id: "camp", defaults }] },
      calendar: { events: { list: [{ type: "camp", title: "Campamento", ...evt }] } },
    })[0];

  it("keeps the type's sections when the event has an empty list", () => {
    expect(build({ sections: [] }).sections).toEqual([typeSection]);
  });

  it("keeps the type's sections when the event has none at all", () => {
    expect(build({}).sections).toEqual([typeSection]);
  });

  it("adds the event's sections after the type's instead of replacing them", () => {
    expect(build({ sections: [eventSection] }).sections).toEqual([typeSection, eventSection]);
  });

  it("uses the event's sections when the type has none", () => {
    expect(build({ sections: [eventSection] }, {}).sections).toEqual([eventSection]);
  });

  it("leaves the field out when neither has sections", () => {
    expect(build({ sections: [] }, {})).not.toHaveProperty("sections");
  });

  it("does not touch the type's list when merging", () => {
    const defaults = { sections: [typeSection] };
    build({ sections: [eventSection] }, defaults);
    expect(defaults.sections).toEqual([typeSection]);
  });
});

describe("asSections", () => {
  it("accepts a list, a single section or nothing, and drops non-objects", () => {
    expect(asSections([{ a: 1 }, "", null])).toEqual([{ a: 1 }]);
    expect(asSections({ a: 1 })).toEqual([{ a: 1 }]);
    expect(asSections(undefined)).toEqual([]);
    expect(asSections("")).toEqual([]);
  });
});
