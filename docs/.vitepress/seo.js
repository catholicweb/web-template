import { read, write } from "./node_utils.js";
import { slugify, groupEvents, formatDate } from "./utils.js";

const config = read("./docs/public/pages/config.json");

export function getJSONLD(fm, config, path) {
  const locations = getLocations(fm, config, path);
  const eventNodes = events2JSONLD(fm, config, path);

  const FAQ = !fm.faq?.length
    ? []
    : [
        {
          "@type": "FAQPage",
          mainEntity: fm.faq.map((faq) => {
            return {
              "@type": "Question",
              name: faq.title,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.text,
              },
            };
          }),
        },
      ];

  return [
    [
      "script",
      { type: "application/ld+json" },
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [...locations, ...eventNodes, ...FAQ],
      }),
    ],
  ];
}

function getOrg(config, path) {
  const baseUrl = config.dev?.siteurl;
  if (!path.includes("index")) {
    return {
      "@type": "Organization",
      "@id": "ourOrganization",
      name: config.title,
      url: baseUrl,
    };
  }
  return {
    "@type": "Organization",
    url: config.dev?.siteurl,
    sameAs: config.social,
    logo: config.dev?.siteurl + "/icon-512.png",
    name: config.title,
    description: config.description,
    image: baseUrl + "/" + config.image,
    telephone: config.collaborators?.[0]?.phone,
    email: config.collaborators?.[0]?.email,
    address: {
      "@type": "PostalAddress",
      //streetAddress: "Rue Improbable 99",
      //addressLocality: "Paris",
      postalCode: config.zip,
      addressRegion: config.region || "Navarra",
      addressCountry: config.region || "ES",
    },
    //vatID: "FR12345678901",
    //iso6523Code: "0199:724500PMK2A2M1SQQ228",
  };
}

function joinConY(arr, langCode) {
  const and = i18n[langCode]?.and || " eta ";
  if (arr.length === 0) return "";
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return arr.join(and);
  return arr.slice(0, -1).join("; ") + and + arr[arr.length - 1];
}

const i18n = {
  es: {
    and: " y ",
    question: (title, location) => `¿Cuándo se celebra ${title} en ${location}?`,
    when: (days, time) => `los ${days} a las ${time}`,
    answer: (title, location, when) => `${title} en ${location} se celebra ${when}.`,
  },

  eu: {
    and: " eta ",
    question: (title, location) => `Noiz ospatzen da ${title} ${location}n?`,
    when: (days, time) => `${days}etan ${time}etan`,
    answer: (title, location, when) => `${title} ${location}n ${when} ospatzen da.`,
  },

  en: {
    and: " and ",
    question: (title, location) => `When is ${title} celebrated in ${location}?`,
    when: (days, time) => `on ${days} at ${time}`,
    answer: (title, location, when) => `${title} in ${location} is celebrated ${when}.`,
  },

  fr: {
    and: " et ",
    question: (title, location) => `Quand est célébré ${title} à ${location} ?`,
    when: (days, time) => `les ${days} à ${time}`,
    answer: (title, location, when) => `${title} à ${location} est célébré ${when}.`,
  },
};

export function getEventFAQ(events, lang = "Euskara:eu") {
  if (!events) return [];
  const langCode = lang.split(":")[1];
  const t = i18n[langCode] || i18n["eu"];

  let grouped = groupEvents(events, ["title", "locations", "times", "byday+byweek+dates"]);
  let FAQ = [];

  for (const title in grouped) {
    for (const location in grouped[title]) {
      let when = [];

      for (const time in grouped[title][location]) {
        const days = Object.keys(grouped[title][location][time])
          .map((i) => formatDate(i, lang))
          .join(", ")
          .toLowerCase();

        when.push(t.when(days, time));
      }

      FAQ.push({
        title: t.question(title, location),
        text: t.answer(title, location, joinConY(when, langCode)),
      });
    }
  }

  return FAQ;
}

function getLocations(data, config, path) {
  const events = data.events || [];
  const baseUrl = config.dev?.siteurl;
  const graph = [];
  //const uniqueLocations = [...new Set(events.flatMap(e => e.locations))].map(n => );
  data?.sections?.forEach((section) => {
    if (section._block === "map") {
      const details = {};
      const [latitude, longitude] = section.geo?.split(",").map((s) => Number(s.trim())) || [];
      if (!longitude) return;
      graph.push({
        "@type": "Place",
        "@id": getID(baseUrl, path, graph.length ? section.name : undefined), // first location is the main one
        name: section.name,
        address: {
          "@type": "PostalAddress",
          address: section.full,
          streetAddress: section.street,
          addressLocality: section.city || data.title,
          postalCode: section.zip || config.zip,
          addressRegion: section.region || config.region || "Navarra",
          addressCountry: (section.country_code || config.country_code || "ES").toUpperCase(),
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: latitude,
          longitude: longitude,
        },
        hasMap: [section.google, section.osm].filter(Boolean),
        image: baseUrl + (section.image || data.image || config.image),
        telephone: config.collaborators?.[0]?.phone,
        email: config.collaborators?.[0]?.email,
        url: getID(baseUrl, path, section.name),
      });
    }
  });
  graph.push(getOrg(config, path));
  return graph;
}

