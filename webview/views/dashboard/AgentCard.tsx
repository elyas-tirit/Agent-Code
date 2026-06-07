import type { AgentCard as AgentCardModel, CardAccent } from "@shared/protocol";
import { Avatar } from "../../ui/Avatar";

interface AgentCardProps {
  card: AgentCardModel;
  onAction: (actionId: string) => void;
  onOpen: () => void;
}

const HEADER_BG: Record<CardAccent, string> = {
  blue: "linear-gradient(90deg, #203474 0%, #3c62da 100%)",
  yellow: "linear-gradient(90deg, #746d20 0%, #dacd3c 100%)",
  neutral: "linear-gradient(180deg, rgba(40,40,40,0.55) 0%, rgba(0,0,0,0.5) 100%)",
  red: "linear-gradient(90deg, #5a1f1f 0%, #b34040 100%)",
};

const RING: Record<CardAccent, string> = {
  blue: "rgba(112,255,243,0.55)",
  yellow: "rgba(245,224,80,0.7)",
  neutral: "rgba(112,255,243,0.5)",
  red: "rgba(220,90,90,0.7)",
};

const GLOW: Record<CardAccent, string> = {
  blue: "0 18px 50px -22px rgba(60,98,218,0.8)",
  yellow: "0 18px 50px -22px rgba(218,205,60,0.55)",
  neutral: "0 18px 50px -26px rgba(112,255,243,0.5)",
  red: "0 18px 50px -22px rgba(179,64,64,0.6)",
};

function StatusPill({ label, working, accent }: { label: string; working: boolean; accent: CardAccent }) {
  const dark = accent === "blue" || accent === "red";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-[12px] font-light leading-none shadow-[0_4px_8px_rgba(0,0,0,0.1)] ${
        dark ? "bg-black/25 text-white" : accent === "yellow" ? "bg-black/30 text-white" : "bg-white/10 text-white/90"
      }`}
    >
      {working && (
        <span className="ac-pulse-ring mr-1.5 inline-block size-1.5 rounded-full bg-[#70fff3]" />
      )}
      {label}
    </span>
  );
}

export function AgentCard({ card, onAction, onOpen }: AgentCardProps) {
  const working = card.status === "working";
  const accent = card.accent;

  return (
    <div
      onClick={onOpen}
      className="group relative flex h-[230px] cursor-pointer flex-col overflow-hidden rounded-[24px] border border-white/[0.06] bg-[#161616]/50 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1"
      style={{ boxShadow: undefined }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 8px 28px rgba(0,0,0,0.35), ${GLOW[accent]}`)}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.35)")}
    >
      {/* Sweep highlight on hover */}
      <div className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.04] to-transparent" />
      </div>

      <div
        className="relative flex h-[120px] items-start gap-4 px-5 pt-5"
        style={{ background: HEADER_BG[accent] }}
      >
        <Avatar size={80} active={working} ring={RING[accent]} />
        <div className="flex min-w-0 flex-col gap-2 pt-1">
          <p className="line-clamp-2 text-[20px] font-normal leading-tight text-white">{card.name}</p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label={card.statusLabel} working={working} accent={accent} />
            {card.metaLabel && (
              <span className="rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-light text-white/85">
                {card.metaLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col justify-center gap-3 px-5 py-4">
        {card.actions.length === 0 ? (
          <>
            {working && (
              <div className="ac-shimmer mb-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]" />
            )}
            <p className="line-clamp-2 text-[15px] font-light leading-snug text-white/90">
              {card.description ?? "…"}
            </p>
          </>
        ) : (
          <div className="flex items-center gap-3">
            {card.actions.map((a) => (
              <button
                key={a.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(a.id);
                }}
                className={`h-[46px] flex-1 rounded-full text-[16px] font-light text-white transition-all active:scale-95 ${
                  a.kind === "primary"
                    ? "bg-[#4067e8] shadow-[0_6px_3px_rgba(0,0,0,0.12)] hover:bg-[#3457cf] hover:shadow-[0_0_22px_-4px_#4067e8]"
                    : "bg-black/20 shadow-[0_6px_6px_rgba(0,0,0,0.12)] hover:bg-black/30"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
