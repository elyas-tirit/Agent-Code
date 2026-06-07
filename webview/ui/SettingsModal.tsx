import { useEffect, useState } from "react";
import type { AppSettings, EffortLevel, PermissionMode } from "@shared/protocol";
import { EFFORT_OPTIONS, MODEL_OPTIONS, PERMISSION_MODES } from "@shared/protocol";
import { onHostMessage, post } from "../vscode";
import { Modal } from "./Modal";

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors ${on ? "bg-[#4067e8]" : "bg-white/15"}`}
    >
      <span className={`block size-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
    </button>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-[13.5px] text-white/85">{label}</div>
        {hint && <div className="text-[11.5px] text-white/40">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const Divider = () => <div className="my-1 h-px bg-white/[0.07]" />;

export function SettingsModal({ onClose, position = "fixed" }: { onClose: () => void; position?: "fixed" | "absolute" }) {
  const [s, setS] = useState<AppSettings | null>(null);

  useEffect(() => {
    post({ type: "settings/get" });
    return onHostMessage((m) => {
      if (m.type === "settings/values") setS(m.settings);
    });
  }, []);

  const patch = (p: Partial<AppSettings>) => {
    setS((cur) => (cur ? { ...cur, ...p } : cur));
    post({ type: "settings/set", patch: p });
  };

  return (
    <Modal title="Impostazioni" icon="sliders" onClose={onClose} width={520} position={position}>
      {!s ? (
        <div className="py-10 text-center text-[13px] text-white/40">Carico le impostazioni…</div>
      ) : (
        <div className="-mt-1">
          <Row label="Il tuo nome" hint="Usato nel saluto della dashboard">
            <input
              value={s.userName}
              onChange={(e) => patch({ userName: e.target.value })}
              placeholder="Auto"
              className="w-40 rounded-lg bg-black/40 px-3 py-1.5 text-right text-[13px] text-white outline-none ring-1 ring-white/10 focus:ring-[#4067e8]/60"
            />
          </Row>
          <Divider />

          <Row label="Modalità predefinita" hint="Con cui partono i nuovi agenti">
            <div className="flex flex-wrap justify-end gap-1">
              {PERMISSION_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => patch({ defaultMode: m.id as PermissionMode })}
                  title={m.hint}
                  className={`rounded-md px-2.5 py-1 text-[11.5px] transition-colors ${
                    s.defaultMode === m.id ? "bg-[#4067e8] text-white" : "bg-white/5 text-white/60 hover:text-white"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </Row>
          <Divider />

          <Row label="Modello" hint="Per i nuovi agenti">
            <select
              value={s.model}
              onChange={(e) => patch({ model: e.target.value })}
              className="rounded-lg bg-black/40 px-3 py-1.5 text-[13px] text-white outline-none ring-1 ring-white/10 focus:ring-[#4067e8]/60"
            >
              {MODEL_OPTIONS.map((o) => (
                <option key={o.id} value={o.id} className="bg-[#1b1b1b]">
                  {o.label}
                </option>
              ))}
            </select>
          </Row>
          <Divider />

          <Row label="Effort di ragionamento">
            <div className="flex justify-end gap-1">
              {EFFORT_OPTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => patch({ effort: e as EffortLevel })}
                  className={`rounded-md px-2 py-1 text-[10.5px] capitalize transition-colors ${
                    s.effort === e ? "bg-[#4067e8] text-white" : "bg-white/5 text-white/55 hover:text-white"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </Row>
          <Divider />

          <Row label="Thinking esteso" hint="Ragionamento più profondo">
            <Toggle on={s.thinking} onChange={(v) => patch({ thinking: v })} />
          </Row>
          <Divider />

          <Row label="Accesso completo" hint="Niente sandbox, può fare tutto sul tuo sistema">
            <Toggle on={s.fullAccess} onChange={(v) => patch({ fullAccess: v })} />
          </Row>
          <Divider />

          <Row label="URL preview" hint="Dev server mostrato nel Design">
            <input
              value={s.previewUrl}
              onChange={(e) => patch({ previewUrl: e.target.value })}
              className="w-48 rounded-lg bg-black/40 px-3 py-1.5 text-right text-[12.5px] text-white outline-none ring-1 ring-white/10 focus:ring-[#4067e8]/60"
            />
          </Row>
          <Divider />

          <Row label="Apri dashboard all'avvio">
            <Toggle on={s.openDashboardOnStartup} onChange={(v) => patch({ openDashboardOnStartup: v })} />
          </Row>
        </div>
      )}
    </Modal>
  );
}
