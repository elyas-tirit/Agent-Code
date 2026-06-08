import { Icon } from "../../ui/Icon";
import { t } from "../../i18n";

interface NewAgentCardProps {
  onClick: () => void;
}

/**
 * Primary card — "Avvia nuovo agente". Starts a new Claude Code conversation.
 * Matches the Figma: light translucent header, dark + circle, subtitle.
 */
export function NewAgentCard({ onClick }: NewAgentCardProps) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className="group relative flex h-[230px] cursor-pointer flex-col overflow-hidden rounded-[24px] border border-white/[0.06] bg-[#161616]/40 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-transform hover:-translate-y-0.5"
    >
      {/* Light header */}
      <div className="flex h-[120px] items-center gap-4 px-5" style={{ background: "rgba(255,255,255,0.5)" }}>
        <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-black/25 text-white shadow-[0_3px_3px_rgba(0,0,0,0.1)] transition-transform group-hover:scale-105">
          <Icon name="plus" size={38} strokeWidth={1.8} />
        </div>
        <p className="text-[20px] font-normal leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
          {t("Start new agent", "Avvia nuovo agente")}
        </p>
      </div>

      {/* Subtitle */}
      <div className="flex flex-1 items-center px-5 py-4">
        <p className="text-[15px] font-light leading-snug text-white/90">
          {t("Start a new conversation with Claude.", "Avvia una nuova conversazione con Claude.")}
          <br />
          {t("Uses the usage from your subscription.", "Utilizza lo usage del tuo abbonamento.")}
        </p>
      </div>
    </div>
  );
}
