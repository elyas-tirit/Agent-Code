import type { UsageInfo } from "@shared/protocol";
import { Modal } from "./Modal";
import { Icon } from "./Icon";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
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
          <Row k="Metodo auth" v={acc.authMethod} />
          {acc.email && <Row k="Email" v={acc.email} />}
          {acc.organization && <Row k="Organizzazione" v={acc.organization} />}
          {acc.plan && <Row k="Piano" v={acc.plan} />}
        </div>
      )}

      {/* Token totals */}
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Token usati" value={t ? fmt(t.total) : "—"} sub={t ? `${t.input.toLocaleString()} in · ${t.output.toLocaleString()} out` : undefined} />
        <Stat label="Cache letti" value={t ? fmt(t.cacheRead) : "—"} sub={t ? `${fmt(t.cacheCreation)} creati` : undefined} />
        <Stat label="Costo stimato" value={t && t.costUsd > 0 ? `$${t.costUsd.toFixed(2)}` : "$0.00"} sub="abbonamento" />
      </div>

      {/* Rate-limit windows */}
      <div className="mt-5 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-white/45">
        <Icon name="clock" size={14} /> Limiti d'uso
      </div>
      <div className="mt-2.5 space-y-3.5">
        {windows.length === 0 && (
          <p className="text-[12.5px] text-white/40">
            Nessun dato sui limiti ancora. Comparirà appena Claude elabora una richiesta.
          </p>
        )}
        {windows.map((w) => (
          <div key={w.type}>
            <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
              <span className="text-white/75">{w.label}</span>
              <span className="text-white/55">
                {w.known ? `${w.percent}%` : (w.statusLabel ?? "—")}
                {w.resetsInLabel && <span className="ml-2 text-white/35">{w.resetsInLabel}</span>}
              </span>
            </div>
            <Bar percent={w.percent} known={w.known} />
          </div>
        ))}
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-white/35">
        Dati reali riportati da Claude per il tuo abbonamento. La percentuale esatta della finestra
        viene mostrata solo quando l'SDK la fornisce; altrimenti vedi lo stato (sotto i limiti) e i
        token realmente consumati.
      </p>
    </Modal>
  );
}
