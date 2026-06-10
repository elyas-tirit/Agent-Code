import { useEffect, useState } from "react";
import type { RateWindow, UsageInfo } from "@shared/protocol";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { t as tr } from "../i18n";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

/**
 * Live "Resets in 2h 40m" countdown — driven by `resetsAt` (unix seconds).
 * Re-ticks once a minute. If the SDK didn't give us an absolute reset time we
 * fall back to the static label the host built (still useful, just not live).
 */
function useCountdown(resetsAt: number | undefined, fallback: string): string {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!resetsAt) return;
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [resetsAt]);
  if (!resetsAt) return fallback;
  const seconds = Math.max(0, resetsAt - Math.floor(Date.now() / 1000));
  if (seconds === 0) return tr("Resetting now", "Reset in corso");
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return tr(`Resets in ${d}d ${h}h`, `Reset tra ${d}g ${h}h`);
  if (h > 0) return tr(`Resets in ${h}h ${m}m`, `Reset tra ${h}h ${m}m`);
  return tr(`Resets in ${m}m`, `Reset tra ${m}m`);
}

function StatusChip({ status }: { status: NonNullable<RateWindow["status"]> }) {
  const cfg = {
    allowed: { label: tr("Under limit", "Sotto il limite"), bg: "rgba(74, 222, 128, 0.12)", color: "#86efac", border: "rgba(74, 222, 128, 0.3)" },
    allowed_warning: { label: tr("Approaching limit", "Vicino al limite"), bg: "rgba(255, 209, 102, 0.14)", color: "#ffd166", border: "rgba(255, 209, 102, 0.3)" },
    rejected: { label: tr("Over limit", "Limite superato"), bg: "rgba(251, 113, 133, 0.14)", color: "#fb7185", border: "rgba(251, 113, 133, 0.3)" },
  }[status];
  return (
    <span
      className="text-[10.5px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}
    >
      {cfg.label}
    </span>
  );
}

function WindowRow({ w }: { w: RateWindow }) {
  const reset = useCountdown(w.resetsAt, w.resetsInLabel);
  // When the SDK doesn't give us `utilization` (e.g. Team plans), but DOES tell
  // us a threshold was crossed, render the threshold as the bar so the user
  // gets a visual signal — labeled accordingly to keep it honest.
  const hasThreshold = !w.known && typeof w.surpassedThreshold === "number" && w.surpassedThreshold > 0;
  const displayPercent = w.known
    ? w.percent
    : hasThreshold
      ? Math.round((w.surpassedThreshold as number) * 100)
      : 0;
  const displayLabel = w.known
    ? `${w.percent}%`
    : hasThreshold
      ? tr(`≥${displayPercent}%`, `≥${displayPercent}%`)
      : w.statusLabel ?? "—";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[12.5px]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white/75 truncate">{w.label}</span>
          {w.status ? <StatusChip status={w.status} /> : null}
        </div>
        <span className="text-white/55 whitespace-nowrap">
          {displayLabel}
          {reset && <span className="ml-2 text-white/35">{reset}</span>}
        </span>
      </div>
      <Bar percent={displayPercent} known={w.known || hasThreshold} />
      {w.overage ? <OverageRow overage={w.overage} /> : null}
    </div>
  );
}

function OverageRow({ overage }: { overage: NonNullable<RateWindow["overage"]> }) {
  const reset = useCountdown(overage.resetsAt, "");
  // Most useful state: user is actively using overage. Otherwise show why it's
  // unavailable (e.g. "Org-level disabled") so the user knows what they have.
  if (overage.isUsing) {
    return (
      <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-white/55">
        <span>{tr("Currently using overage", "Stai usando l'overage")}</span>
        {reset && <span className="text-white/40">{reset}</span>}
      </div>
    );
  }
  if (overage.disabledReason && overage.disabledReason !== "no_limits_configured") {
    return (
      <div className="mt-1.5 text-[11.5px] text-white/40">
        {tr("Overage", "Overage")} · {disabledReasonLabel(overage.disabledReason)}
      </div>
    );
  }
  return null;
}

