// Utilidades para imágenes de Unsplash. `images.unsplash.com` es una CDN que
// respeta parámetros de query (w/h/q/auto/fit), así que podemos servir un srcset
// responsive cambiando solo la URL, sin servidor ni paso de build.

// Anchuras candidatas predeterminadas: cubren desde columnas de grid hasta el
// hero a pantalla completa, sin llegar a pesos absurdos en móvil.
export const DEFAULT_WIDTHS = [480, 768, 1280, 1920];

// ¿Es una URL de la CDN de Unsplash? (misma detección que usa UnsplashCredit).
export function isUnsplashUrl(src) {
  if (typeof src !== "string" || src.length === 0) return false;
  let url;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  return url.hostname === "images.unsplash.com";
}

// Copia de la URL con w/auto/q aplicados (ajuste de ancho, se preserva el
// aspect: NO usamos fit=crop ni h= para no distorsionar los layouts actuales).
// URLSearchParams añade `?` o `&` según toque y conserva cualquier query previa
// (p. ej. ixlib=...). Un `w=` ya existente se sobrescribe.
function withUnsplashParams(url, width) {
  const u = new URL(url);
  u.searchParams.set("w", String(width));
  u.searchParams.set("auto", "format"); // la CDN sirve webp/avif automáticamente
  u.searchParams.set("q", "80"); // calidad consistente explícita
  return u.toString();
}

// Construye el srcset para una URL de Unsplash; null si no lo es.
export function buildUnsplashSrcset(src, widths = DEFAULT_WIDTHS) {
  if (!isUnsplashUrl(src)) return null;
  return widths.map((w) => `${withUnsplashParams(src, w)} ${w}w`).join(", ");
}
