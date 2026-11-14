import { describe, it, expect } from "vitest";
import { fundingSummary, donationMethods, segmentColor } from "../../docs/.vitepress/fundraising.js";
import { fundraisingLabels } from "../../docs/.vitepress/fundraisingLabels.js";

describe("fundingSummary", () => {
  it("keeps the legacy behaviour without sources (no segments)", () => {
    const s = fundingSummary({ goal: 10000, raised: 2500 });
    expect(s).toMatchObject({ goal: 10000, raised: 2500, progress: 25, segments: [] });
  });

  it("does not produce Infinity/NaN without a goal", () => {
    const s = fundingSummary({ raised: 500 });
    expect(s.progress).toBe(0);
    expect(s.goal).toBe(0);
  });

  it("builds one segment per source, as % of the goal", () => {
    const s = fundingSummary({
      goal: 10000,
      sources: [
        { title: "Subvención", amount: 5000 },
        { title: "Donaciones", amount: 2000 },
        { title: "Obispado", amount: 1000 },
      ],
    });
    expect(s.raised).toBe(8000);
    expect(s.progress).toBe(80);
    expect(s.segments.map((x) => x.width)).toEqual([50, 20, 10]);
    expect(s.segments.map((x) => x.title)).toEqual(["Subvención", "Donaciones", "Obispado"]);
  });

  it("shows an unlabelled 'other' segment when `raised` is bigger than the sources", () => {
    const s = fundingSummary({ goal: 1000, raised: 600, sources: [{ title: "Donaciones", amount: 400 }] });
    expect(s.raised).toBe(600);
    expect(s.segments).toHaveLength(2);
    expect(s.segments[1]).toMatchObject({ other: true, amount: 200, width: 20 });
  });

  it("uses the sources total when it is bigger than `raised`", () => {
    const s = fundingSummary({ goal: 1000, raised: 100, sources: [{ title: "A", amount: 400 }] });
    expect(s.raised).toBe(400);
    expect(s.segments).toHaveLength(1);
  });

  it("keeps the proportions when over the goal (bar spans the raised total)", () => {
    const s = fundingSummary({ goal: 1000, sources: [{ title: "A", amount: 1000 }, { title: "B", amount: 500 }] });
    expect(s.progress).toBe(150);
    expect(s.segments.map((x) => x.width)).toEqual([66.67, 33.33]);
  });

  it("spans the raised total when there is no goal", () => {
    const s = fundingSummary({ sources: [{ title: "A", amount: 300 }, { title: "B", amount: 100 }] });
    expect(s.segments.map((x) => x.width)).toEqual([75, 25]);
  });

  it("ignores invalid sources and accepts numeric strings", () => {
    const s = fundingSummary({ goal: 100, sources: [null, { title: "x" }, { title: "neg", amount: -5 }, { title: "ok", amount: "40" }, { name: "legacy name", amount: 10 }] });
    expect(s.segments.map((x) => [x.title, x.amount])).toEqual([["ok", 40], ["legacy name", 10]]);
  });

  it("gives the first segment the accent and a different colour to each other one", () => {
    expect(segmentColor(0)).toBe("var(--color-accent)");
    const colors = new Set([0, 1, 2, 3, 4].map((i) => segmentColor(i)));
    expect(colors.size).toBe(5);
    expect(segmentColor(0, true)).not.toBe(segmentColor(0));
  });
});

describe("donationMethods", () => {
  const bank = [
    { title: "BBVA", account: "ES91 2100 0418 4502 0005 1332" },
    { title: "Pagos online", account: "https://example.org/donate" },
    { title: "BIZUM", account: "03745" },
    { title: "Efectivo", account: "En la sacristía" },
  ];

  it("guesses the kind and puts Bizum first, then transfers, links and the rest", () => {
    const m = donationMethods(bank);
    expect(m.map((x) => x.kind)).toEqual(["bizum", "transfer", "link", "other"]);
    expect(m[0]).toMatchObject({ account: "03745", copy: "03745" });
  });

  it("copies IBANs without spaces", () => {
    const iban = donationMethods(bank).find((x) => x.kind === "transfer");
    expect(iban.copy).toBe("ES9121000418450200051332");
  });

  it("honours an explicit type", () => {
    const [m] = donationMethods([{ title: "Cuenta", account: "12345", type: "bizum" }]);
    expect(m.kind).toBe("bizum");
  });

  it("never renders a non-http(s) link", () => {
    const [m] = donationMethods([{ title: "x", account: "x", type: "link" }]);
    expect(m.kind).toBe("other");
    const [j] = donationMethods([{ title: "x", account: "javascript:alert(1)", type: "link" }]);
    expect(j.kind).toBe("other");
  });

  it("skips entries without account and tolerates a missing list", () => {
    expect(donationMethods([{ title: "vacío" }, null])).toEqual([]);
    expect(donationMethods(undefined)).toEqual([]);
  });
});

describe("fundraisingLabels", () => {
  it("reads Label:code languages and falls back to English", () => {
    expect(fundraisingLabels("Español:es").donate).toBe("Donar");
    expect(fundraisingLabels("Euskara:eu").funded).toBe("finantzatuta");
    expect(fundraisingLabels("Türkçe:tr").donate).toBe("Donate");
    expect(fundraisingLabels(undefined).donate).toBe("Donate");
  });

  it("keeps the {code} placeholder in every language", () => {
    for (const l of ["en", "es", "eu", "fr", "ca", "de", "it", "pt"]) expect(fundraisingLabels(l).reference).toContain("{code}");
  });
});
