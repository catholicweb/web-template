import { describe, it, expect } from "vitest";
import { buildEvents } from "../../docs/.vitepress/calendar-core.js";
import { REGISTRATION_LABELS, registrationLabels } from "../../docs/.vitepress/registrationLabels.js";

describe("registrationLabels", () => {
  const keys = Object.keys(REGISTRATION_LABELS.en).sort();

  it("every language defines exactly the English keys", () => {
    for (const [code, labels] of Object.entries(REGISTRATION_LABELS)) {
      expect(Object.keys(labels).sort(), code).toEqual(keys);
    }
  });

  it("keeps the {email} placeholder in every confirmation text", () => {
    for (const [code, labels] of Object.entries(REGISTRATION_LABELS)) {
      expect(labels.doneText, code).toContain("{email}");
    }
  });

  it("accepts bare codes and authored 'Label:code' entries, falls back to English", () => {
    expect(registrationLabels("es").submit).toBe("Inscribirse");
    expect(registrationLabels("Euskara:eu").submit).toBe("Eman izena");
    expect(registrationLabels("ar").submit).toBe("Register");
    expect(registrationLabels(undefined).submit).toBe("Register");
  });
});

describe("buildEvents registration switch", () => {
  const config = {
    "event-types": {
      list: [
        { id: "catequesis", defaults: { title: "Catequesis", registration: true } },
        { id: "misa", defaults: { title: "Misa" } },
      ],
    },
    calendar: {
      events: {
        list: [
          { id: "a", type: "catequesis", title: "Catequesis 1", date: ["2099-01-10"] },
          { id: "b", type: "catequesis", title: "Catequesis 2", date: ["2099-01-11"], registration: false },
          { id: "c", type: "misa", title: "Misa", date: ["2099-01-12"] },
          { id: "d", type: "misa", title: "Retiro", date: ["2099-01-13"], registration: true },
        ],
      },
    },
  };

  it("is inherited from the type defaults and overridable per event", () => {
    const byId = Object.fromEntries(buildEvents(config).map((e) => [e.id, e.registration]));
    expect(byId).toEqual({ a: true, b: undefined, c: undefined, d: true });
  });
});
