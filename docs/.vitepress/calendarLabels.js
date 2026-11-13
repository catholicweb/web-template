// Interface texts of Calendar.vue ("show more" button, today marker). Browser-safe, keyed by
// language code; languages not listed here fall back to English.
import { getCode } from "./utils.js";

const LABELS = {
  es: { more: "Mostrar {n} más", less: "Mostrar menos", today: "Hoy" },
  en: { more: "Show {n} more", less: "Show less", today: "Today" },
  eu: { more: "Erakutsi {n} gehiago", less: "Erakutsi gutxiago", today: "Gaur" },
  fr: { more: "Afficher {n} de plus", less: "Afficher moins", today: "Aujourd'hui" },
  ca: { more: "Mostra'n {n} més", less: "Mostra'n menys", today: "Avui" },
  de: { more: "{n} weitere anzeigen", less: "Weniger anzeigen", today: "Heute" },
  it: { more: "Mostra altri {n}", less: "Mostra meno", today: "Oggi" },
  pt: { more: "Mostrar mais {n}", less: "Mostrar menos", today: "Hoje" },
  ro: { more: "Arată încă {n}", less: "Arată mai puține", today: "Astăzi" },
  bg: { more: "Покажи още {n}", less: "Покажи по-малко", today: "Днес" },
  ar: { more: "عرض {n} أخرى", less: "عرض أقل", today: "اليوم" },
};

// { more(n), less, today } for a language written "Label:code" (or a bare code).
export function calendarLabels(lang) {
  const l = LABELS[getCode(String(lang ?? ""))] || LABELS.en;
  return { more: (n) => l.more.replace("{n}", n), less: l.less, today: l.today };
}
