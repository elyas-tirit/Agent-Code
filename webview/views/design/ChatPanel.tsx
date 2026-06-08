import { useEffect, useRef, useState } from "react";
import type {
  AgentSettings,
  AgentStatus,
  Attachment,
  ChatMessage,
  PermissionMode,
  SelectedComponent,
  ToolCall,
  ToolDiff,
} from "@shared/protocol";
import { Icon, FigmaGlyph, IconName } from "../../ui/Icon";
import { Md } from "../../ui/Markdown";
import { Composer } from "./Composer";
import { t } from "../../i18n";

/** Copy an attachment: the image itself to the clipboard, or the file path / Figma URL. */
async function copyAttachment(a: Attachment): Promise<void> {
  try {
    if (a.kind === "image" && a.dataUrl) {
      const blob = await (await fetch(a.dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    } else {
      await navigator.clipboard.writeText(a.url || a.path || a.name);
    }
  } catch {
    /* clipboard blocked in this context */
  }
}

/** Re-attach a sent attachment back into the composer. The Composer listens for
 *  `composer/attach` host messages, so we replay one locally (no host round-trip). */
function reattach(a: Attachment): void {
  window.dispatchEvent(new MessageEvent("message", { data: { type: "composer/attach", attachment: a } }));
}

interface ChatPanelProps {
  messages: ChatMessage[];
  status: AgentStatus;
  mode: PermissionMode;
  settings: AgentSettings;
  selected?: SelectedComponent;
  onSend: (text: string, attachments: Attachment[]) => void;
  onInterrupt: () => void;
  onModeChange: (mode: PermissionMode) => void;
  onClearSelected: () => void;
  onOpenUsage: () => void;
  onOpenSettings: () => void;
}

function DiffView({ diff }: { diff: ToolDiff }) {
  const before = diff.before ? diff.before.split("\n") : [];
  const after = diff.after ? diff.after.split("\n") : [];
  return (
    <div className="ac-pop mt-1 overflow-hidden rounded-md border border-white/10 font-mono text-[11px] leading-[1.6]">
      <div className="bg-white/[0.04] px-2 py-1 text-white/50">{diff.file}</div>
      <div className="max-h-64 overflow-auto py-1">
        {before.map((l, i) => (
          <div key={`b${i}`} className="whitespace-pre-wrap bg-red-500/[0.08] px-2 text-red-300/80">
            <span className="select-none text-red-400/50">- </span>
            {l}
          </div>
        ))}
        {after.map((l, i) => (
          <div key={`a${i}`} className="whitespace-pre-wrap bg-emerald-500/[0.08] px-2 text-emerald-300/85">
            <span className="select-none text-emerald-400/50">+ </span>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolRow({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const hasDiff = Boolean(tool.diff && (tool.diff.before || tool.diff.after));
  return (
    <div className="ac-fade-in">
      <div
        onClick={hasDiff ? () => setOpen((o) => !o) : undefined}
        className={`flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.03] px-2.5 py-1.5 text-[12px] ${
          hasDiff ? "cursor-pointer hover:bg-white/[0.06]" : ""
        }`}
      >
        <Icon name="tool" size={13} className="text-white/40" />
        <span className="font-medium text-white/70">{tool.name}</span>
        <span className="min-w-0 flex-1 truncate text-white/40">{tool.summary}</span>
        {hasDiff && (
          <Icon name="chevron-down" size={13} className={`shrink-0 text-white/35 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
        {tool.state === "running" && (
          <span className="size-3 shrink-0 animate-spin rounded-full border border-white/30 border-t-transparent" />
        )}
        {tool.state === "done" && <Icon name="check" size={13} className="shrink-0 text-emerald-400/80" />}
        {tool.state === "denied" && <Icon name="x" size={13} className="shrink-0 text-red-400/80" />}
      </div>
      {hasDiff && open && tool.diff && <DiffView diff={tool.diff} />}
    </div>
  );
}

function AttachActions({ a, onPreview }: { a: Attachment; onPreview: (a: Attachment) => void }) {
  const Btn = ({ icon, title, onClick }: { icon: IconName; title: string; onClick: () => void }) => (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex size-6 items-center justify-center rounded-md bg-black/55 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
    >
      <Icon name={icon} size={13} />
    </button>
  );
  return (
    <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <Btn icon="eye" title={t("Preview", "Anteprima")} onClick={() => onPreview(a)} />
      <Btn icon="paperclip" title={t("Re-attach to chat", "Riallega alla chat")} onClick={() => reattach(a)} />
      <Btn icon="copy" title={t("Copy", "Copia")} onClick={() => void copyAttachment(a)} />
    </div>
  );
}

function MessageAttachments({
  attachments,
  onPreview,
}: {
  attachments: Attachment[];
  onPreview: (a: Attachment) => void;
}) {
  return (
    <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
      {attachments.map((a) =>
        a.kind === "image" && a.dataUrl ? (
          <div key={a.id} className="group relative cursor-pointer" onClick={() => onPreview(a)}>
            <img src={a.dataUrl} alt={a.name} className="size-16 rounded-lg object-cover ring-1 ring-white/15" />
            <AttachActions a={a} onPreview={onPreview} />
          </div>
        ) : (
          <div
            key={a.id}
            onClick={() => onPreview(a)}
            className="group relative flex cursor-pointer items-center gap-1.5 rounded-lg bg-black/30 py-1 pl-2 pr-[68px] text-[11px] text-white/70 ring-1 ring-white/10 hover:ring-white/20"
          >
            {a.kind === "figma" ? <FigmaGlyph size={13} /> : <Icon name="file" size={12} />}
            <span className="max-w-[160px] truncate">{a.name}</span>
            <AttachActions a={a} onPreview={onPreview} />
          </div>
        ),
      )}
    </div>
  );
}

/** Full-bleed preview for an attachment (image lightbox / file + figma details). */
function AttachmentLightbox({ att, onClose }: { att: Attachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center p-8" onClick={onClose}>
      <div className="ac-fade-in absolute inset-0 bg-black/80 backdrop-blur-md" />
      <div
        className="ac-pop relative flex max-h-full max-w-full flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {att.kind === "image" && att.dataUrl ? (
          <img src={att.dataUrl} alt={att.name} className="max-h-[78vh] max-w-full rounded-xl shadow-2xl ring-1 ring-white/15" />
        ) : (
          <div className="flex w-[360px] max-w-full flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[#161616] p-7 text-center">
            <span className="flex size-14 items-center justify-center rounded-xl bg-black/40">
              {att.kind === "figma" ? <FigmaGlyph size={26} /> : <Icon name="file" size={24} className="text-white/60" />}
            </span>
            <div className="text-[14px] font-medium text-white">{att.name}</div>
            {(att.url || att.path) && (
              <div className="max-w-full break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-[11.5px] text-white/55">
                {att.url || att.path}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => reattach(att)}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] text-white/85 hover:bg-white/15"
          >
            <Icon name="paperclip" size={14} /> {t("Re-attach", "Riallega")}
          </button>
          <button
            onClick={() => void copyAttachment(att)}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] text-white/85 hover:bg-white/15"
          >
            <Icon name="copy" size={14} /> {t("Copy", "Copia")}
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] text-white/85 hover:bg-white/15"
          >
            <Icon name="x" size={14} /> {t("Close", "Chiudi")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="ac-think inline-flex gap-1 align-middle">
      <span />
      <span />
      <span />
    </span>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="ac-slide-up space-y-2">
      {message.reasoning && (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
            <Icon name="sparkles" size={12} className="text-[#70fff3]/70" />
            {t("Reasoning", "Ragionamento")}
            {message.streaming && <ThinkingDots />}
          </div>
          <Md text={message.reasoning} className="ac-md-dim text-[12px] text-white/45" />
        </div>
      )}
      {message.tools?.map((t) => <ToolRow key={t.id} tool={t} />)}
      {message.text && (
        <div className="text-[13px] leading-relaxed text-white/85">
          <Md text={message.text} />
          {message.streaming && <span className="ac-caret" />}
        </div>
      )}
    </div>
  );
}

export function ChatPanel({
  messages,
  status,
  mode,
  settings,
  selected,
  onSend,
  onInterrupt,
  onModeChange,
  onClearSelected,
  onOpenUsage,
  onOpenSettings,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<Attachment | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-4 pr-1">
        {messages.length === 0 && (
          <p className="mt-10 text-center text-[13px] text-white/35">
            {t(
              "Ask the agent to modify the design or select a component.",
              "Chiedi all'agente di modificare il design o seleziona un componente.",
            )}
          </p>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ac-slide-up flex flex-col items-end">
              {m.attachments && m.attachments.length > 0 && (
                <MessageAttachments attachments={m.attachments} onPreview={setPreview} />
              )}
              {m.text && (
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[#4067e8] px-3 py-2 text-[13px] text-white shadow-[0_4px_14px_-4px_rgba(64,103,232,0.6)]">
                  <Md text={m.text} />
                </div>
              )}
            </div>
          ) : (
            <AssistantMessage key={m.id} message={m} />
          ),
        )}

        {status === "working" && (
          <div className="ac-fade-in flex items-center gap-2 text-[12px] text-white/55">
            <ThinkingDots />
            <span className="ac-text-shimmer font-medium">{t("Claude is working…", "Claude sta lavorando…")}</span>
          </div>
        )}
        {status === "asking" && (
          <div className="ac-fade-in flex items-center gap-2 text-[12px] text-[#70fff3]">
            <span className="ac-pulse-ring flex size-5 items-center justify-center rounded-full bg-[#70fff3]/15">
              <Icon name="hand" size={12} />
            </span>
            {t("Claude is asking you a question…", "Claude ti sta facendo una domanda…")}
          </div>
        )}
        {status === "awaiting-approval" && (
          <div className="ac-fade-in flex items-center gap-2 text-[12px] text-[#dacd3c]">
            <span className="ac-pulse-ring flex size-5 items-center justify-center rounded-full bg-[#dacd3c]/15">
              <Icon name="hand" size={12} />
            </span>
            {t("Awaiting your approval…", "In attesa della tua approvazione…")}
          </div>
        )}
      </div>

      <div className="pt-2">
        {selected &&
          (() => {
            const isCode = selected.kind === "code";
            const accent = isCode ? "#3fb950" : "#70fff3";
            return (
              <div
                className="ac-pop mb-2 flex items-center justify-between rounded-lg border px-3 py-1.5 text-[12px] text-white/85"
                style={{ borderColor: `${accent}66`, background: `${accent}14` }}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Icon name={isCode ? "file-code" : "cursor"} size={13} style={{ color: accent }} />
                  <span className="truncate font-mono text-[11.5px]">{selected.label}</span>
                  {selected.device && <span className="text-white/40">· {selected.device}</span>}
                </span>
                <button onClick={onClearSelected} className="text-white/50 hover:text-white">
                  <Icon name="x" size={13} />
                </button>
              </div>
            );
          })()}
        <Composer
          status={status}
          mode={mode}
          settings={settings}
          onSend={onSend}
          onInterrupt={onInterrupt}
          onModeChange={onModeChange}
          onOpenUsage={onOpenUsage}
          onOpenSettings={onOpenSettings}
          onPreviewAttachment={setPreview}
        />
      </div>

      {preview && <AttachmentLightbox att={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
