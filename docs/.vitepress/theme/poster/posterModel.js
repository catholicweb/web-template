// Pure data side of the printable event poster: turns an event (the `seo.event` / `seo.events[]`
// entries of a generated event page), the page's registration data and the site config into the
// flat model PosterMode.vue draws. No DOM, no Vue: unit-testable.
import { formatDate, getCode, isMassFilter, stripIndex } from "../../utils.js";
import { rowKind } from "../../calendar-view.js";
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
export const PICTURE_LAYOUTS = { image: "plain", text: "plain", arch: "plain", polaroid: "plain", cover: "plain", sticker: "bold" };

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
    whenLine: [(ev.times ?? []).filter(Boolean).join(" · "), place].filter(Boolean).join(" - "),
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

// ---- Shared bits ----------------------------------------------------------------------

const hueOf = (config) => (Number.isFinite(Number(config?.theme?.accentHue)) ? Number(config.theme.accentHue) : 250);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_ONLY = /^\+?[\d\s().-]{6,}$/;

/** Phones (collaborators' `phonenumber`) and e-mails (their `social` entries) of the site. */
export function contactsOf(config) {
  const collaborators = config?.info?.collaborators ?? [];
  const contacts = collaborators.filter((c) => c?.phonenumber).map((c) => ({ name: c.name || "", phone: String(c.phonenumber) }));
  const emails = [...new Set(collaborators.flatMap((c) => c?.social ?? []).filter((v) => EMAIL.test(String(v).trim())).map((v) => String(v).trim()))];
  return { contacts, emails };
}

/** Social networks of the site as short readable addresses ("instagram.com/parroquia"). */
export function socialOf(config) {
  return (config?.info?.social ?? [])
    .map((v) => String(v ?? "").trim())
    .filter((v) => v && !EMAIL.test(v) && !PHONE_ONLY.test(v))
    .map((v) => v.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, ""));
}

const baseOf = ({ config = {}, lang, pageUrl, second }, extra = {}) => {
  const code = langCode(lang);
  const code2 = second?.lang ? langCode(second.lang) : "";
  const labels2 = code2 && code2 !== code ? posterLabels(code2) : null;
  return { code, code2, labels: posterLabels(code), labels2, siteName: config.info?.title ?? "", hue: hueOf(config), pageUrl: urlBase(pageUrl), ...contactsOf(config), ...extra };
};

// ---- Event-type poster: the list of its events --------------------------------------------

const weekdayRank = (ev) => Math.max(0, ["MO", "TU", "WE", "TH", "FR", "SA", "SU"].indexOf(String(ev?.byday?.[0]).toUpperCase()));

/**
 * One row per event of an event-type page: dated events by their next date first, then the
 * recurring ones by weekday. `texts2` = posterLangs[second code] (same order as `events`).
 */
export function buildListModel({ events = [], texts2, config = {}, lang, pageUrl, title = "", images = [], today = isoToday(), second }) {
  const b = baseOf({ config, lang, pageUrl, second });
  const rows = events.map((ev, index) => {
    const dates = formatDates(ev.dates, b.code, { today, max: 3 });
    const recurring = (ev.byday ?? []).length > 0;
    const first = dates.items[0];
    const t2 = b.labels2 ? texts2?.[index] : null;
    return {
      key: ev.id || ev.title || String(index),
      index,
      recurring,
      next: first?.iso ?? "",
      rank: weekdayRank(ev),
      title: ev.title ?? "",
      title2: t2?.title && t2.title.trim().toLowerCase() !== String(ev.title ?? "").trim().toLowerCase() ? t2.title : "",
      day: !recurring && first ? { day: first.day, month: first.monthShort, more: Math.max(0, dates.items.length - 1) + dates.more } : null,
      recurrence: describeRecurrence(ev, b.code, b.labels),
      whenLine: [(ev.times ?? []).filter(Boolean).join(" · "), ev.place?.name || ev.locations?.[0] || ""].filter(Boolean).join(" - "),
      description: plainText(ev.notes?.[0], 120),
      description2: t2 ? plainText(t2.description, 90) : "",
      image: (ev.images ?? []).find((i) => typeof i === "string" && i) || "",
      upcoming: recurring || dates.items.some((d) => d.iso >= today),
    };
  });
  const live = rows.filter((r) => r.upcoming);
  const items = (live.length ? live : rows).toSorted((a, b2) => (a.recurring - b2.recurring) || (a.recurring ? a.rank - b2.rank : a.next.localeCompare(b2.next)));
  const imgs = [...images, ...items.map((r) => r.image)].filter((i, n, all) => typeof i === "string" && i && all.indexOf(i) === n);
  return { kind: "list", title, items, images: imgs, second: b.labels2 ? { code: b.code2, labels: b.labels2 } : null, ...pickBase(b) };
}

