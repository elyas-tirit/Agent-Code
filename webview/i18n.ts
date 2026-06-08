export type Lang = "en" | "it";

let current: Lang = "en";

export function setLang(l: Lang): void {
  current = l === "it" ? "it" : "en";
}
export function getLang(): Lang {
  return current;
}

/**
 * Inline translation. English is the source language (first arg) and the default;
 * Italian (second arg) is shown when the UI language is set to Italian.
 *
 *   t("Ask me anything…", "Chiedimi qualsiasi cosa…")
 *
 * Kept inline (rather than a keyed dictionary) so strings live next to their use,
 * there are no keys to keep in sync, and files can be translated independently.
 */
export function t(en: string, it: string): string {
  return current === "it" ? it : en;
}
