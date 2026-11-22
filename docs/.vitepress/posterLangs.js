// Text of an event page in every language, for the printable poster (theme/poster/PosterMode.vue),
// which can print two languages side by side. createFiles.js finalizes a page once per language
// and embeds this in each output page as `posterLangs`, so the poster needs no extra requests.
// Shape: { "<code>": [{ title, description }] }, one entry per event of the page, in the order
// of `seo.event` / `seo.events` (the same in every language). Browser- and Node-safe.
import { getCode } from "./utils.js";

const MAX_DESCRIPTION = 700; // the poster only prints a short excerpt

/** @param {Array<[string, object]>} finalized  [lang, finalized page data] for every site language */
export function posterTexts(finalized) {
  const out = {};
  for (const [lang, data] of finalized) {
    const list = data?.seo?.event ? [data.seo.event] : data?.seo?.events;
    if (!Array.isArray(list) || !list.length) return null; // not an event / event-type page
    out[getCode(String(lang))] = list.map((e) => ({
      title: e?.title ?? "",
      description: String(Array.isArray(e?.notes) ? (e.notes[0] ?? "") : (e?.notes ?? "")).slice(0, MAX_DESCRIPTION),
    }));
  }
  return Object.keys(out).length > 1 ? out : null; // nothing to offer on a single-language site
}
