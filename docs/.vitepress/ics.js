// ICS (RFC 5545) generation for the calendar events produced by calendar.js.
// Pure module (no I/O) so it can be unit-tested; calendar.js writes the result
// to docs/public/calendar.ics. The file imports cleanly into Google Calendar
// (Settings → Import & export) and can also be subscribed to by URL.
import crypto from "node:crypto";

const TZ = "Europe/Madrid";
const DEFAULT_DURATION_MIN = 60; // events carry a start time only
const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]; // Date#getUTCDay order

const pad = (n, len = 2) => String(n).padStart(len, "0");
const ymd = ({ y, m, d }) => `${y}${pad(m)}${pad(d)}`;
const dayKey = (d) => ymd(d);

// Accepts "YYYY-M-D" (padded or not), "DD/MM/YYYY", or a Date / ISO timestamp
// (the latter converted to the calendar's own time zone). Returns {y,m,d}|null.
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date || (typeof value === "string" && value.includes("T"))) {
    const date = new Date(value);
    if (isNaN(date)) return null;
    return parseDate(date.toLocaleDateString("en-CA", { timeZone: TZ }));
  }
  const s = String(value).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return { y: +m[3], m: +m[2], d: +m[1] };
  return null;
}

// "19:30", "9.30", "9" -> {h,mi}; anything else -> null (treated as all-day).
export function parseTime(value) {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?/.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  return h < 24 && mi < 60 ? { h, mi } : null;
}

const utc = ({ y, m, d }) => new Date(Date.UTC(y, m - 1, d));
const fromUTC = (dt) => ({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
const addDays = (date, n) => fromUTC(new Date(utc(date).getTime() + n * 86400000));
const daysInMonth = ({ y, m }) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// byday: ["SU","MO", "3SA"...]; byweek: ["WEEK1","WEEK3"...] (events' own format).
// Returns [{n, day}] where n is the nth occurrence in the month (or null = every).
export function buildRules(byday = [], byweek = []) {
  const weeks = byweek
    .map((w) => /^WEEK(\d)$/i.exec(String(w).trim())?.[1])
    .filter(Boolean)
    .map(Number)
    .filter((n) => n >= 1 && n <= 5);
  const rules = [];
  for (const raw of byday) {
    const m = /^([+-]?\d)?(MO|TU|WE|TH|FR|SA|SU)$/i.exec(String(raw).trim());
    if (!m) continue;
    const day = m[2].toUpperCase();
    if (m[1]) rules.push({ n: Number(m[1]), day });
    else if (weeks.length) weeks.forEach((n) => rules.push({ n, day }));
    else rules.push({ n: null, day });
  }
  return rules;
}

function matches(date, rules) {
  const day = DAY_CODES[utc(date).getUTCDay()];
  const nth = Math.ceil(date.d / 7);
  const fromEnd = Math.ceil((daysInMonth(date) - date.d + 1) / 7);
  return rules.some((r) => r.day === day && (r.n === null || (r.n > 0 ? r.n === nth : -r.n === fromEnd)));
}

function firstOccurrence(from, rules) {
  for (let i = 0; i < 400; i++) {
    const d = addDays(from, i);
    if (matches(d, rules)) return d;
  }
  return null;
}

function rruleOf(rules) {
  const byday = [...new Set(rules.map((r) => `${r.n ?? ""}${r.day}`))].join(",");
  const freq = rules.some((r) => r.n !== null) ? "MONTHLY" : "WEEKLY";
  return `FREQ=${freq};BYDAY=${byday}`;
}

const escapeText = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

// Lines max 75 octets; continuation lines start with a single space.
export function fold(line) {
  const out = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZ}`,
  `X-LIC-LOCATION:${TZ}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function stamp(date) {
  return date.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

const localDT = (date, t) => `${ymd(date)}T${pad(t.h)}${pad(t.mi)}00`;

function endOf(date, t) {
  const dt = new Date(Date.UTC(date.y, date.m - 1, date.d, t.h, t.mi + DEFAULT_DURATION_MIN));
  return `${ymd(fromUTC(dt))}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00`;
}

export function buildICS(events = [], { calendarName = "", siteUrl = "", now = new Date() } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Parroquia//web-template//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-TIMEZONE:${TZ}`,
  ];
  if (calendarName) lines.push(`X-WR-CALNAME:${escapeText(calendarName)}`);
  lines.push(...VTIMEZONE);

  const today = parseDate(now.toLocaleDateString("en-CA", { timeZone: TZ }));
  const dtstamp = stamp(now);
  const seen = new Set();

  for (const ev of events) {
    if (!ev) continue;
    const dates = (ev.dates || [])
      .map(parseDate)
      .filter(Boolean)
      .sort((a, b) => dayKey(a).localeCompare(dayKey(b)));
    const rules = buildRules(ev.byday || [], ev.byweek || []);
    if (!dates.length && !rules.length) continue; // nothing we can place in time

    let start = dates[0];
    if (rules.length) start = firstOccurrence(dates[0] || today, rules) || start;
    if (!start) continue;

    const rrule = rules.length ? rruleOf(rules) : null;
    // Extra dates that the recurrence rule will not generate by itself.
    const rdates = dates.filter((d) => dayKey(d) !== dayKey(start) && !(rules.length && matches(d, rules)));
    const exdates = rules.length ? (ev.exceptions || []).map(parseDate).filter(Boolean) : [];

    const times = (ev.times || []).map(parseTime).filter(Boolean);
    const slots = times.length ? times : [null]; // null = all-day

    const place = ev.place;
    const location = [ev.locations?.[0] || place?.name, place?.address].filter(Boolean).join(", ");
    const summary = ev.title || ev.typeName || ev.type || "";
    const description = (ev.notes || []).filter(Boolean).join("\n\n");
    const category = ev.typeName || ev.type;

    for (const t of slots) {
      const timeKey = t ? `${pad(t.h)}${pad(t.mi)}` : "";
      // Stable across builds: recurring events don't depend on the (moving) first date.
      const uidSeed = JSON.stringify([ev.type, summary, timeKey, rrule, rrule ? "" : dayKey(start)]);
      let uid = crypto.createHash("sha1").update(uidSeed).digest("hex");
      let n = 1;
      while (seen.has(uid)) uid = crypto.createHash("sha1").update(uidSeed + n++).digest("hex");
      seen.add(uid);

      const value = t ? (d) => localDT(d, t) : ymd;
      const param = t ? `;TZID=${TZ}` : ";VALUE=DATE";

      lines.push("BEGIN:VEVENT", `UID:${uid}@parroquia.app`, `DTSTAMP:${dtstamp}`);
      if (t) {
        lines.push(`DTSTART${param}:${value(start)}`, `DTEND${param}:${endOf(start, t)}`);
      } else {
        lines.push(`DTSTART${param}:${ymd(start)}`, `DTEND${param}:${ymd(addDays(start, 1))}`);
      }
      if (rrule) lines.push(`RRULE:${rrule}`);
      if (exdates.length) lines.push(`EXDATE${param}:${exdates.map(value).join(",")}`);
      if (rdates.length) lines.push(`RDATE${param}:${rdates.map(value).join(",")}`);
      lines.push(`SUMMARY:${escapeText(summary)}`);
      if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
      if (location) lines.push(`LOCATION:${escapeText(location)}`);
      if (category) lines.push(`CATEGORIES:${escapeText(category)}`);
      if (siteUrl) lines.push(`URL:${siteUrl}`);
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
