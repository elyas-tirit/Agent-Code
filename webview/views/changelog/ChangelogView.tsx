import { useEffect, useState } from "react";
import type { ChangelogBundle, Changelog } from "@shared/protocol";
import { post } from "../../vscode";
import { t } from "../../i18n";
import { SectionCard } from "./SectionCard";
import { accentTokens } from "./accents";

/**
 * "What's New" overlay rendered on top of the agents dashboard after an update.
 *
 * Why an overlay (not a separate webview panel): a `vscode.WebviewPanel` always
 * opens as an editor tab. Patch notes are a notification, not a workspace —
 * they belong *over* the dashboard, not next to it. So we render here as a
 * modal-style overlay (backdrop + centered card with internal scroll) inside
 * the dashboard webview.
 */
export function ChangelogOverlay({
  bundle,
  onClose,
}: {
  bundle: ChangelogBundle;
  onClose: () => void;
}) {
  const close = (markSeen: boolean) => {
    if (markSeen) post({ type: "changelog/markSeen", version: bundle.current });
    onClose();
  };

  // ESC dismisses and marks as seen (matches how every other modal in this app
  // closes — and the host treats "panel disposed" as "user has seen it").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bundle.entries.length) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8">
      {/* Backdrop — click closes (treats as seen, like ESC) */}
      <div
        className="ac-fade-in absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={() => close(true)}
      />

      {/* Card frame */}
      <div
        className="ac-scale-in relative flex max-h-[92vh] w-full max-w-[920px] flex-col overflow-hidden rounded-[22px] border"
        style={{
          background: "linear-gradient(180deg, #131313 0%, #0c0c0c 100%)",
          borderColor: "rgba(255, 255, 255, 0.08)",
          boxShadow:
            "0 30px 80px rgba(0, 0, 0, 0.65), 0 1px 0 rgba(255, 255, 255, 0.04) inset",
        }}
      >
        {/* Accent top hairline */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#70fff3]/60 to-transparent" />

        {/* Scrollable content — header + highlights + sections live inside */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {bundle.entries.map((entry, i) => (
            <Entry
              key={entry.version}
              entry={entry}
              primary={i === 0}
              onClose={() => close(true)}
            />
          ))}
        </div>

        {/* Sticky footer pinned to the bottom of the card */}
        <Footer current={bundle.current} onClose={close} />
      </div>
    </div>
  );
}

function Entry({
  entry,
  primary,
  onClose,
}: {
  entry: Changelog;
  primary: boolean;
  onClose: () => void;
}) {
  return (
    <section>
      <Header entry={entry} primary={primary} onClose={onClose} />

      {entry.highlights.length > 0 ? (
        <div className="px-7 pt-5 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
              style={{
                background: "rgba(112, 255, 243, 0.1)",
                color: "#70fff3",
                border: "1px solid rgba(112, 255, 243, 0.25)",
              }}
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

      <div className="px-7 pt-2 pb-6 space-y-4 ac-stagger">
        {entry.sections.map((s) => (
          <SectionCard key={s.id} section={s} />
        ))}
      </div>
    </section>
  );
}

function Header({
  entry,
  primary,
  onClose,
}: {
  entry: Changelog;
  primary: boolean;
  onClose: () => void;
}) {
  return (
    <div className="px-7 pt-6 pb-4 flex items-start justify-between gap-6 border-b border-white/[0.06]">
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
        <h1 className="text-[26px] font-semibold leading-tight">
          {primary
            ? t("What's new in Agent Code", "Novità in Agent Code")
            : t(`Previously, in v${entry.version}`, `In precedenza, nella v${entry.version}`)}
        </h1>
        {entry.tagline ? (
          <p className="font-dm text-[13.5px] text-white/55 mt-1.5 max-w-[640px]">
            {entry.tagline}
          </p>
        ) : null}
      </div>
      {primary ? (
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-white/60 text-lg leading-none transition hover:bg-white/10 shrink-0"
          style={{ background: "rgba(255, 255, 255, 0.05)" }}
          aria-label={t("Close", "Chiudi")}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function Footer({
  current,
  onClose,
}: {
  current: string;
  onClose: (markSeen: boolean) => void;
}) {
  const [disableArmed, setDisableArmed] = useState(false);
  const releaseUrl = `https://github.com/elyas-tirit/Agent-Code/releases/tag/v${current}`;

  return (
    <div
      className="border-t border-white/[0.08] px-7 py-4 flex items-center justify-between gap-4 flex-wrap"
      style={{ background: "rgba(14, 14, 14, 0.85)" }}
    >
      <button
        type="button"
        onClick={() => setDisableArmed((v) => !v)}
        className="flex items-center gap-2.5 font-dm text-[13px] text-white/[0.68] cursor-pointer"
      >
        <span
          className="w-8 h-[18px] rounded-full relative transition-colors"
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
          onClick={() => {
            if (disableArmed) post({ type: "changelog/disable" });
            // Always mark current as seen so we don't pop it again next launch.
            onClose(true);
          }}
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
