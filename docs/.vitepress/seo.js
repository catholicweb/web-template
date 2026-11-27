import { read } from "./node_utils.js";
import { slugify, getCode } from "./utils.js";
import { getEventFAQ } from "./faq.js";
import { SITE_TZ } from "./calendar-view.js";

export { getEventFAQ };

const versions = read("./docs/public/icon-versions.json", {});

const DAY_NAMES = { SU: "Sunday", MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday", FR: "Friday", SA: "Saturday" };
const DAY_CODES = Object.keys(DAY_NAMES); // Date#getUTCDay order
// Types with a known, short duration get a default endDate; for the rest we don't invent one.
const TYPE_MAPPING = {
  mass: "https://www.wikidata.org/wiki/Q132612",
  group: "https://www.wikidata.org/wiki/Q1735729",
  holyHour: "https://www.wikidata.org/wiki/Q5885640",
  funeral: "https://www.wikidata.org/wiki/Q7361870",
};
const DEFAULT_DURATION_MIN = 60;
const MAX_PAGE_EVENTS = 10;

const pad = (n) => String(n).padStart(2, "0");
const baseOf = (config) => String(config?.dev?.siteurl || "").replace(/\/$/, "");
const orgId = (base) => `${base}/#organization`;
const arr = (v) => (Array.isArray(v) ? v : []);

// Resolve a media/logo value for JSON-LD. Values are absolute URLs now
// (https://data.parroquia.app/<slug>/..) and must pass through untouched —
// only a genuinely relative value gets the site base prepended.
function mediaUrl(baseUrl, u) {
  if (!u) return u;
  if (/^(https?:)?\/\//.test(u)) return u;
  return String(baseUrl || "").replace(/\/$/, "") + "/" + String(u).replace(/^\/+/, "");
}

// "42.83,-1.5" -> { latitude, longitude } or null
export function parseGeo(str) {
  const [latitude, longitude] = String(str ?? "").split(",").map((s) => Number(s.trim()));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if ((latitude === 0 && longitude === 0) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

// ---- dates: everything is a wall-clock time of the site's zone (Europe/Madrid) ----
const offsetFmt = new Intl.DateTimeFormat("en-US", { timeZone: SITE_TZ, timeZoneName: "longOffset", hour: "numeric" });
function zoneOffsetMinutes(utcMs) {
  const part = offsetFmt.formatToParts(new Date(utcMs)).find((p) => p.type === "timeZoneName")?.value || "";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
}

// "2027-07-20" + "10:00" -> "2027-07-20T10:00:00+02:00"; no time -> the date alone (all-day).
export function toIsoWithOffset(date, time) {
  const day = String(date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const t = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? ""));
  if (!t) return day;
  const [y, mo, d] = day.split("-").map(Number);
  const H = Number(t[1]);
  const M = Number(t[2]);
  const guess = Date.UTC(y, mo - 1, d, H, M);
  let off = zoneOffsetMinutes(guess);
  off = zoneOffsetMinutes(guess - off * 60000); // second pass, right around DST changes
  const abs = Math.abs(off);
  return `${day}T${pad(H)}:${pad(M)}:00${off < 0 ? "-" : "+"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function endOf(date, time, minutes) {
  const [y, mo, d] = String(date).slice(0, 10).split("-").map(Number);
  const [H, M] = String(time).split(":").map(Number);
  const iso = new Date(Date.UTC(y, mo - 1, d, H, M + minutes)).toISOString();
  return toIsoWithOffset(iso.slice(0, 10), iso.slice(11, 16));
}

function getID(baseUrl, path, name) {
  const p = String(path ?? "").replace(/^\/+/, "");
  const slugged = p.includes("/") ? p : slugify(p);
  if (!name) return `${baseUrl}/${slugged}`;
  return `${baseUrl}/${slugged}#${slugify(name)}`;
}

// Home pages: "" (default language) or "<code>/" once index has been stripped.
const isHome = (path) => /^\/?([a-z]{2,3}(-[a-z0-9]+)?\/)?$/i.test(String(path ?? ""));

export function getJSONLD(fm, config, path) {
  const base = baseOf(config);
  const locations = getLocations(fm, config, path);
  const eventNodes = events2JSONLD(fm, config, path);
  const pageNodes = pageNodesFor(fm, config, path);

  const FAQ = !fm.faq?.length
    ? []
    : [
        {
          "@type": "FAQPage",
          mainEntity: fm.faq.map((faq) => ({
            "@type": "Question",
            name: faq.title,
            acceptedAnswer: { "@type": "Answer", text: faq.text },
          })),
        },
      ];

  // VitePress serializes head-tag children without HTML-escaping, so a site-
  // supplied value containing "</script>" could close this block and inject JS.
  // We escape <, > and & to their \uXXXX forms — identical after JSON.parse, but
  // incapable of terminating the <script type="application/ld+json"> tag.
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [...locations, ...pageNodes, ...eventNodes, ...FAQ],
  })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  return [["script", { type: "application/ld+json" }, jsonLd]];
}

function getOrg(config, path) {
  const base = baseOf(config);
  const id = orgId(base);
  if (!isHome(path)) {
    return { "@type": "Organization", "@id": id, name: config.info?.title, url: base + "/" };
  }
  return {
    "@type": "Organization",
    "@id": id,
    url: base + "/",
    sameAs: config.info?.social,
    logo: base + "/icon-512.png" + (versions["icon-512.png"] ? "?v=" + versions["icon-512.png"] : ""),
    name: config.info?.title,
    description: config.info?.description,
    image: mediaUrl(base, config.theme?.image),
    telephone: config.info?.collaborators?.[0]?.phone,
    email: config.info?.collaborators?.[0]?.email,
    address: {
      "@type": "PostalAddress",
      postalCode: config.zip,
      addressRegion: config.region || "Navarra",
      addressCountry: (config.country_code || "ES").toUpperCase(),
    },
  };
}

// WebSite (home only), WebPage (every page) and the page's main entity: the event(s) of an
// event page / event-type page, or the place of a place page. Data comes from `fm.seo`,
// filled by createFiles.js.
function pageNodesFor(fm, config, path) {
  const base = baseOf(config);
  const url = getID(base, path);
  const lang = fm.lang ? getCode(String(fm.lang)) : undefined;
  const nodes = [];
  if (isHome(path)) {
    nodes.push({
      "@type": "WebSite",
      "@id": `${base}/#website`,
      url: base + "/",
      name: config.info?.title,
      publisher: { "@id": orgId(base) },
    });
  }

  let mainEntity;
  const seo = fm.seo || {};
  const description = fm.metaDescription || fm.description || config.info?.description;
  const page = {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: fm.title || config.info?.title,
    description,
    inLanguage: lang,
    isPartOf: { "@id": `${base}/#website` },
  };
  if (fm.image) page.primaryImageOfPage = { "@type": "ImageObject", url: mediaUrl(base, fm.image) };

  const evs = seo.event ? [seo.event] : arr(seo.events);
  if (evs.length) {
    const built = pageEventNodes(evs, fm, config, url, description);
    if (built.nodes.length) mainEntity = built.first;
    nodes.push(...built.nodes);
  }
  if (seo.place?.name) {
    const place = placePageNode(seo.place, fm, config, url, description);
    mainEntity = { "@id": place["@id"] };
    nodes.push(place);
  }
  if (mainEntity) page.mainEntity = mainEntity;
  nodes.unshift(page);
  return nodes;
}

function postalAddress(address, config, extra = {}) {
  return {
    "@type": "PostalAddress",
    streetAddress: address || undefined,
    ...extra,
    addressCountry: (config.country_code || "ES").toUpperCase(),
  };
}

function mapLinks(geo) {
  return [
    `https://www.google.com/maps/search/?api=1&query=${geo.latitude},${geo.longitude}`,
    `https://www.openstreetmap.org/?mlat=${geo.latitude}&mlon=${geo.longitude}#map=17/${geo.latitude}/${geo.longitude}`,
  ];
}

// Location page of a place ("Plantilla templos"): same Place data as a map block (geo, address,
// contact), typed as a church, even when the template has no map block.
function placePageNode(place, fm, config, url, description) {
  const base = baseOf(config);
  const geo = parseGeo(place.geo);
  return {
    "@type": "CatholicChurch",
    "@id": url,
    name: place.name,
    url,
    description,
    address: postalAddress(place.address, config, { addressLocality: undefined }),
    geo: geo ? { "@type": "GeoCoordinates", ...geo } : undefined,
    hasMap: geo ? mapLinks(geo) : undefined,
    image: mediaUrl(base, place.image || fm.image),
    telephone: config.info?.collaborators?.[0]?.phone,
    email: config.info?.collaborators?.[0]?.email,
    publicAccess: true,
  };
}

function getLocations(data, config, path) {
  const baseUrl = baseOf(config);
  const graph = [];
  const placeGeo = data.seo?.place?.geo ? String(data.seo.place.geo).replace(/\s+/g, "") : null;
  data?.sections?.forEach((section) => {
    if (section._block === "map") {
      const geo = parseGeo(section.geo);
      if (!geo) return;
      // The place page already emits this exact place (see placePageNode).
      if (placeGeo && String(section.geo).replace(/\s+/g, "") === placeGeo) return;
      graph.push({
        "@type": "Place",
        "@id": getID(baseUrl, path, graph.length ? section.name : undefined), // first location is the main one
        name: section.name,
        address: {
          "@type": "PostalAddress",
          address: section.full,
          streetAddress: section.street || section.address,
          addressLocality: section.city || data.title,
          postalCode: section.zip || config.zip,
          addressRegion: section.region || config.region || "Navarra",
          addressCountry: (section.country_code || config.country_code || "ES").toUpperCase(),
        },
        geo: { "@type": "GeoCoordinates", ...geo },
        hasMap: [section.google, section.osm].filter(Boolean),
        image: mediaUrl(baseUrl, section.image || data.image || config.info?.image),
        telephone: config.info?.collaborators?.[0]?.phone,
        email: config.info?.collaborators?.[0]?.email,
        url: getID(baseUrl, path, section.name),
      });
    }
  });
  graph.push(getOrg(config, path));
  return graph;
}

// Inline Place for an event: Google needs name + address inside the Event, a bare @id is not enough.
function eventLocations(event, config) {
  const places = arr(config?.info?.places);
  return arr(event.locations)
    .map((name, i) => {
      const known = (i === 0 && event.place?.name ? event.place : null) || places.find((p) => p && p.name === name) || {};
      const geo = parseGeo(known.geo);
      return {
        "@type": "Place",
        name,
        address: postalAddress(known.address, config, known.address ? {} : { addressLocality: name }),
        geo: geo ? { "@type": "GeoCoordinates", ...geo } : undefined,
      };
    })
    .filter((p) => p.name);
}

const locationsOf = (event, config) => {
  const l = eventLocations(event, config);
  return l.length ? l : undefined;
};

function schedulePart(event, id) {
  if (!event.byday?.length) return undefined;
  return {
    "@type": "Schedule",
    "@id": id,
    name: event.title,
    repeatFrequency: event.byweek?.length > 0 ? "P1M" : "P1W",
    byDay: event.byday.map((d) => `https://schema.org/${DAY_NAMES[d]}`),
    byWeek: event.byweek?.length ? event.byweek.map((w) => Number(String(w).replace("WEEK", ""))) : undefined,
    startTime: event.times?.length ? event.times : undefined,
    scheduleTimezone: SITE_TZ,
  };
}

// [{date, time|null}] for the explicit dates of an event (all-day when it has no time).
function datedOccurrences(event) {
  const times = event.times?.length ? event.times : [null];
  return arr(event.dates).flatMap((date) => times.map((time) => ({ date: String(date).slice(0, 10), time })));
}

// Next occurrences of a recurring event inside the horizon, in the site's zone.
function recurringOccurrences(event, now = new Date(), horizonDays = 60) {
  if (!event.byday?.length) return [];
  const times = event.times?.length ? event.times : [null];
  const [y, m, d] = now.toLocaleDateString("en-CA", { timeZone: SITE_TZ }).split("-").map(Number);
  const out = [];
  for (let i = 0; i <= horizonDays; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i));
    if (!event.byday.includes(DAY_CODES[day.getUTCDay()])) continue;
    if (event.byweek?.length && !event.byweek.includes(`WEEK${Math.ceil(day.getUTCDate() / 7)}`)) continue;
    const date = day.toISOString().slice(0, 10);
    for (const time of times) out.push({ date, time });
  }
  return out;
}

