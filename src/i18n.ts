export type Lang = "en" | "it";

let current: Lang = "en";

export function setHostLang(l: Lang): void {
  current = l === "it" ? "it" : "en";
}
export function getHostLang(): Lang {
  return current;
}

/** Resolve the effective language from the setting ("auto" | "en" | "it") and the
 *  editor locale (e.g. vscode.env.language). "auto" follows the editor's language. */
export function resolveLang(setting: string | undefined, locale: string): Lang {
  if (setting === "it") return "it";
  if (setting === "en") return "en";
  return /^it\b|^it-/i.test(locale || "") ? "it" : "en";
}

/** Inline translation for host-side strings — English source, Italian alternative. */
export function t(en: string, it: string): string {
  return current === "it" ? it : en;
}
