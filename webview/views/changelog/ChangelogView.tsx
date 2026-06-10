import { useState } from "react";
import type { ChangelogBundle, Changelog } from "@shared/protocol";
import { post } from "../../vscode";
import { t } from "../../i18n";
import { SectionCard } from "./SectionCard";
import { accentTokens } from "./accents";

/**
 * "What's New" panel. Renders one or more `Changelog` entries (one per version
 * the user skipped, newest first). The host fed us the bundle in the `init`
 * message; clicking "Got it" or closing the panel marks the current version as
 * seen, "Don't show again" disables the post-update auto-open.
 */
export function ChangelogView({ initial }: { initial?: ChangelogBundle }) {
  const [bundle] = useState<ChangelogBundle | undefined>(initial);
  if (!bundle || !bundle.entries.length) {
    return <Empty />;
  }
  return (
    <div className="min-h-screen p-8 md:p-12 overflow-y-auto" style={{ background: "#0e0e0e" }}>
      <Background />
      <div className="ac-fade-in max-w-[900px] mx-auto relative">
        {bundle.entries.map((entry, i) => (
          <Entry key={entry.version} entry={entry} primary={i === 0} />
        ))}
        <Footer current={bundle.current} />
      </div>
    </div>
  );
}

function Entry({ entry, primary }: { entry: Changelog; primary: boolean }) {
  return (
    <section
      className="mb-8 relative rounded-[22px] overflow-hidden ac-frame-bg"
      style={{
        background: "linear-gradient(180deg, #131313 0%, #0c0c0c 100%)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "0 25px 80px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.04) inset",
      }}
    >
      <Header entry={entry} primary={primary} />

      {entry.highlights.length > 0 ? (
        <div className="px-8 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
              style={{ background: "rgba(112, 255, 243, 0.1)", color: "#70fff3", border: "1px solid rgba(112, 255, 243, 0.25)" }}
            >
              {t("Highlights", "In sintesi")}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 ac-stagger">
            {entry.highlights.map((h, i) => {
              const acc = accentTokens(h.accent);
              return (
                <div
                  key={i}
                  className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-[13px] font-medium"
                  style={{
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    color: "rgba(255, 255, 255, 0.86)",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-[10px] flex items-center justify-center text-base shrink-0"
                    style={{ background: acc.bg, color: acc.text }}
                  >
                    {h.emoji}
                  </div>
                  <div>{h.text}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="px-8 pt-2 pb-8 space-y-5 ac-stagger">
        {entry.sections.map((s) => (
          <SectionCard key={s.id} section={s} />
        ))}
      </div>
    </section>
  );
}

function Header({ entry, primary }: { entry: Changelog; primary: boolean }) {
  return (
    <div className="px-8 pt-7 pb-5 flex items-start justify-between gap-6 border-b border-white/[0.06]">
      <div>
        <div className="flex items-center gap-3 mb-2">
          {primary ? (
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
              style={{ background: "linear-gradient(135deg, #4067e8 0%, #70fff3 100%)" }}
            >
              ✨
            </div>
          ) : null}
          <span
            className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
            style={{
              background: "rgba(64, 103, 232, 0.12)",
              color: "#a3b7ff",
              border: "1px solid rgba(64, 103, 232, 0.25)",
            }}
          >
            v{entry.version}
            {primary ? ` · ${t("just installed", "appena installato")}` : ""}
          </span>
        </div>
        <h1 className="text-[28px] font-semibold leading-tight">
          {primary
            ? t("What's new in Agent Code", "Novità in Agent Code")
            : t(`Previously, in v${entry.version}`, `In precedenza, nella v${entry.version}`)}
        </h1>
        {entry.tagline ? (
          <p className="font-dm text-[14px] text-white/55 mt-1">{entry.tagline}</p>
        ) : null}
      </div>
      {primary ? <CloseButton current={entry.version} /> : null}
    </div>
  );
}

function CloseButton({ current }: { current: string }) {
  return (
    <button
      type="button"
      onClick={() => post({ type: "changelog/markSeen", version: current })}
      className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-white/60 text-lg leading-none transition hover:bg-white/10"
      style={{ background: "rgba(255, 255, 255, 0.05)" }}
      aria-label={t("Close", "Chiudi")}
    >
      ×
    </button>
  );
}

function Footer({ current }: { current: string }) {
  const [disableArmed, setDisableArmed] = useState(false);
  const releaseUrl = `https://github.com/elyas-tirit/Agent-Code/releases/tag/v${current}`;

  return (
    <div className="sticky bottom-0 left-0 right-0 mt-4 backdrop-blur-md border border-white/[0.08] rounded-[22px] px-8 py-5 flex items-center justify-between gap-4 flex-wrap"
      style={{ background: "rgba(14, 14, 14, 0.85)" }}
    >
      <button
        type="button"
        onClick={() => setDisableArmed((v) => !v)}
        className="flex items-center gap-2.5 font-dm text-[13px] text-white/[0.68] cursor-pointer"
      >
        <span
          className="w-8 h-[18px] rounded-full relative transition"
          style={{ background: disableArmed ? "#4067e8" : "rgba(255, 255, 255, 0.12)" }}
        >
          <span
            className="absolute top-0.5 w-[14px] h-[14px] rounded-full bg-white transition-transform"
            style={{ transform: disableArmed ? "translateX(16px)" : "translateX(2px)" }}
          />
        </span>
        {t("Don't show on update", "Non mostrare agli update")}
      </button>
      <div className="flex items-center gap-4 font-dm text-[13px]">
        <button
          type="button"
          onClick={() => post({ type: "changelog/openUrl", url: releaseUrl })}
          className="text-white/55 hover:text-white/85 transition"
        >
          {t("Full release notes ↗", "Note di rilascio complete ↗")}
        </button>
        <button
          type="button"
          onClick={() =>
            disableArmed
              ? post({ type: "changelog/disable" })
              : post({ type: "changelog/markSeen", version: current })
          }
          className="px-5 py-2 rounded-lg font-medium text-[13.5px] transition hover:brightness-110"
          style={{
            background: "linear-gradient(135deg, #4067e8 0%, #5f7dff 100%)",
            boxShadow: "0 6px 20px rgba(64, 103, 232, 0.35)",
          }}
        >
          {t("Got it, let's go", "Capito, andiamo")}
        </button>
      </div>
    </div>
  );
}

function Background() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none opacity-60"
      style={{
        backgroundImage:
          "radial-gradient(rgba(64, 103, 232, 0.15) 1px, transparent 1.5px), radial-gradient(rgba(112, 255, 243, 0.08) 1px, transparent 1.5px)",
        backgroundSize: "240px 240px, 400px 400px",
        backgroundPosition: "0 0, 90px 130px",
      }}
    />
  );
}

function Empty() {
  return (
    <div className="min-h-screen flex items-center justify-center text-white/40 font-dm">
      {t("Nothing new to show.", "Nessuna novità da mostrare.")}
    </div>
  );
}
