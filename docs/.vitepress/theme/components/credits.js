// Utilidades de imagen para las CDNs de Unsplash y Pexels, unificadas.
// Ambas CDNs respetan parámetros de query (Unsplash: w/h/q/auto/fit; Pexels:
// w/h/dpr/auto/cs/tinysrgb), así que podemos servir un srcset responsive
// cambiando solo la URL, sin servidor ni paso de build. También extraemos aquí
// la atribución mínima que exige cada servicio (ver `imageCredit`).

// Anchuras candidatas predeterminadas: cubren desde columnas de grid hasta el
// hero a pantalla completa, sin llegar a pesos absurdos en móvil.
export const DEFAULT_WIDTHS = [480, 768, 1280, 1920];

// --- Detección de CDN -------------------------------------------------------

// ¿Es una URL de la CDN de Unsplash?
function isUnsplashUrl(src) {
  if (typeof src !== "string" || src.length === 0) return false;
  let url;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  return url.hostname === "images.unsplash.com";
}

// ¿Es una URL de la CDN de Pexels?
function isPexelsUrl(src) {
  if (typeof src !== "string" || src.length === 0) return false;
  let url;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  return url.hostname === "images.pexels.com";
}

// --- Detección de Wikimedia / Commons --------------------------------------

function isWikimediaUrl(src) {
  if (typeof src !== "string" || src.length === 0) return false;
  try {
    const url = new URL(src);
    return url.hostname === "upload.wikimedia.org" || url.hostname === "commons.wikimedia.org";
  } catch {
    return false;
  }
}

// --- Atribución --------------------------------------------------------------

// Convenio de atribución de Pexels (contrato con docs/.vitepress/theme/lib/pexels.js
// del editor): la política de Pexels exige mostrar el nombre del fotógrafo, así que
// las URLs guardadas pueden llevar dos params de query propios — `photographer`
// (nombre, URL-encoded) y `url` (página de la foto en pexels.com, URL-encoded).
// NO cambiar estos nombres sin actualizar el otro repo.
//
// Unsplash exige dar crédito (enlazando a la página de la foto) con los params
// utm `utm_source=parroquia.app&utm_medium=referral`.
const UTM_PARAMS = "utm_source=parroquia.app&utm_medium=referral";

// Devuelve { name, url } de la atribución de una imagen, o null si el src no es
// de una CDN con atribución reconocida:
//   - Unsplash:  name "Unsplash", url a `https://unsplash.com/photos/<id>`.
//   - Pexels:    name del fotógrafo, url a su página en pexels.com.
export function imageCredit(src) {
  const wikimedia = wikimediaCredit(src);
  if (wikimedia) return wikimedia;
  const pexels = pexelsCredit(src);
  if (pexels) return pexels;
  const unsplash = unsplashCredit(src);
  if (unsplash) return unsplash;
  return null;
}

function wikimediaCredit(src) {
  if (!isWikimediaUrl(src)) return null;
  try {
    const url = new URL(src);
    const name = url.searchParams.get("photographer") || "Wikimedia Commons";
    const path = url.pathname;
    // Extract filename from /wikipedia/commons/.../File.jpg
    const parts = path.split("/");
    const fileRaw = parts.pop() || "";
    // Thumb URLs contain 250px-Filename.jpg; strip width prefix for File page
    const file = fileRaw.replace(/^\d+px-/, '') || fileRaw;
    if (!file) return null;
    const filePage = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`;
    return { name, url: filePage };
  } catch {
    return null;
  }
}

function pexelsCredit(src) {
  if (!isPexelsUrl(src)) return null;
  let url;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  const name = url.searchParams.get("photographer") || "Pexels";
  const photoUrl = url.searchParams.get("url");
  if (!name || !photoUrl) return null;
  return { name, url: photoUrl };
}

// Extrae el id de la foto del pathname de una URL de images.unsplash.com:
//   https://images.unsplash.com/photo-<id>?params...  ->  https://unsplash.com/photos/<id>
function unsplashCredit(src) {
  if (!isUnsplashUrl(src)) return null;
  let url;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  const name = url.searchParams.get("photographer")  || "Unsplash";
  const m = url.pathname.match(/^\/photo-([^/]+)/);
  if (!m) return null;
  return { name: name, url: `https://unsplash.com/photos/${m[1]}?${UTM_PARAMS}` };
}

// --- Srcset responsive --------------------------------------------------------

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

// Copia de URL con el ancho aplicado. Se preserva cualquier query previa
// (p. ej. auto=compress&cs=tinysrgb y los params de atribución photographer/url)
// y se sobrescribe `w`. Se eliminan `dpr` y `h`: las URLs de `large2x` traen
// `dpr=2&h=650`, que duplicarían o recortarían el ancho pedido y distorsionarían
// el aspect ratio.
function withWikimediaThumb(url, width) {
  // Not all sizes are allowed, so we pick the nearest ones
  const ALLOWED_WIDTHS = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840];
  const nearest = (target) => ALLOWED_WIDTHS.reduce((prev, curr) => Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev);
  const u = new URL(url);
  const p = u.pathname.split("/");
  // If already a thumb URL (/thumb/...), extract base filename and hash dirs
  const thumbIdx = p.indexOf("thumb");
  if (thumbIdx !== -1 && p.length >= thumbIdx + 3) {
    const afterThumb = p.slice(thumbIdx + 1); // [hash1, hash2, baseFile, 250px-File.jpg]
    const hash1 = afterThumb[0];
    const hash2 = afterThumb[1];
    const baseFile = afterThumb[2];
    return `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash1}/${hash2}/${baseFile}/${nearest(width)}px-${baseFile}`;
  }
  // Full file URL: /wikipedia/commons/a/ab/File.jpg
  const idx = p.indexOf("commons");
  if (idx === -1 || p.length < idx + 3) {
    return url;
  }
  const after = p.slice(idx + 1); // e.g. ["a","ab","File.jpg"]
  const hash1 = after[0];
  const hash2 = after[1];
  const filename = after[after.length - 1];
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash1}/${hash2}/${filename}/${nearest(width)}px-${filename}`;
}

function withPexelsParams(url, width) {
  const u = new URL(url);
  u.searchParams.set("w", String(width));
  u.searchParams.delete("dpr");
  u.searchParams.delete("h");
  return u.toString();
}

// Construye el srcset responsive de una imagen de Unsplash o Pexels;
// null si el src no es de ninguna de las dos CDN.
export function buildImageSrcset(src, widths = DEFAULT_WIDTHS) {
  if (isWikimediaUrl(src)) {
    return widths.map((w) => `${withWikimediaThumb(src, w)} ${w}w`).join(", ");
  }
  if (isUnsplashUrl(src)) {
    return widths.map((w) => `${withUnsplashParams(src, w)} ${w}w`).join(", ");
  }
  if (isPexelsUrl(src)) {
    return widths.map((w) => `${withPexelsParams(src, w)} ${w}w`).join(", ");
  }
  return null;
}