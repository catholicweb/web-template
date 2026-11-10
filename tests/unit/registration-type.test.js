import { describe, it, expect } from "vitest";
import { buildEvents } from "../../docs/.vitepress/calendar-core.js";

describe("buildEvents: group-level registration switch", () => {
  const config = {
    "event-types": {
      list: [
        { id: "Catequesis", registration: true, defaults: { title: "Catequesis" } },
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

  it("turns it on for every event of the group, even with an untouched event-level false", () => {
    const byId = Object.fromEntries(buildEvents(config).map((e) => [e.id, e.registration]));
    expect(byId).toEqual({ a: true, b: true, c: undefined, d: true });
  });
});
