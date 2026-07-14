import { read, write, fg } from "./node_utils.js";

const dictPath = "./docs/public/dictionary.json";
const FIELDS = ["title", "description", "html", "name", "action", "notes"];
const valueSet = new Set();
export const dictionary = read(dictPath);

/**
 * Recorre recursivamente un objeto/array y aplica una función
 * solo a los valores cuyas claves estén en FIELDS.
 */
function walkAndApply(value, key, handler) {
  // Caso array
  if (Array.isArray(value)) {
    return value.map((v) => walkAndApply(v, key, handler));
  }

  // Caso objeto plano
  if (value && typeof value === "object" && value.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (FIELDS.includes(k)) {
        out[k] = handler(v);
      } else {
        out[k] = walkAndApply(v, k, handler);
      }
    }
    return out;
  }

  // Primitivos
  return value;
}

/**
 * Extrae strings de los campos indicados, incluso dentro de arrays.
 */
export function extractValues(obj) {
  const acc = [];

  walkAndApply(obj, null, (v) => {
    if (typeof v === "string") {
      const parts = v
        .replace(/\n +\n/g, "\n\n")
        .split("\n\n")
        .map((s) => s.trim());
      acc.push(...parts);
    } else if (Array.isArray(v)) {
      v.forEach((x) => {
        if (typeof x === "string") acc.push(x.trim());
      });
    }
    return v; // no transformamos, solo extraemos
  });

  return acc;
}

/**
 * Traduce los campos indicados usando un diccionario.
 */
export function translateObject(obj, dict) {
  return walkAndApply(obj, null, (v) => {
    if (Array.isArray(v)) {
      return v.map((x) => (typeof x === "string" ? translateValue(x, dict) : x));
    }
    if (typeof v === "string") {
      return translateValue(v, dict);
    }
    return v;
  });
}

// Traducir entradas faltantes
async function translateMissing(valuesArray, language) {
  if (!dictionary[language]) dictionary[language] = {};

  const missing = valuesArray
    .filter((phrase) => !dictionary[language][phrase])
    .filter(Boolean)
    .slice(0, 50);

  if (!missing.length) return console.log("No need to translate anything", language);

  const translations = await translateWithOpenAI(missing, language.split(":")[0]);

  if (translations.length != missing.length) {
    return console.log("Wow, dicitionaries are different sizes....", language, missing);
  }

  missing.forEach((text, index) => {
    dictionary[language][text] = translations[index].replaceAll("\\n", "\n").replaceAll("\\\\", "");
  });

  // Guardar actualizaciones
  write(dictPath, dictionary);
}
async function translateWithOpenAI(missing, targetLanguage) {
  if (!Array.isArray(missing) || missing.length === 0 || (missing.length === 1 && missing[0] == "")) return [];

  console.log("Translating to ", targetLanguage, " the missing texts: ", missing);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const langLabel = targetLanguage.replace("Euskara", "Euskara (Leitza dialect)");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4.1",
        response_format: {
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
        },
        messages: [
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
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${text}`);
    }

    const data = await response.json();

    const calculateCost = (usage) => {
      const inputCost = (usage?.prompt_tokens / 1_000_000) * 2.0 * 100;
      const outputCost = (usage?.completion_tokens / 1_000_000) * 8.0 * 100;
      return inputCost + outputCost;
    };

    console.log(targetLanguage, "est_cost:", calculateCost(data.usage).toFixed(4), "cents");

    return JSON.parse(data.choices[0].message.content).translations;
  } catch (e) {
    console.error("Translation failed:", e.message);
    return [];
  }
}

export function translateValue(value, dict) {
  if (typeof value === "string") {
    const list = value
      .replace(/\n +\n/g, "\n\n")
      .replace(/\n\n+/g, "\n\n")
      .split("\n\n")
      .map((s) => s.trim());
    return list.map((v) => dict[v] || v).join("\n\n");
  }
  return value;
}

export async function buildDictionary() {
  try {
    // Get values
    let files = await fg(["*.md", "!aviso-legal.md"], { cwd: "./docs/public/pages", absolute: true });
    files.push("./docs/public/calendar.json", "./docs/public/pages/config.json");
    for (const file of files) {
      const parsed = read(file);
      const values = extractValues(parsed.data || parsed, FIELDS);
      values.forEach((v) => valueSet.add(v));

      if (parsed.content?.trim()) {
        let bits = parsed.content.trim().split("\n");
        bits.forEach((b) => valueSet.add(b));
      }
    }
    const valuesArray = [...valueSet];

    // Translate
    let config = read("./docs/public/pages/config.json");
    let languages = config.languages?.length ? config.languages : [];
    await Promise.allSettled(languages.map((lang) => translateMissing(valuesArray, lang)));
  } catch (error) {
    console.error("Error loading translating data:", error);
  }
}
