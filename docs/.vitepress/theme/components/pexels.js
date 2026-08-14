// Utilidades para imágenes de Pexels. `images.pexels.com` es una CDN que
// respeta parámetros de query (w/h/dpr/auto/cs/tinysrgb), así que podemos
// servir un srcset responsive cambiando solo la URL, sin servidor ni paso de
// build — igual que con las de Unsplash.
//
// Convenio de atribución (contrato con docs/.vitepress/theme/lib/pexels.js del
// editor): la política de Pexels exige mostrar el nombre del fotógrafo, así que
// las URLs guardadas pueden llevar un param de query propio — `photographer`
// (nombre, URL-encoded). Aquí se preserva (URLSearchParams) y PexelsCredit.vue
// lo lee. NO cambiar este nombre sin actualizar el otro repo.

import { DEFAULT_WIDTHS } from "./unsplash.js";

// ¿Es una URL de la CDN de Pexels? (misma detección que usa PexelsCredit).
export function isPexelsUrl(src) {
  if (typeof src !== "string" || src.length === 0) return false;
  let url;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  return url.hostname === "images.pexels.com";
}

// Copia de la URL con el ancho aplicado. Se preserva cualquier query previa
// (p. ej. auto=compress&cs=tinysrgb y el param de atribución photographer)
// y se sobrescribe `w`. Se eliminan `dpr` y `h`: las URLs de `large2x` traen
// `dpr=2&h=650`, que duplicarían o recortarían el ancho pedido y distorsionarían
// el aspect ratio.
function withPexelsParams(url, width) {
  const u = new URL(url);
  u.searchParams.set("w", String(width));
  u.searchParams.delete("dpr");
  u.searchParams.delete("h");
  return u.toString();
}

// Construye el srcset para una URL de Pexels; null si no lo es.
export function buildPexelsSrcset(src, widths = DEFAULT_WIDTHS) {
  if (!isPexelsUrl(src)) return null;
  return widths.map((w) => `${withPexelsParams(src, w)} ${w}w`).join(", ");
}
