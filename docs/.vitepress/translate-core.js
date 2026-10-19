// Pure, isomorphic translation helpers (no fs / node imports) so they can run
// both in the build adapter and in the browser preview.
const FIELDS = ["title", "description", "html", "name", "action", "notes", "eventTypeTitle"];

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