const byStart = (a, b) => `${a.date}T${a.time || ""}`.localeCompare(`${b.date}T${b.time || ""}`);

/**
 * Event pages / event-type pages: one Event per upcoming occurrence, all pointing at the page.
 * Returns { nodes, first } where `first` is the @id reference of the next occurrence.
 */
function pageEventNodes(events, fm, config, url, description) {
  const base = baseOf(config);
  const nodes = [];
  const occs = [];
  for (const event of events) {
    if (!event?.title) continue;
    const found = [...datedOccurrences(event), ...recurringOccurrences(event)].sort(byStart);
    found.forEach((o) => occs.push({ event, ...o }));
    const schedule = schedulePart(event, `${url}#${slugify(event.title)}-schedule`);
    if (schedule && found.length) nodes.push(schedule);
  }
  occs.sort(byStart);
  occs.slice(0, MAX_PAGE_EVENTS).forEach((o, i) => {
    const single = events.length === 1;
    const node = buildEventInstance(o.event, o.date, o.time, base, url, {
      config,
      id: `${url}#event${i ? "-" + (i + 1) : ""}`,
      url,
      description: (single && description) || undefined,
      image: o.event.images?.length ? undefined : fm.image,
      scheduleId: o.event.byday?.length ? `${url}#${slugify(o.event.title)}-schedule` : undefined,
    });
    nodes.push(node);
  });
  const firstEvent = nodes.find((n) => n["@type"] === "Event");
  return { nodes, first: firstEvent ? { "@id": firstEvent["@id"] } : undefined };
}

