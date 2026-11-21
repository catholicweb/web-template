// Pure data side of the printable event poster: turns an event (the `seo.event` / `seo.events[]`
// entries of a generated event page), the page's registration data and the site config into the
// flat model PosterMode.vue draws. No DOM, no Vue: unit-testable.
import { getCode } from "../../utils.js";
import { posterLabels } from "./posterLabels.js";
import { qrSvgData } from "./qr.js";

const WEEKDAYS = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const langCode = (lang) => (getCode(String(lang || "es")) || "es").slice(0, 2).toLowerCase();
export const isoToday = () => new Date().toLocaleDateString("en-CA");

const intl = (code, options, date) => {
  try {
    return new Intl.DateTimeFormat(code, options).format(date);
  } catch {
    return "";
  }
};
const list = (code, items) => {
  try {
    return new Intl.ListFormat(code, { style: "long", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
};

/** Plain text from the (markdown / html) notes of an event, cut at a word boundary. */
export function plainText(src, max = 240) {
  const text = String(src ?? "")
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]+/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[\s,;:.-]+$/, "") + "…";
}

/** Upcoming dates first (all of them when none is upcoming), at most `max`, formatted for the sheet. */
export function formatDates(dates, code, { today = isoToday(), max = 4 } = {}) {
  const valid = [...new Set((dates ?? []).filter((d) => ISO.test(d)))].sort();
  const upcoming = valid.filter((d) => d >= today);
  const pool = upcoming.length ? upcoming : valid;
  const items = pool.slice(0, max).map((iso) => {
    const d = new Date(iso + "T12:00:00");
    return {
      iso,
      day: d.getDate(),
      month: intl(code, { month: "long" }, d),
      monthShort: intl(code, { month: "short" }, d).replace(/\.$/, ""),
      weekday: intl(code, { weekday: "long" }, d),
      weekdayShort: intl(code, { weekday: "short" }, d).replace(/\.$/, ""),
      long: intl(code, { weekday: "long", day: "numeric", month: "long" }, d),
    };
  });
  return { items, more: pool.length - items.length };
}

/** "Cada jueves · semana 1 y 3 del mes" for events repeating on weekdays; "" otherwise. */
export function describeRecurrence(event, code, labels = posterLabels(code)) {
  const days = (event?.byday ?? [])
    .map((c) => WEEKDAYS[String(c).toUpperCase()])
    .filter((n) => n !== undefined)
    .map((n) => intl(code, { weekday: "long" }, new Date(2024, 0, 7 + n)))
    .filter(Boolean);
  if (!days.length) return "";
  let text = `${labels.every} ${list(code, days)}`;
  const weeks = (event?.byweek ?? []).map((w) => /^WEEK(\d)$/i.exec(String(w))?.[1]).filter(Boolean);
  if (weeks.length) text += ` · ${labels.weeks.replace("{n}", list(code, weeks))}`;
  return text;
}

const urlBase = (pageUrl) => String(pageUrl ?? "").replace(/[?#].*$/, "");

/** Links the QR may encode, most trackable first; the first one that fits a QR code wins. */
export function qrCandidates(pageUrl, { target = "page", registrationId, bare = false } = {}) {
  const base = urlBase(pageUrl);
  const page = [`${base}?s=poster`, base];
  if (target !== "register" || !registrationId) return page;
  // `bare`: the page has a single event to register for, so a plain `?register` opens the form for it.
  const reg = bare ? `${base}?register` : `${base}?register=${encodeURIComponent(registrationId)}`;
  return [`${reg}&s=poster`, reg, ...page];
}

/** First candidate that can be encoded: { url, size, path } or null. */
export function fitQr(candidates) {
  for (const url of candidates) {
    try {
      return { url, ...qrSvgData(url) };
    } catch {
      /* too long: try the next, shorter one */
    }
  }
  return null;
}

/** Readable address printed under the QR: host + path, no protocol, no query. */
export function shortUrl(pageUrl) {
  try {
    const u = new URL(urlBase(pageUrl));
    return (u.host + u.pathname).replace(/\/$/, "");
  } catch {
    return urlBase(pageUrl).replace(/^https?:\/\//, "");
  }
}

/** Layout the poster uses unless the person picks one. */
export function pickLayout(model) {
  if (!model.images.length) return "plain";
  if (model.title.length > 60 || model.description.length > 260) return "text";
  return "image";
}

/** Title font size (in poster-width percent) that keeps the title inside its block. */
export function titleSize(title, layout) {
  const n = String(title ?? "").length;
  const base = n <= 24 ? 10 : n <= 45 ? 7.4 : n <= 70 ? 6 : 4.8;
  if (layout === "plain") return base * 1.15;
  if (layout === "text") return Math.min(base, 7);
  if (layout === "bold" || layout === "sticker") return base * 0.88; // upper case runs wider
  return base;
}

/** Layouts that are built around a picture, and what to fall back to without one. */
export const PICTURE_LAYOUTS = { image: "plain", text: "plain", cover: "plain", sticker: "bold" };

/** "a / b", or just "a" when there is no b or both read the same. */
export const joinBi = (a, b, sep = " / ") => (b && String(b).toLowerCase() !== String(a ?? "").toLowerCase() ? `${a}${sep}${b}` : a);

/**
 * @param {object} p
 * @param {object} p.event            seo.event / one of seo.events (id, title, dates, times, byday, byweek, notes, images, locations, place)
 * @param {object[]} [p.registrationEvents]  frontmatter.registration.events of the page
 * @param {object} [p.config]         theme config (info.title, info.collaborators, theme.accentHue)
 * @param {string} p.lang
 * @param {string} p.pageUrl
 */
export function buildPosterModel({ event, registrationEvents = [], config = {}, lang, pageUrl, today, maxDates = 4, second }) {
  const code = langCode(lang);
  const labels = posterLabels(code);
  const ev = event ?? {};
  const reg =
    registrationEvents.find((r) => ev.id && r.id === ev.id) || registrationEvents.find((r) => r.title && r.title === ev.title) || null;

  const place = ev.place?.name || ev.locations?.[0] || "";
  const address = typeof ev.place?.address === "string" ? ev.place.address : "";
  const images = [...(ev.images ?? []), ev.place?.image].filter((i) => typeof i === "string" && i);
  const hue = Number(config.theme?.accentHue);

  // Second language (bilingual poster): same event, its text and date words in that language.
  const code2 = second?.lang ? langCode(second.lang) : "";
  const labels2 = code2 && code2 !== code ? posterLabels(code2) : null;
  const descMax = labels2 ? 150 : 240; // two descriptions share the space of one

  return {
    id: ev.id || ev.title || "",
    title: ev.title ?? "",
    dates: formatDates(ev.dates, code, { today, max: maxDates }),
    recurrence: describeRecurrence(ev, code, labels),
    times: (ev.times ?? []).filter(Boolean).join(" · "),
    place,
    address: address && address !== place ? address : "",
    description: plainText(ev.notes?.[0], descMax),
    images,
    contacts: (config.info?.collaborators ?? []).filter((c) => c?.phonenumber).map((c) => ({ name: c.name || "", phone: String(c.phonenumber) })),
    siteName: config.info?.title ?? "",
    hue: Number.isFinite(hue) ? hue : 250,
    registrationId: reg ? reg.id : null,
    pageUrl: urlBase(pageUrl),
    labels,
    second: labels2
      ? {
          code: code2,
          labels: labels2,
          title: second.title ?? "",
          description: plainText(second.description, descMax),
          dates: formatDates(ev.dates, code2, { today, max: maxDates }),
          recurrence: describeRecurrence(ev, code2, labels2),
        }
      : null,
  };
}
