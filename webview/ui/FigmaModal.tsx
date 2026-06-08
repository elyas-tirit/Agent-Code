import { useEffect, useState } from "react";
import { FigmaGlyph, Icon } from "./Icon";
import { t } from "../i18n";

/** A polished modal to attach a Figma frame by URL (replaces a plain host input box). */
export function FigmaModal({ onSubmit, onClose }: { onSubmit: (url: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const node = /node-id=([0-9-]+)/.exec(url)?.[1];
  const valid = /figma\.com\//i.test(url);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const submit = () => {
    if (!valid) return;
    onSubmit(url.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6" onClick={onClose}>
      <div className="ac-fade-in absolute inset-0 bg-black/65 backdrop-blur-md" />
      <div
        className="ac-pop relative w-[480px] max-w-[94%] overflow-hidden rounded-2xl border border-white/10 bg-[#161616]"
        style={{ boxShadow: "0 30px 90px rgba(0,0,0,0.7), 0 0 60px -22px #a259ff" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{ background: "conic-gradient(from 0deg,#ff7262,#a259ff,#1abcfe,#0acf83,#ff7262)" }}
        />
        <div className="relative flex flex-col items-center gap-2.5 px-6 pb-5 pt-8 text-center">
          <span className="ac-float flex size-14 items-center justify-center rounded-2xl bg-black/50 ring-1 ring-white/10">
            <FigmaGlyph size={30} />
          </span>
          <div className="text-[16px] font-semibold text-white">{t("Attach a Figma frame", "Allega un frame Figma")}</div>
          <p className="max-w-[330px] text-[12.5px] leading-relaxed text-white/50">
            {t("Paste a frame link (with the ", "Incolla il link di un frame (con il ")}<span className="font-mono text-white/70">node-id</span>{t("). The agent reads its design via Figma MCP.", "). L'agente ne legge il design via Figma MCP.")}
          </p>
        </div>
        <div className="px-6 pb-6">
          <div
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
              url ? (valid ? "border-[#a259ff]/60 bg-[#a259ff]/[0.06]" : "border-amber-400/40 bg-amber-400/[0.04]") : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <FigmaGlyph size={14} />
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="https://www.figma.com/design/…?node-id=123-456"
              className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-white/30"
            />
          </div>
          {node && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#a259ff]/15 px-2 py-1 text-[11.5px] text-[#c9a3ff]">
              <Icon name="check" size={12} /> {t("Frame detected", "Frame rilevato")} · {node}
            </div>
          )}
          {url && !valid && <div className="mt-2 text-[11.5px] text-amber-300/80">{t("That doesn't look like a Figma link…", "Non sembra un link Figma…")}</div>}
          <div className="mt-4 flex gap-2">
            <button
              disabled={!valid}
              onClick={submit}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13.5px] font-medium transition ${
                valid ? "text-white" : "cursor-not-allowed bg-white/10 text-white/40"
              }`}
              style={valid ? { background: "linear-gradient(90deg,#a259ff,#1abcfe)", boxShadow: "0 0 22px -6px #a259ff" } : undefined}
            >
              <Icon name="paperclip" size={15} /> {t("Attach", "Allega")}
            </button>
            <button onClick={onClose} className="rounded-lg bg-white/8 px-4 text-[13px] text-white/80 hover:bg-white/12">
              {t("Cancel", "Annulla")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