/**
 * Transforms frontmatter events into a JSON-LD @graph.
 * ...
 */
function events2JSONLD(data, config, path) {
  const events = data.events || [];

  const baseUrl = config.dev?.siteurl;
  const now = new Date();
  const eventsHorizon = new Date();
  eventsHorizon.setDate(now.getDate() + 60);

  const dayMap = {
    SU: "Sunday",
    MO: "Monday",
    TU: "Tuesday",
    WE: "Wednesday",
    TH: "Thursday",
    FR: "Friday",
    SA: "Saturday",
  };

  const graph = [
    {
      "@type": "Offer",
      "@id": "welcomeOffer",
      price: 0,
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
      validFrom: now.toISOString().split(".")[0],
    },
  ];
  const graphEvents = [];

  events?.forEach((event, idx) => {
    // 1. Create the Schedule Entry (The "Rule")
    if (event.byday?.length > 0) {
      graph.push({
        "@type": "Schedule",
        "@id": getID(baseUrl, path, event.title),
        name: event.title,
        repeatFrequency: event.byweek?.length > 0 ? "Monthly" : "Weekly",
        byDay: event.byday.map((d) => `https://schema.org/${dayMap[d]}`),
        byWeek: event.byweek?.length ? event.byweek.map((w) => Number(w.replace("WEEK", ""))) : undefined,
        startTime: event.times,
        description: event.notes.join(". ") || undefined,
        location: event.locations.map((loc) => ({ "@id": getID(baseUrl, loc), name: loc, url: getID(baseUrl, loc) })),
      });
    }

    // 2. Create Single Event Instances (The "Occurrences")

    // Logic for Fixed Dates (e.g., San Antón)
    if (event.dates?.length > 0) {
      event.dates?.forEach((dateStr) => {
        event.times?.forEach((time) => {
          graph.push(buildEventInstance(event, dateStr, time, baseUrl, path));
        });
      });
    }

    // Logic for Recurring Dates
    if (event.byday?.length > 0) {
      for (let d = new Date(now); d <= eventsHorizon; d.setDate(d.getDate() + 1)) {
        const dayCode = Object.keys(dayMap).find((key) => dayMap[key] === d.toLocaleDateString("en-US", { weekday: "long" }));

        if (event.byday.includes(dayCode)) {
          // Filter by WEEK3, etc. if applicable
          if (event.byweek && event.byweek.length > 0) {
            const weekOfMonth = Math.ceil(d.getDate() / 7);
            if (!event.byweek.includes(`WEEK${weekOfMonth}`)) continue;
          }

          const dateStr = d.toISOString().split("T")[0];
          event.times?.forEach((time) => {
            graphEvents.push(buildEventInstance(event, dateStr, time, baseUrl, path));
          });
        }
      }
    }
  });

  return [...graph, ...graphEvents.toSorted((a, b) => a.startDate?.localeCompare(b?.startDate)).slice(0, 7)];
}

function getID(baseUrl, path, name) {
  const slugged = path.includes("/") ? path : `${slugify(path)}`;
  if (!name) return `${baseUrl}/${slugged}`;
  return `${baseUrl}/${slugged}#${slugify(name)}`;
}

function buildEventInstance(event, date, time, baseUrl, path) {
  const typeMapping = {
    mass: "https://www.wikidata.org/wiki/Q132612",
    group: "https://www.wikidata.org/wiki/Q1735729",
    holyHour: "https://www.wikidata.org/wiki/Q5885640",
    funeral: "https://www.wikidata.org/wiki/Q7361870",
  };

  const subid = event.byday?.length ? `-${slugify(date + "-" + time)}` : "";
  return {
    "@type": "Event",
    "@id": getID(baseUrl, path, `${event.title}${subid}`),
    url: getID(baseUrl, path, event.title),
    additionalType: typeMapping[event.type],
    name: event.title,
    startDate: `${date}T${time}`,
    endDate: getEndDate(`${date}T${time}`, 60),
    location: event.locations.map((loc) => ({ "@id": getID(baseUrl, loc) })),
    image: event.images ? event.images.map((i) => baseUrl + i) : undefined,
    description: event.notes ? event.notes.join(". ") : undefined,
    eventSchedule: event.byday?.length ? { "@id": getID(baseUrl, path, event.title) } : undefined,
    eventStatus: "https://schema.org/EventScheduled",
    isAccessibleForFree: true,
    offers: { "@id": "welcomeOffer", url: getID(baseUrl, path, event.title) },
    organizer: { "@id": "ourOrganization" },
    //eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  };
}

function getEndDate(startIso, durationMinutes = 60) {
  const start = new Date(startIso);

  // Check if the date is valid
  if (isNaN(start.getTime())) return '';

  // Add duration (minutes * 60,000ms)
  const end = new Date(start.getTime() + durationMinutes * 60000);

  // Return formatted for Schema (YYYY-MM-DDTHH:mm:ss)
  return end.toISOString().split(".")[0];
}
