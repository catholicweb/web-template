import { describe, it, expect } from "vitest";
import { createNaming } from "../../docs/.vitepress/naming.js";
import { planEventPages, localizeEventLinks } from "../../docs/.vitepress/eventPages.js";

const es = "Español:es";
const en = "English:en";

describe("translated event URLs", () => {
  const naming = createNaming({ languages: [es, en], dictionary: { [en]: { Juventud: "Youth", "Campamento verano": "Summer camp" } } });

  it("translates a type page title", () => {
    expect(naming.filename("juventud.md", "Juventud", es)).toBe("juventud");
    expect(naming.filename("juventud.md", "Juventud", en)).toBe("en/youth");
  });

  it("translates the title of an event page (no date in the URL)", () => {
    expect(naming.filename("campamento-verano.md", "Campamento verano", es)).toBe("campamento-verano");
    expect(naming.filename("campamento-verano.md", "Campamento verano", en)).toBe("en/summer-camp");
  });

  it("uses the slug verbatim for plain (original) names", () => {
    expect(naming.filename("campamento-verano", "Campamento verano", en)).toBe("en/campamento-verano");
  });

  it("prefix is empty for the default language", () => {
    expect(naming.prefix(es)).toBe("");
    expect(naming.prefix(en)).toBe("en/");
  });
});

describe("event page slugs in the plan", () => {
  it("planEventPages names a page after the event title only", () => {
    const cfg = {
      "event-types": { list: [] },
      pages: { list: [], pageperevent: ["camp"] },
      calendar: { events: { list: [{ type: "camp", title: "Campamento", date: ["2099-07-20"] }] } },
    };
    const calendar = [{ type: "camp", title: "Campamento", dates: ["2099-07-20"], byday: [], byweek: [] }];
    const [page] = planEventPages({ config: cfg, calendar }).eventPages;
    expect(page.slug).toBe("campamento");
    expect(page).not.toHaveProperty("suffix");
  });
});

describe("localizeEventLinks", () => {
  const links = new Map([["/misa/", "/mass/"]]);

  it("rewrites event links in sections and page events without mutating the input", () => {
    const data = { title: "P", events: [{ link: "/misa/" }], sections: [{ events: [{ title: "Misa", link: "/misa/" }, { title: "Other" }] }, { _block: "text" }] };
    const out = localizeEventLinks(data, links);
    expect(out.sections[0].events[0].link).toBe("/mass/");
    expect(out.sections[0].events[1]).toEqual({ title: "Other" });
    expect(out.events[0].link).toBe("/mass/");
    expect(data.sections[0].events[0].link).toBe("/misa/");
  });

  it("does not add keys the data did not have", () => {
    const out = localizeEventLinks({ title: "P" }, links);
    expect("sections" in out).toBe(false);
    expect("events" in out).toBe(false);
  });
});
