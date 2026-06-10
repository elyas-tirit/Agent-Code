import type { ChangelogAccent } from "@shared/protocol";

/**
 * Color tokens for the changelog panel — keep all the gradient/bg/text values
 * in one place so accent swaps stay coherent across cards, chips, badges.
 */
export interface AccentTokens {
  /** Soft tinted background (12-18% alpha). */
  bg: string;
  /** Text color (light tint of the same hue). */
  text: string;
  /** Border for badges/pills. */
  border: string;
}

const TOKENS: Record<ChangelogAccent, AccentTokens> = {
  blue: {
    bg: "rgba(64, 103, 232, 0.18)",
    text: "#a3b7ff",
    border: "rgba(64, 103, 232, 0.25)",
  },
  cyan: {
    bg: "rgba(112, 255, 243, 0.14)",
    text: "#70fff3",
    border: "rgba(112, 255, 243, 0.25)",
  },
  violet: {
    bg: "rgba(183, 148, 244, 0.16)",
    text: "#b794f4",
    border: "rgba(183, 148, 244, 0.25)",
  },
  amber: {
    bg: "rgba(255, 209, 102, 0.16)",
    text: "#ffd166",
    border: "rgba(255, 209, 102, 0.25)",
  },
  rose: {
    bg: "rgba(251, 113, 133, 0.16)",
    text: "#fb7185",
    border: "rgba(251, 113, 133, 0.25)",
  },
  neutral: {
    bg: "rgba(255, 255, 255, 0.08)",
    text: "rgba(255, 255, 255, 0.78)",
    border: "rgba(255, 255, 255, 0.14)",
  },
};

export function accentTokens(accent: ChangelogAccent | undefined): AccentTokens {
  return TOKENS[accent ?? "neutral"];
}
