// Pure FAQ builder (no fs access) so it can run in the browser preview too.
import { groupEvents, formatDate } from "./utils.js";

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
