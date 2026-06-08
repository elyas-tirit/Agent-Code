import type { UsageInfo } from "@shared/protocol";
import { Icon } from "../../ui/Icon";
import { t } from "../../i18n";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function SessionBadge({ usage }: { usage: UsageInfo }) {
  const tokens = usage.tokens?.total ?? 0;
  // The SDK only reports a session % for some plans; when it doesn't, the real
  // token count (with cost in the modal) is the meaningful headline.
  const value = usage.known ? `${usage.percent}%` : tokens > 0 ? `${fmtTokens(tokens)} tok` : "—";
  const subtitle = usage.known
    ? tokens > 0
      ? `${fmtTokens(tokens)} token${usage.resetsInLabel ? ` · ${usage.resetsInLabel}` : ""}`
      : usage.resetsInLabel || "Claude usage"
    : usage.resetsInLabel || usage.account?.plan || "Claude usage";
  return (
    <div className="flex h-[42px] items-center gap-3 rounded-full bg-black/40 px-3 shadow-[0_5px_8px_rgba(0,0,0,0.12)] ring-1 ring-transparent transition-all hover:ring-white/15">
      <div
        className="relative size-7 rounded-full"
        style={{
          background: `conic-gradient(#70fff3 ${(usage.known ? usage.percent : 0) * 3.6}deg, rgba(255,255,255,0.12) 0deg)`,
          mask: "radial-gradient(circle, transparent 52%, #000 53%)",
          WebkitMask: "radial-gradient(circle, transparent 52%, #000 53%)",
        }}
      />
      <div className="leading-tight">
        <div className="text-[14px] font-light text-white">
          Session: <span className="font-extrabold">{value}</span>
        </div>
        <div className="text-[10px] text-[#7f7f7f]">{subtitle}</div>
      </div>
    </div>
  );
}

export function TopBar({
  greeting,
  usage,
  onOpenSettings,
  onOpenUsage,
}: {
  greeting: string;
  usage: UsageInfo;
  onOpenSettings?: () => void;
  onOpenUsage?: () => void;
}) {
  return (
    <div className="relative flex items-center justify-between">
      <button
        onClick={onOpenSettings}
        title={t("Settings", "Impostazioni")}
        className="flex size-[42px] items-center justify-center rounded-full bg-black/40 text-white/70 shadow-[0_5px_8px_rgba(0,0,0,0.12)] ring-1 ring-transparent transition-all hover:text-white hover:ring-white/15"
      >
        <Icon name="sparkles" size={20} />
      </button>
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
        <div className="flex h-[42px] items-center justify-center rounded-full bg-black/40 px-6 text-[15px] font-light text-white shadow-[0_5px_8px_rgba(0,0,0,0.12)]">
          {greeting}
        </div>
      </div>
      <button onClick={onOpenUsage} title={t("Total usage of your subscription", "Uso totale del tuo abbonamento")}>
        <SessionBadge usage={usage} />
      </button>
    </div>
  );
}
