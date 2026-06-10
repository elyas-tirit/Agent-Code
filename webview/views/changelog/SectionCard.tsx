import type { ChangelogSection } from "@shared/protocol";
import { Md } from "../../ui/Markdown";
import { accentTokens } from "./accents";
import { Visual } from "./Visual";

/**
 * One card per change. Header: emoji-on-tinted-square + title + subtitle + optional
 * top-right badge. Body: markdown ("why" before "what"). Optional visual between
 * header and body. Optional collapsible "For the curious" with tech details.
 */
export function SectionCard({ section }: { section: ChangelogSection }) {
  const accent = accentTokens(section.accent);
  const badgeAccent = accentTokens(section.badge?.accent ?? section.accent);

  return (
    <div className="rounded-[18px] border border-white/[0.07] overflow-hidden" style={{ background: "rgba(255, 255, 255, 0.02)" }}>
      {/* Header */}
      <div className="flex gap-3.5 pt-[18px] pb-3.5 px-[22px] items-start">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-[18px] shrink-0"
          style={{ background: accent.bg, color: accent.text }}
        >
          {section.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-semibold mb-1 leading-tight">{section.title}</div>
          {section.subtitle ? (
            <div className="font-dm text-[13px] text-white/55 leading-snug">{section.subtitle}</div>
          ) : null}
        </div>
        {section.badge ? (
          <span
            className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border whitespace-nowrap"
            style={{
              background: badgeAccent.bg,
              color: badgeAccent.text,
              borderColor: badgeAccent.border,
            }}
          >
            {section.badge.label}
          </span>
        ) : null}
      </div>

      {section.visual ? <Visual visual={section.visual} /> : null}

      <div className="px-[22px] pb-[18px] font-dm text-[14px] leading-[1.65] text-white/[0.78]">
        <Md text={section.body} />
      </div>

      {section.techDetails ? <TechDetails text={section.techDetails} /> : null}
    </div>
  );
}

/**
 * Collapsible details block. Uses native <details> so keyboard/screen-reader
 * behaviour is correct, with a tweaked summary that swaps the default marker for
 * a chevron that rotates on open.
 */
function TechDetails({ text }: { text: string }) {
  return (
    <details className="mx-[22px] mb-[18px] rounded-xl border border-white/[0.08] group" style={{ background: "rgba(255, 255, 255, 0.03)" }}>
      <summary
        className="cursor-pointer list-none px-3.5 py-2.5 text-[12.5px] font-semibold text-white/70 tracking-wider flex items-center justify-between"
        style={{ letterSpacing: "0.02em" }}
      >
        <span>For the curious — how it works</span>
        <span className="text-[18px] leading-none text-white/45 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="px-3.5 pb-3.5 text-[12.5px] leading-[1.6] text-white/[0.65]">
        <Md text={text} />
      </div>
    </details>
  );
}
