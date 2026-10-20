import { describe, it, expect } from "vitest";
import { defaultTags, withDefaultTags, grid } from "../../docs/.vitepress/utils.js";
import { createContext, prepare, autocomplete, finalize } from "../../docs/.vitepress/pageBuilder.js";

describe("defaultTags", () => {
  it("adds every default when the user picked nothing", () => {
    expect(defaultTags(undefined, ["horizontal", "medium"])).toEqual(["horizontal", "medium"]);
    expect(defaultTags([], ["small"])).toEqual(["small"]);
  });

  it("a size picked by the user beats a default size, whichever comes first in grid()", () => {
    expect(defaultTags(["large"], ["medium"])).toEqual(["large"]);
    expect(defaultTags(["xl"], ["small"])).toEqual(["xl"]);
  });

  it("a layout picked by the user beats a default layout", () => {
    expect(defaultTags(["vertical"], ["horizontal"])).toEqual(["vertical"]);
    expect(defaultTags(["carousel"], ["masonry"])).toEqual(["carousel"]);
  });

  it("layout and size are independent groups", () => {
    expect(defaultTags(["large"], ["horizontal", "medium"])).toEqual(["large", "horizontal"]);
    expect(defaultTags(["carousel"], ["small"])).toEqual(["carousel", "small"]);
  });

  it("tags outside the groups are always kept and added", () => {
    expect(defaultTags(["dark"], ["visualCards"])).toEqual(["dark", "visualCards"]);
  });

  it("does not duplicate a tag and does not mutate its input", () => {
    const tags = ["small"];
    expect(defaultTags(tags, ["small"])).toEqual(["small"]);
    defaultTags(tags, ["3d"]);
    expect(tags).toEqual(["small"]);
  });
});

describe("withDefaultTags + grid()", () => {
  const items = [{}, {}, {}];

  it("keeps the default look when nothing is selected", () => {
    expect(grid(withDefaultTags({ elements: items }, ["small"]))).toContain("*:lg:w-1/4");
  });

  it("renders the size the user selected instead of the default", () => {
    const css = grid(withDefaultTags({ tags: ["large"], elements: items }, ["medium"]));
    expect(css).toContain("*:sm:w-2/3");
    expect(css).not.toContain("*:md:w-1/3");
  });

  it("supports the wide size (1 / 2 / 3 columns)", () => {
    const css = grid({ tags: ["wide"], elements: items });
    expect(css).toContain("*:md:w-1/2");
    expect(css).toContain("*:lg:w-1/3");
  });
});

describe("pageBuilder defaults yield to the user", () => {
  const ctx = createContext({ config: {}, calendar: [], dictionary: {} });

  it("image galleries default to small", async () => {
    const data = prepare({ title: "x", sections: [{ type: "gallery", images: ["https://x.test/a.jpg"] }] });
    await autocomplete(data, ctx.pages, ctx);
    expect(data.sections[0].tags).toEqual(["small"]);
  });

  it("image galleries keep a size the user chose (no forced small)", async () => {
    const data = prepare({ title: "x", sections: [{ type: "gallery", images: ["https://x.test/a.jpg"], tags: ["large", "carousel"] }] });
    await autocomplete(data, ctx.pages, ctx);
    expect(data.sections[0].tags).toEqual(["large", "carousel"]);
  });

  it("link sections keep the user's size too", async () => {
    const data = prepare({ title: "x", sections: [{ _block: "links", links: ["https://example.com/a"], tags: ["xl"] }] });
    await autocomplete(data, ctx.pages, ctx);
    expect(data.sections[0].tags).toEqual(["xl"]);
  });

  it("youtube channel defaults to a horizontal strip unless the user chose a layout and size", async () => {
    const plain = prepare({ title: "x", sections: [{ type: "video-channel" }] });
    await autocomplete(plain, ctx.pages, ctx);
    const outPlain = await finalize(plain, "Español:es", ctx);
    expect(outPlain.sections[0].tags).toEqual(expect.arrayContaining(["horizontal", "medium"]));

    const custom = prepare({ title: "x", sections: [{ type: "video-channel", tags: ["vertical", "large"] }] });
    await autocomplete(custom, ctx.pages, ctx);
    const outCustom = await finalize(custom, "Español:es", ctx);
    expect(outCustom.sections[0].tags).toEqual(expect.arrayContaining(["vertical", "large"]));
    expect(outCustom.sections[0].tags).not.toContain("horizontal");
    expect(outCustom.sections[0].tags).not.toContain("medium");
  });
});
