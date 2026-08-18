const shortenBibleName = (name) => {
  return name
    // 1. Replace the long ordinals with numbers
    .replace(/Primera carta/gi, '1 ')
    .replace(/Segunda carta/gi, '2 ')
    .replace(/Tercera carta/gi, '3 ')
    .replace(/Carta/gi, ' ')
    
    // 2. Remove common formal prefixes and "San/Santa"
    .replace(/Evangelio según/gi, '')
    .replace(/Hechos de los Apóstoles/gi, 'Hechos')
    .replace(/de San Pablo a los|de San Pablo a|a los| de |Pablo a los|Pablo a|Pablo|/gi, '')
    .replace(/SAN /gi, '')
    
    // 3. Clean up extra spaces and fix the casing (CORINTIOS -> Corintios)
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
};

export async function getAudio(lang) {
  const bibles = {
    eu: "https://live.bible.is/api/bibles/filesets/EUSEABN1DA",
    es: "https://live.bible.is/api/bibles/filesets/SPNDHHN2DA",
    en: "https://live.bible.is/api/bibles/filesets/ENGNIVP2DV",
  };
  const code = lang.split(":").toReversed()[0];

  const res = await fetch(bibles[code] || bibles.eu);
  const { data } = await res.json();

  const audios = data.map((b) => {
    return {
      title: `${shortenBibleName(b.book_name)} ${b.chapter_start}`,
      src: b.path,
      image: "/fcbh-logo-square-512.png",
    };
  });

  const books = [...new Set(data.map((b) => shortenBibleName(b.book_name)).filter(Boolean))];

  return { audios, books };
}

const formatDate = (date) => date.toISOString().split("T")[0];

const cleanTitle = (str = "") => str.replace("de la ", "").replace("semana de", "de");

const clean = (str = "") => {
  if (!str) return "";
  return str
    .replace(/<strong>Lectura de.+?<\/strong>/g, "")
    .replace(/<(span|p)><\/\1>/g, "")
    .replaceAll('<span style="color: #b30838;">R.</span>', '<span style="color: #b30838; font-style: italic; font-weight: normal">&#8479;</span>');
};

const getResponse = (str = "") => {
  let match = str.match(/R\.<\/span><\/strong>([^<]+)/) || str.match(/R\.<\/span>([^<]+)/);
  if (!match) return "";
  return match[1].replace(/<[^>]*>/g, "").trim();
};

const parseReference = (ref) => {
  if (!ref) return [];
  let match = ref
    .replaceAll(" ", "")
    .toLowerCase()
    .match(/^(\d*?[a-z]+)(.+)/);
  if (!match) return [];
  let [, book, rest] = match;
  const bookMap = { mt: "MAT", mk: "MRK", mc: "MRK", lc: "LUK", lk: "LUK", jn: "JHN" };
  book = bookMap[book.toLowerCase()] || book;
  // Multi-chapter ranges like "Mt 1–3" (en dash) are rewritten into a two-part
  // list — chapter 1 to 60..end, then the final chapter — so each chapter is
  // parsed independently. Brittle by design; an unrecognized shape yields [].
  let bits = rest.replace(/–(\d+),/g, `-60;$1,1-`).split(";");
  const parseRange = (r) => {
    const [start, end] = r.split("-").map(Number);
    return !end ? [start] : Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };
  return bits.map((b) => {
    const [chapter, versesStr] = b.replace(/[^0-9\.\,-\;]/g, "").split(",");
    let verses = (versesStr || "").split(".").map(parseRange).flat();
    return { book, chapter, verses };
  });
};

/**
 * Fetches and processes readings into a flat array compatible with the Vue UI
 */
export const getBibleReadings = async (options = {}) => {
  const { date = new Date(), lang = "es", gospelOnly = false } = options;

  const dateStr = formatDate(date);
  // Base URL for images stored in Supabase
  const imageFolderUrl = `https://mawaorwmhgyeqbvnewfy.supabase.co/storage/v1/object/public/reading-images/${dateStr}`;
  const assetsPath = "https://47herri.eus/bible";

  try {
    const awsUrl = `https://gxvchjojub.execute-api.eu-west-1.amazonaws.com/production/getmissafreecontent?lang=es&day=${dateStr}`;
    const res = await fetch(awsUrl);
    const data = await res.json();

    // 1. Map dynamic keys to a structured array
    let readingsArray = Object.keys(data)
      .filter((key) => typeof data[key] === "object" && data[key].cita)
      .sort((a, b) => (data[a].index || 0) - (data[b].index || 0))
      .map((key) => {
        const item = data[key];
        const tag = item.tag || key;
        return {
          tag: tag,
          title: item.title,
          cita: item.cita,
          resum: item.resum || getResponse(item.text),
          text: clean(item.text),
          image: `${imageFolderUrl}/${tag}.png`,
        };
      });

    if (gospelOnly) readingsArray = readingsArray.filter((r) => r.tag == "evangeli");

    // 2. Translation logic for non-Spanish requests
    if (lang !== "es") {
      for (let item of readingsArray) {
        if (item.tag != "evangeli") continue; // ATM, we only have dictionary for the gospels

        try {
          const parsed = parseReference(item.cita);
          let translatedText = "";
          for (const part of parsed) {
            const r = await fetch(`${assetsPath}/${lang}-${part.book}-${part.chapter}.json`);
            const chapterData = await r.json();
            translatedText += part.verses
              .map((v) => chapterData["v" + v])
              .join(" ")
              .replace(/ +\./g, ".");
          }
          if (translatedText) item.text = translatedText;
        } catch (e) {
          console.warn(`Translation failed for ${item.cita} in ${lang}`);
        }
      }
    }
    return {
      day_title: data.day_title,
      list: readingsArray,
    };
  } catch (err) {
    console.error("BibleApp Module Error:", err);
    // Return empty readings instead of re-throwing — a Bible API outage should
    // not crash every parish site's build. The page renders without readings.
    return { day_title: "", list: [] };
  }
};
