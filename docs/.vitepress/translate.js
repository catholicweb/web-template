import { read, write, fs } from "./node_utils.js";
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
const GEMINI_ENDPOINT = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
// Free-tier Flash model (the free tier lets Google use the prompts to improve its products:
// fine for public parish texts, never send private data through it). Override with GEMINI_MODEL.
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_PAUSE_MS = 60_000;

// After a 429 (free-tier rate limit) skip Gemini for a minute: the build goes straight to the
// fallback instead of hammering a quota that is already exhausted.
let geminiPausedUntil = 0;

function buildPrompts(missing, langLabel) {
  const system = `You are a professional translator for a Catholic parish website serving a community in the Basque Country (northern Navarre, Spain). Content includes parish announcements, mass times, event descriptions, village names, and religious texts.

Rules:
- Translate into natural, fluent ${langLabel} with a warm, formal parish tone.
- Source texts are in Basque (Euskara) or Spanish — detect automatically.
- Preserve ALL HTML tags, Markdown syntax, and line breaks exactly as they appear; translate only the human-readable text around them.
- Do NOT translate proper nouns: village and place names (Leitza, Betelu, Arruitz, Arrarats, Goizueta, Lekunberri, Areso, Larraun, Basaburua, Esteribar, and similar), personal names, or the name "47 herri".
- If a string is already in the target language, a number, a symbol, or a URL, return it unchanged.
- Return exactly as many strings as you receive, in the same order — one translation per input.
- Return ONLY the JSON object, no explanation or preamble.`;
  const user = `Translate each string in this JSON array to ${langLabel}:\n${JSON.stringify(missing)}`;
  return { system, user };
}

export function parseTranslations(content) {
  // Non-strict replies may wrap the JSON in a ```json code fence.
  let text = (content || "").trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return JSON.parse(text).translations;
}

// One string per input, in order. Anything else is a failed attempt, so the next provider gets a go.
function assertTranslations(translations, expected) {
  if (!Array.isArray(translations) || translations.length !== expected || translations.some((t) => typeof t !== "string")) {
    throw new Error(`expected ${expected} translated strings, got ${Array.isArray(translations) ? translations.length : typeof translations}`);
  }
  return translations;
}

// ---- Provider 1: Google Gemini (free tier) ----

async function translateWithGemini({ system, user }, apiKey) {
  if (Date.now() < geminiPausedUntil) throw new Error("Gemini paused after a rate limit");
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

  const response = await fetch(GEMINI_ENDPOINT(model), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: { translations: { type: "ARRAY", items: { type: "STRING" } } },
          required: ["translations"],
        },
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) geminiPausedUntil = Date.now() + GEMINI_PAUSE_MS;
    throw new Error(`Gemini error ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text || "").join("");
  if (!text) throw new Error(`Gemini returned no text (${data.promptFeedback?.blockReason || candidate?.finishReason || "unknown reason"})`);

  const usage = data.usageMetadata;
  return { translations: parseTranslations(text), model, tokens: (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0) };
}

// ---- Provider 2: OpenRouter (fallback) ----

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

async function requestOpenRouter(messages, model, apiKey, withStrict) {
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

async function translateWithOpenRouter({ system, user }, apiKey) {
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  let result;
  try {
    result = await requestOpenRouter(messages, model, apiKey, true);
  } catch (e) {
    // Some OpenRouter providers reject strict json_schema. Retry the same
    // messages WITHOUT response_format and parse JSON from plain text.
    if (/response_format|json_schema/i.test(e.message) && /400|error/i.test(e.message)) {
      console.warn("Strict JSON schema rejected — retrying without response_format:", e.message.slice(0, 200));
      result = await requestOpenRouter(messages, model, apiKey, false);
    } else {
      throw e;
    }
  }
  // Neutral token-count log (OpenRouter per-model pricing varies; OpenAI's
  // fixed $/token estimate no longer applies).
  const tokens = (result.usage?.prompt_tokens || 0) + (result.usage?.completion_tokens || 0);
  return { translations: result.translations, model, tokens };
}

// Providers in order of preference: the free Gemini key first, OpenRouter as the fallback.
// A provider that fails (HTTP error, rate limit, bad JSON, wrong number of strings) hands over to the next.
function configuredProviders() {
  const providers = [];
  if (process.env.GEMINI_API_KEY) providers.push({ name: "gemini", run: (p) => translateWithGemini(p, process.env.GEMINI_API_KEY) });
  if (process.env.OPENROUTER_API_KEY) providers.push({ name: "openrouter", run: (p) => translateWithOpenRouter(p, process.env.OPENROUTER_API_KEY) });
  return providers;
}

export async function translateWithLLM(missing, targetLanguage) {
  if (!Array.isArray(missing) || missing.length === 0 || (missing.length === 1 && missing[0] == "")) return [];

  console.log("Translating to ", targetLanguage, " the missing texts: ", missing);

  const providers = configuredProviders();
  if (!providers.length) {
    throw new Error("Missing GEMINI_API_KEY or OPENROUTER_API_KEY");
  }

  const langLabel = targetLanguage.replace("Euskara", "Euskara (Leitza dialect)");
  const prompts = buildPrompts(missing, langLabel);

  for (const provider of providers) {
    try {
      const { translations, model, tokens } = await provider.run(prompts);
      assertTranslations(translations, missing.length);
      console.log(targetLanguage, "~", tokens, "tokens consumed", `(${provider.name}: ${model})`);
      return translations;
    } catch (e) {
      console.warn(`Translation with ${provider.name} failed:`, e.message.slice(0, 300));
    }
  }

  console.error("Translation failed with every provider");
  return [];
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
    // NOTE: read() returns a gray-matter object for non-JSON files, not a string,
    // so the source must be read as plain text for the regexes below to work.
    try {
      const navSrc = fs.readFileSync("./docs/.vitepress/navBar.js", "utf8");
      const groupMatches = navSrc.match(/groupLabels\s*=\s*\{[^}]*\}/);
      if (groupMatches) {
        const labelMatches = groupMatches[0].match(/"([^"]+)"/g);
        if (labelMatches) {
          for (const m of labelMatches) valueSet.add(m.replace(/"/g, ""));
        }
      }
    } catch (e) {
      console.warn("Unable to extract navbar group labels for translation:", e.message);
    }

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
