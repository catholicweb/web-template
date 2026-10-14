import { describe, it, expect } from "vitest";
import { eventPageSlug, planEventPages } from "../../docs/.vitepress/eventPages.js";
import { buildEvents, sortEvents } from "../../docs/.vitepress/calendar-core.js";

describe("eventPageSlug", () => {
  it("uses title + first date for dated events (unchanged)", () => {
    expect(eventPageSlug({ title: "Campamento verano", dates: ["2099-07-20"], byday: [], byweek: [] })).toBe("campamento-verano-2099-07-20");
  });

  it("falls back to byweek/byday when rrule is missing", () => {
    expect(eventPageSlug({ title: "Catequesis", dates: [], byweek: [], byday: ["SA"] })).toBe("catequesis-sa");
    expect(eventPageSlug({ title: "Catequesis", dates: [], byweek: ["WEEK1"], byday: ["SA", "SU"] })).toBe("catequesis-week1-sa-su");
  });

  it("keeps an explicit rrule when present", () => {
    expect(eventPageSlug({ title: "Misa", dates: [], rrule: ["su"], byday: ["MO"] })).toBe("misa-su");
  });

  it("plain events without recurrence keep the old slug", () => {
    expect(eventPageSlug({ title: "Misa" })).toBe("misa");
  });

  it("recurring events with the same title no longer collide", () => {
    const config = {
      "event-types": { list: [{ id: "cat", label: "Catequesis" }] },
      pages: { list: [], pageperevent: ["cat"] },
      calendar: {
        events: {
          list: [
            { type: "cat", title: "Catequesis", rrule: ["SA"], times: ["10:00"] },
            { type: "cat", title: "Catequesis", rrule: ["SU"], times: ["11:00"] },
          ],
        },
      },
    };
    const calendar = sortEvents(buildEvents(config, new Date("2026-01-01")));
    const slugs = planEventPages({ config, calendar }).eventPages.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(2);
  });
});
