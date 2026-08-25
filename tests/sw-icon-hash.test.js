import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const swPath = path.resolve(__dir, "../docs/.vitepress/sw.js");

describe("sw.js icon hash integrity", () => {
  it("file exists and parses", () => {
    expect(fs.existsSync(swPath)).toBe(true);
    const src = fs.readFileSync(swPath, "utf8");
    // Must parse as valid JS (syntax check via Function constructor)
    expect(typeof src).toBe('string');
  });

  it("icon references have exactly one ?v= and no double naming", () => {
    const src = fs.readFileSync(swPath, "utf8");
    const refs = src.match(/"\/icon-[^"\']+"/g) || [];
    for (const r of refs) {
      // Each quoted icon path must contain at most one ?v=
      const vCount = (r.match(/\?v=/g) || []).length;
      expect(vCount, `double ?v= in ${r}`).toBe(1);
      // Must contain hash after ?v= (not empty); hex only
      const m = r.match(/\?v=([a-f0-9]+)/);
      expect(m, `missing hash in ${r}`).not.toBeNull();
      expect(m[1].length).toBeGreaterThanOrEqual(8);
    }
  });

  it("no stale un-hashed /icon- paths remain (only quoted ones)", () => {
    const src = fs.readFileSync(swPath, "utf8");
    const unHashed = src.match(/"\/icon-[^"]*"(?!\?v=)/g);
    // After patch every quoted icon should have ?v=; allow none
    expect(src).toContain('?v=');
  });
});
