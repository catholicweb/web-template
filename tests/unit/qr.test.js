import { describe, it, expect } from "vitest";
import { qrMatrix, qrPath, qrSvgData } from "../../docs/.vitepress/theme/poster/qr.js";

// Finder pattern: 7x7 ring, 3x3 core, light separator in between.
function expectFinder(m, x0, y0) {
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const ring = x === 0 || y === 0 || x === 6 || y === 6;
      const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      expect(m[y0 + y][x0 + x], `${x},${y}`).toBe(ring || core);
    }
  }
}

describe("qrMatrix", () => {
  it("picks the smallest version that fits (21 modules for short text)", () => {
    expect(qrMatrix("hi")).toHaveLength(21);
    expect(qrMatrix("https://example.com")).toHaveLength(25); // version 2
  });

  it("draws the three finder patterns, timing lines and the dark module", () => {
    const m = qrMatrix("https://example.com/es/evento/?s=poster");
    const n = m.length;
    expectFinder(m, 0, 0);
    expectFinder(m, n - 7, 0);
    expectFinder(m, 0, n - 7);
    for (let i = 8; i < n - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
    expect(m[n - 8][8]).toBe(true);
  });

  it("is deterministic and square", () => {
    const a = qrMatrix("https://parroquia.app");
    expect(qrMatrix("https://parroquia.app")).toEqual(a);
    expect(a.every((row) => row.length === a.length)).toBe(true);
  });

  it("encodes UTF-8 and falls back to level L for longer links (up to 134 bytes)", () => {
    expect(qrMatrix("Eman izena: ñandú €").length).toBeGreaterThanOrEqual(21);
    expect(qrMatrix("x".repeat(134))).toHaveLength(41); // version 6
  });

  it("throws when the text cannot fit", () => {
    expect(() => qrMatrix("x".repeat(135))).toThrow(/too long/);
  });
});

describe("qrPath / qrSvgData", () => {
  it("emits one rectangle per horizontal run of dark modules", () => {
    expect(qrPath([[true, true, false], [false, true, false], [false, false, false]])).toBe("M0 0h2v1h-2zM1 1h1v1h-1z");
  });

  it("returns the size with the path", () => {
    const { size, path } = qrSvgData("hi");
    expect(size).toBe(21);
    expect(path.startsWith("M0 0h7")).toBe(true); // top-left finder ring starts the first row
  });
});