const pickBase = (b) => ({ labels: b.labels, siteName: b.siteName, hue: b.hue, pageUrl: b.pageUrl, contacts: b.contacts, emails: b.emails });

// ---- Home poster: the schedule (a calendar section of the page), contact and networks ------

const TIME = /^\d{1,2}[:.h]\d{2}/;

/**
 * Flatten the tree of a calendar section ({ table: { row: { ... [stubs] } } }, see groupEvents)
 * into groups: the first level is the heading (weekday group or date), the rest of each path
 * becomes one line (its time and the other keys, e.g. place and notes), in `lang` and, when
 * given, in `lang2` as well. Dated headings in the past are dropped and capped to `maxDated`.
 */
export function flattenSchedule(tree, lang, lang2 = "", { today = isoToday(), maxDated = 4 } = {}) {
  const leaves = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) leaves.push(path);
    else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
  };
  walk(tree ?? {}, []);

  const groups = new Map();
  for (const path of leaves) {
    const [headKey, ...rest] = path;
    const kind = rowKind(headKey);
    if (kind.type === "date" && kind.iso < today) continue;
    const segs = rest.map((s) => stripIndex(s).trim()).filter(Boolean);
    const time = segs.find((s) => TIME.test(s)) ?? "";
    const others = segs.filter((s) => s !== time);
    const text = others.map((s) => formatDate(s, lang)).filter(Boolean).join(" · ");
    const text2 = lang2 ? others.map((s) => formatDate(s, lang2)).filter(Boolean).join(" · ") : "";
    const group =
      groups.get(headKey) ??
      groups.set(headKey, { key: headKey, dated: kind.type === "date", heading: formatDate(stripIndex(headKey), lang), heading2: lang2 ? formatDate(stripIndex(headKey), lang2) : "", lines: [] }).get(headKey);
    if (!group.lines.some((l) => l.time === time && l.text === text)) group.lines.push({ time, text, text2: text2 && text2 !== text ? text2 : "" });
  }
  const all = [...groups.values()];
  return [...all.filter((g) => !g.dated), ...all.filter((g) => g.dated).slice(0, maxDated)].map((g) => ({ ...g, heading2: g.heading2 && g.heading2 !== g.heading ? g.heading2 : "" }));
}

/** Calendar sections of a page that can feed the schedule: masses first, then the others. */
export function scheduleSections(sections) {
  const cals = (sections ?? []).filter((s) => s?._block === "calendar" && s.events && Object.keys(s.events).length);
  return [...cals.filter((s) => isMassFilter(s.filter)), ...cals.filter((s) => !isMassFilter(s.filter))];
}

/**
 * Poster of the home page, for the entrance of a parish: the schedule of a calendar section (the
 * mass one by default), the contact details, the networks and the site QR. `place` (one of
 * config.info.places) lends its name and picture to the poster.
 */
export function buildHomeModel({ sections = [], calIndex = 0, config = {}, lang, pageUrl, place, today = isoToday(), second }) {
  const b = baseOf({ config, lang, pageUrl, second });
  const calendars = scheduleSections(sections);
  const cal = calendars[calIndex] ?? calendars[0];
  const mass = !!cal && isMassFilter(cal.filter);
  const infoImage = typeof config.info?.image === "string" ? config.info.image : "";
  const placeImage = typeof place?.image === "string" ? place.image : "";
  const lang2 = second?.lang && b.labels2 ? second.lang : "";
  return {
    kind: "home",
    title: place?.name || b.siteName,
    description: config.info?.description ?? "",
    scheduleTitle: mass ? b.labels.mass : b.labels.schedule,
    scheduleTitle2: b.labels2 ? (mass ? b.labels2.mass : b.labels2.schedule) : "",
    groups: cal ? flattenSchedule(cal.events, lang, lang2, { today }) : [],
    calendars: calendars.map((s, i) => ({ index: i, label: s.title || s.filter || `#${i + 1}`, mass: isMassFilter(s.filter) })),
    places: (config.info?.places ?? []).filter((p) => p?.name).map((p) => ({ name: p.name, image: typeof p.image === "string" ? p.image : "" })),
    images: [placeImage, infoImage].filter(Boolean),
    social: socialOf(config),
    second: b.labels2 ? { code: b.code2, labels: b.labels2 } : null,
    ...pickBase(b),
  };
}