/**
 * Pages that list events (frontmatter `events`, e.g. 47herri nav style): Schedule entries for
 * recurring events and the next occurrences as Event nodes.
 */
function events2JSONLD(data, config, path) {
  const events = arr(data.events);
  const baseUrl = baseOf(config);
  const graph = [];
  const graphEvents = [];
  const now = new Date();

  events.forEach((event) => {
    if (!event?.title) return;
    const scheduleId = getID(baseUrl, path, event.title);
    const schedule = schedulePart(event, scheduleId);
    if (schedule) graph.push(schedule);

    datedOccurrences(event).forEach((o) => graph.push(buildEventInstance(event, o.date, o.time, baseUrl, path, { config, scheduleId: schedule ? scheduleId : undefined })));
    recurringOccurrences(event, now).forEach((o) => graphEvents.push(buildEventInstance(event, o.date, o.time, baseUrl, path, { config, scheduleId: schedule ? scheduleId : undefined })));
  });

  return [...graph, ...graphEvents.toSorted((a, b) => String(a.startDate).localeCompare(String(b.startDate))).slice(0, 7)];
}

function buildEventInstance(event, date, time, baseUrl, path, opts = {}) {
  const { config = {}, scheduleId } = opts;
  const url = opts.url ?? getID(baseUrl, path, event.title);
  const subid = event.byday?.length ? `-${slugify(date + "-" + (time || ""))}` : "";
  const images = (event.images?.length ? event.images : [opts.image]).filter(Boolean).map((i) => mediaUrl(baseUrl, i));
  const notes = arr(event.notes).join(". ");
  const known = TYPE_MAPPING[event.type];
  return {
    "@type": "Event",
    "@id": opts.id ?? getID(baseUrl, path, `${event.title}${subid}`),
    url,
    additionalType: known,
    name: event.title,
    startDate: toIsoWithOffset(date, time),
    endDate: time && known ? endOf(date, time, DEFAULT_DURATION_MIN) : undefined,
    location: locationsOf(event, config),
    image: images.length ? images : undefined,
    description: opts.description || notes || undefined,
    inLanguage: typeof event.language === "string" ? getCode(event.language) : undefined,
    eventSchedule: scheduleId ? { "@id": scheduleId } : undefined,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", url, price: 0, priceCurrency: "EUR", availability: "https://schema.org/InStock" },
    organizer: { "@id": orgId(baseUrl) },
  };
}