function disabledReasonLabel(reason: string): string {
  const labels: Record<string, [string, string]> = {
    overage_not_provisioned: ["not provisioned", "non attivato"],
    org_level_disabled: ["disabled by org", "disattivato dall'org"],
    org_level_disabled_until: ["disabled by org (temp)", "disattivato dall'org (temp)"],
    out_of_credits: ["out of credits", "crediti esauriti"],
    seat_tier_level_disabled: ["disabled by seat tier", "disattivato dal piano"],
    member_level_disabled: ["disabled for this account", "disattivato per l'account"],
    fetch_error: ["unavailable", "non disponibile"],
  };
  const pair = labels[reason];
  return pair ? tr(pair[0], pair[1]) : reason;
}

function Bar({ percent, known }: { percent: number; known: boolean }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: known ? `${p}%` : "100%",
          opacity: known ? 1 : 0.25,
          background: "linear-gradient(90deg, #4067e8 0%, #70fff3 100%)",
        }}
      />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3">
      <div className="text-[11px] uppercase tracking-wide text-white/40">{label}</div>
      <div className="mt-0.5 text-[20px] font-semibold text-white">{value}</div>
      {sub && <div className="text-[11px] text-white/45">{sub}</div>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-[13px]">
      <span className="text-white/45">{k}</span>
      <span className="text-white/85">{v}</span>
    </div>
  );
}

export function UsageModal({
  usage,
  title,
  scope,
  onClose,
  position = "fixed",
}: {
  usage: UsageInfo;
  title: string;
  scope: string;
  onClose: () => void;
  position?: "fixed" | "absolute";
}) {
  const t = usage.tokens;
  const windows = usage.windows ?? [];
  const acc = usage.account;
  return (
    <Modal title={title} icon="gauge" onClose={onClose} width={500} position={position}>
      <p className="mb-4 text-[12.5px] leading-relaxed text-white/55">{scope}</p>

      {/* Account */}
      {acc && (
        <div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-white/40">Account</div>
          <Row k={tr("Auth method", "Metodo auth")} v={acc.authMethod} />
          {acc.email && <Row k="Email" v={acc.email} />}
          {acc.organization && <Row k={tr("Organization", "Organizzazione")} v={acc.organization} />}
          {acc.plan && <Row k={tr("Plan", "Piano")} v={acc.plan} />}
        </div>
      )}

      {/* Token totals */}
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label={tr("Tokens used", "Token usati")} value={t ? fmt(t.total) : "—"} sub={t ? `${t.input.toLocaleString()} in · ${t.output.toLocaleString()} out` : undefined} />
        <Stat label={tr("Cache reads", "Cache letti")} value={t ? fmt(t.cacheRead) : "—"} sub={t ? tr(`${fmt(t.cacheCreation)} created`, `${fmt(t.cacheCreation)} creati`) : undefined} />
        <Stat label={tr("Estimated cost", "Costo stimato")} value={t && t.costUsd > 0 ? `$${t.costUsd.toFixed(2)}` : "$0.00"} sub={tr("subscription", "abbonamento")} />
      </div>

      {/* Rate-limit windows */}
      <div className="mt-5 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-white/45">
        <Icon name="clock" size={14} /> {tr("Usage limits", "Limiti d'uso")}
      </div>
      <div className="mt-2.5 space-y-3.5">
        {windows.length === 0 && (
          <p className="text-[12.5px] text-white/40">
            {tr(
              "No limit data yet. It will appear as soon as Claude processes a request.",
              "Nessun dato sui limiti ancora. Comparirà appena Claude elabora una richiesta.",
            )}
          </p>
        )}
        {windows.map((w) => (
          <WindowRow key={w.type} w={w} />
        ))}
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-white/35">
        {tr(
          "Real data reported by Claude for your subscription. The exact window percentage is shown only when the SDK provides it; otherwise you see the status (under the limits) and the tokens actually consumed.",
          "Dati reali riportati da Claude per il tuo abbonamento. La percentuale esatta della finestra viene mostrata solo quando l'SDK la fornisce; altrimenti vedi lo stato (sotto i limiti) e i token realmente consumati.",
        )}
      </p>
    </Modal>
  );
}
