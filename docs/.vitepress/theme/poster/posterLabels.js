// Texts of the printable event poster (PosterMode.vue). Browser-safe, keyed by language code;
// languages not listed fall back to English. `poster` strings are printed on the sheet (every
// site language we ship a translation for); `panel` strings are the editing controls.
import { getCode } from "../../utils.js";

const POSTER = {
  en: { every: "Every", weeks: "week {n} of the month", register: "Registration open", info: "More information", signup: "Sign up here", more: "and more dates" },
  es: { every: "Cada", weeks: "semana {n} del mes", register: "Inscripción abierta", info: "Más información", signup: "Inscríbete aquí", more: "y más fechas" },
  eu: { every: "Astero:", weeks: "hileko {n}. astea", register: "Izen-ematea irekita", info: "Informazio gehiago", signup: "Eman izena hemen", more: "eta data gehiago" },
  ca: { every: "Cada", weeks: "setmana {n} del mes", register: "Inscripció oberta", info: "Més informació", signup: "Inscriu-te aquí", more: "i més dates" },
  fr: { every: "Chaque", weeks: "semaine {n} du mois", register: "Inscriptions ouvertes", info: "Plus d'informations", signup: "Inscrivez-vous ici", more: "et d'autres dates" },
  de: { every: "Jeden", weeks: "Woche {n} des Monats", register: "Anmeldung möglich", info: "Mehr Infos", signup: "Hier anmelden", more: "und weitere Termine" },
  it: { every: "Ogni", weeks: "settimana {n} del mese", register: "Iscrizioni aperte", info: "Maggiori informazioni", signup: "Iscriviti qui", more: "e altre date" },
  pt: { every: "Toda", weeks: "semana {n} do mês", register: "Inscrições abertas", info: "Mais informações", signup: "Inscreva-se aqui", more: "e mais datas" },
};

const PANEL = {
  en: {
    title: "Print poster", close: "Close", print: "Print", event: "Event", paper: "Paper", layout: "Layout",
    auto: "Automatic", image: "Image", plain: "No image", text: "Text-heavy", colour: "Colour", show: "Show",
    showImage: "Image", showDescription: "Description", showPhone: "Phone", showLogo: "Logo", qr: "QR code",
    qrAuto: "Automatic", qrPage: "Event page", qrRegister: "Registration form", qrOff: "None", contact: "Contact",
    picture: "Picture", posterTitle: "Title", description: "Description", lowRes: "This image is small and may look blurry in print.",
    hint: "In the print dialog choose margins “None” and untick headers and footers.", tooLong: "The link is too long for a QR code.",
    cover: "Photo cover", sticker: "Sticker (youth)", bold: "Bold (youth)", second: "Second language", showAddress: "Address", noFit: "The text does not fit the poster: shorten it or hide the description.",
  },
  es: {
    title: "Imprimir cartel", close: "Cerrar", print: "Imprimir", event: "Evento", paper: "Papel", layout: "Diseño",
    auto: "Automático", image: "Con imagen", plain: "Sin imagen", text: "Mucho texto", colour: "Color", show: "Mostrar",
    showImage: "Imagen", showDescription: "Descripción", showPhone: "Teléfono", showLogo: "Logo", qr: "Código QR",
    qrAuto: "Automático", qrPage: "Página del evento", qrRegister: "Formulario de inscripción", qrOff: "Ninguno", contact: "Contacto",
    picture: "Imagen", posterTitle: "Título", description: "Descripción", lowRes: "Esta imagen es pequeña y puede verse borrosa al imprimir.",
    hint: "En el diálogo de impresión elige márgenes «Ninguno» y desactiva encabezados y pies de página.", tooLong: "El enlace es demasiado largo para un código QR.",
    cover: "Foto completa", sticker: "Pegatina (joven)", bold: "Atrevido (joven)", second: "Segundo idioma", showAddress: "Dirección", noFit: "El texto no cabe en el cartel: acórtalo u oculta la descripción.",
  },
};

const pick = (table, lang) => table[getCode(String(lang ?? ""))] || table.en;

/** Strings printed on the poster. */
export const posterLabels = (lang) => ({ ...POSTER.en, ...pick(POSTER, lang) });
/** Strings of the editing panel. */
export const panelLabels = (lang) => ({ ...PANEL.en, ...pick(PANEL, lang) });
export const POSTER_LABELS = POSTER;
export const PANEL_LABELS = PANEL;
