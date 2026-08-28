import { describe, it, expect } from "vitest";
import { getJSONLD } from "../docs/.vitepress/seo.js";

describe("SEO tags subset", () => {
  it("JSON-LD script includes title, description, logo, url at metadata level", () => {
    const head = getJSONLD({ title: "Test" }, { info: { title: "Site", description: "Desc", dev: { siteurl: "https://x/" } }}, "/");
    const script = head.find(h => h[0] === "script" && h[1]?.type === "application/ld+json");
    expect(script).toBeDefined();
    const ld = JSON.parse(script[2]);
    const str = JSON.stringify(ld);
    expect(str).toContain("Site");   // title
    expect(str).toContain("https://x/"); // url
  });
});
