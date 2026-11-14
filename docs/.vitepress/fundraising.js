// Pure, browser-safe helpers of the fundraising block (theme/components/Fundraising.vue).
// No fs / node imports, so they run in the data loader (blocks.data.js), the component and the tests.

const num = (v) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Colour of the i-th bar segment. The first one is the site accent; the next ones rotate the
// accent hue by the golden angle, so any number of sources stays distinguishable and on-theme.
export function segmentColor(i, other = false) {
  if (other) return "#cbd5e1"; // slate-300: "not attributed to a source"
  if (i === 0) return "var(--color-accent)";
  return `oklch(64% 0.17 calc(var(--accent-hue) + ${Math.round(i * 137.5) % 360}))`;
}

// Totals and bar segments of a fundraising section.
//   sources: [{ title, amount }]  optional split of what has been raised (grant, donations, bishopric...)
//   raised:  total raised; when sources are given, whatever they do not add up to shows as an
//            unlabelled "other" segment, so sites that keep `raised` as the grand total stay correct.
// Segment widths are % of the bar, which spans the goal (or the raised total when it is over the
// goal or there is no goal), so the proportions between sources always hold.
export function fundingSummary(section = {}) {
  const goal = num(section.goal);
  const sources = (Array.isArray(section.sources) ? section.sources : [])
    .map((s) => ({ title: String(s?.title ?? s?.name ?? "").trim(), amount: num(s?.amount) }))
    .filter((s) => s.amount > 0);
  const summed = sources.reduce((acc, s) => acc + s.amount, 0);
  const declared = num(section.raised);
  const raised = sources.length ? Math.max(summed, declared) : declared;
  const progress = goal ? Math.round((raised / goal) * 100) : 0;

  const parts = [...sources];
  if (sources.length && raised > summed) parts.push({ title: "", amount: raised - summed, other: true });
  const scale = Math.max(goal, raised) || 1;
  let color = 0;
  const segments = parts.map((p) => ({
    ...p,
    width: Math.round((p.amount / scale) * 10000) / 100,
    color: segmentColor(p.other ? 0 : color++, !!p.other),
  }));

  return { goal, raised, progress, segments };
}

const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i;
const ORDER = { bizum: 0, transfer: 1, link: 2, other: 3 };

// Ways to donate, from config.info.bank ([{ title, account }], the same list the footer prints).
// The kind is guessed from the entry (a link, "Bizum" in the title, an IBAN) unless it carries an
// explicit `type` ("bizum" | "transfer" | "link"). Bizum first, then transfers, then links.
export function donationMethods(bank) {
  if (!Array.isArray(bank)) return [];
  return bank
    .map((b, i) => {
      const account = String(b?.account ?? "").trim();
      const title = String(b?.title ?? "").trim();
      if (!account) return null;
      const compact = account.replace(/\s+/g, "");
      let kind = ["bizum", "transfer", "link"].includes(b?.type) ? b.type : null;
      if (!kind) {
        if (/^https?:\/\//i.test(account)) kind = "link";
        else if (/bizum/i.test(title)) kind = "bizum";
        else if (IBAN.test(compact)) kind = "transfer";
        else kind = "other";
      }
      if (kind === "link" && !/^https?:\/\//i.test(account)) kind = "other"; // never render a non-http(s) href
      const copy = kind === "link" ? "" : kind === "other" ? account : compact;
      return { kind, title, account, copy, i };
    })
    .filter(Boolean)
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.i - b.i);
}
