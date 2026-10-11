import { read, write } from "./node_utils.js";
import { extractValues, translateObject, translateValue } from "./translate-core.js";

export { extractValues, translateObject, translateValue };

const dictPath = "./docs/public/dictionary.json";
const valueSet = new Set();
export const dictionary = read(dictPath);
// Traducir entradas faltantes
async function translateMissing(valuesArray, language) {
  if (!dictionary[language]) dictionary[language] = {};

  const missing = valuesArray
    .filter((phrase) => !dictionary[language][phrase])
    .filter(Boolean)
    .slice(0, 50);

  if (!missing.length) return console.log("No need to translate anything", language);

  const translations = await translateWithLLM(missing, language.split(":")[0]);

  if (translations.length != missing.length) {
    return console.log("Wow, dicitionaries are different sizes....", language, missing);
  }

  missing.forEach((text, index) => {
    dictionary[language][text] = translations[index].replaceAll("\\n", "\n").replaceAll("\\\\", "");
  });

  // Guardar actualizaciones
  write(dictPath, dictionary);
}
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

async function callCompletion(body, apiKey) {
  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://parroquia.app/",
      "X-Title": "Parroquia Web Template",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${text}`);
  }

  return response.json();
}

function parseTranslations(content) {
  // Non-strict replies may wrap the JSON in a ```json code fence.
  let text = (content || "").trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return JSON.parse(text).translations;
}

async function requestTranslations(messages, model, apiKey, withStrict) {
  const body = { model, messages };
  if (withStrict) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "translation_result",
        strict: true,
        schema: {
          type: "object",
          properties: { translations: { type: "array", items: { type: "string" } } },
          required: ["translations"],
          additionalProperties: false,
        },
      },
    };
  }

  const data = await callCompletion(body, apiKey);
  return { translations: parseTranslations(data.choices[0].message.content), usage: data.usage };
}

async function translateWithLLM(missing, targetLanguage) {
  if (!Array.isArray(missing) || missing.length === 0 || (missing.length === 1 && missing[0] == "")) return [];

  console.log("Translating to ", targetLanguage, " the missing texts: ", missing);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }

  const langLabel = targetLanguage.replace("Euskara", "Euskara (Leitza dialect)");
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";

  const messages = [
    {
      role: "system",
      content: `You are a professional translator for a Catholic parish website serving a community in the Basque Country (northern Navarre, Spain). Content includes parish announcements, mass times, event descriptions, village names, and religious texts.

Rules:
- Translate into natural, fluent ${langLabel} with a warm, formal parish tone.
- Source texts are in Basque (Euskara) or Spanish — detect automatically.
- Preserve ALL HTML tags, Markdown syntax, and line breaks exactly as they appear; translate only the human-readable text around them.
- Do NOT translate proper nouns: village and place names (Leitza, Betelu, Arruitz, Arrarats, Goizueta, Lekunberri, Areso, Larraun, Basaburua, Esteribar, and similar), personal names, or the name "47 herri".
- If a string is already in the target language, a number, a symbol, or a URL, return it unchanged.
- Return exactly as many strings as you receive, in the same order — one translation per input.
- Return ONLY the JSON object, no explanation or preamble.`,
    },
    {
      role: "user",
      content: `Translate each string in this JSON array to ${langLabel}:\n${JSON.stringify(missing)}`,
    },
  ];

  try {
    let result;
    try {
      result = await requestTranslations(messages, model, apiKey, true);
    } catch (e) {
      // Some OpenRouter providers reject strict json_schema. Retry the same
      // messages WITHOUT response_format and parse JSON from plain text.
      if (/response_format|json_schema/i.test(e.message) && /400|error/i.test(e.message)) {
        console.warn("Strict JSON schema rejected — retrying without response_format:", e.message.slice(0, 200));
        result = await requestTranslations(messages, model, apiKey, false);
      } else {
        throw e;
      }
    }

    const { translations, usage } = result;
    // Neutral token-count log (OpenRouter per-model pricing varies; OpenAI's
    // fixed $/token estimate no longer applies).
    const tokens = (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0);
    console.log(targetLanguage, "~", tokens, "tokens consumed");

    return translations;
  } catch (e) {
    console.error("Translation failed:", e.message);
    return [];
  }
}

export async function buildDictionary() {
  try {
    // The dictionary is materialized by the fetch step (fetch.js downloads
    // docs/public/dictionary.json from the site root), so we only pay for gaps
    // against the previously published translations.

    // Pages are authored as data in config.json (pages.list), not as .md files,
    // so extract translatable strings straight from the config tree.
    let config = read("./docs/public/config.json");
    for (const v of extractValues(config)) valueSet.add(v);

    // Calendar events (built from config.calendar.events) also carry text.
    for (const v of extractValues(read("./docs/public/calendar.json"))) valueSet.add(v);

    // Also extract hardcoded navbar group labels so they get translated.
    try {
      const navSrc = read("./docs/.vitepress/navBar.js");
      const groupMatches = navSrc.match(/groupLabels\s*=\s*\{[^}]*\}/);
      if (groupMatches) {
        const labelMatches = groupMatches[0].match(/"([^"]+)"/g);
        if (labelMatches) {
          for (const m of labelMatches) valueSet.add(m.replace(/"/g, ""));
        }
      }
    } catch {}

    const valuesArray = [...valueSet];

    // Translate
    let languages = config.languages?.length ? config.languages : [];
    await Promise.allSettled(languages.map((lang) => translateMissing(valuesArray, lang)));

    // Always re-emit the merged (downloaded + freshly translated) dictionary so
    // the next build can re-download it. translateMissing skips its own write
    // when nothing was missing, so without this a no-op build would never
    // re-publish the dictionary and persistence would break.
    write(dictPath, dictionary);
  } catch (error) {
    console.error("Error loading translating data:", error);
  }
}
