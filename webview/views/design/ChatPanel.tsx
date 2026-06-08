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
import { Icon, FigmaGlyph } from "../../ui/Icon";
import { Md } from "../../ui/Markdown";
import { Composer } from "./Composer";

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

function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
      {attachments.map((a) =>
        a.kind === "image" && a.dataUrl ? (
          <img key={a.id} src={a.dataUrl} alt={a.name} className="size-16 rounded-lg object-cover ring-1 ring-white/15" />
        ) : (
          <span
            key={a.id}
            className="flex items-center gap-1.5 rounded-lg bg-black/30 px-2 py-1 text-[11px] text-white/70 ring-1 ring-white/10"
          >
            {a.kind === "figma" ? <FigmaGlyph size={13} /> : <Icon name="file" size={12} />}
            {a.name}
          </span>
        ),
      )}
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
  const empty = !message.text && !message.reasoning && (!message.tools || message.tools.length === 0);
  return (
    <div className="ac-slide-up space-y-2">
      {message.reasoning && (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
            <Icon name="sparkles" size={12} className="text-[#70fff3]/70" />
            Ragionamento
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
      {/* Just started — nothing to show yet: a gentle thinking shimmer. */}
      {empty && message.streaming && (
        <div className="flex items-center gap-2 text-[12.5px] text-white/45">
          <ThinkingDots /> <span className="ac-text-shimmer font-medium">Sto pensando…</span>
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-4 pr-1">
        {messages.length === 0 && (
          <p className="mt-10 text-center text-[13px] text-white/35">
            Chiedi all'agente di modificare il design o seleziona un componente.
          </p>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ac-slide-up flex flex-col items-end">
              {m.attachments && m.attachments.length > 0 && <MessageAttachments attachments={m.attachments} />}
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
            <span className="ac-text-shimmer font-medium">Claude sta lavorando…</span>
          </div>
        )}
        {status === "asking" && (
          <div className="ac-fade-in flex items-center gap-2 text-[12px] text-[#70fff3]">
            <span className="ac-pulse-ring flex size-5 items-center justify-center rounded-full bg-[#70fff3]/15">
              <Icon name="hand" size={12} />
            </span>
            Claude ti sta facendo una domanda…
          </div>
        )}
        {status === "awaiting-approval" && (
          <div className="ac-fade-in flex items-center gap-2 text-[12px] text-[#dacd3c]">
            <span className="ac-pulse-ring flex size-5 items-center justify-center rounded-full bg-[#dacd3c]/15">
              <Icon name="hand" size={12} />
            </span>
            In attesa della tua approvazione…
          </div>
        )}
      </div>

      <div className="pt-2">
        {selected && (
          <div className="ac-pop mb-2 flex items-center justify-between rounded-lg border border-[#70fff3]/40 bg-[#70fff3]/[0.08] px-3 py-1.5 text-[12px] text-white/85">
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon name="cursor" size={13} className="text-[#70fff3]" />
              <span className="truncate">{selected.label}</span>
              {selected.device && <span className="text-white/40">· {selected.device}</span>}
            </span>
            <button onClick={onClearSelected} className="text-white/50 hover:text-white">
              <Icon name="x" size={13} />
            </button>
          </div>
        )}
        <Composer
          status={status}
          mode={mode}
          settings={settings}
          onSend={onSend}
          onInterrupt={onInterrupt}
          onModeChange={onModeChange}
          onOpenUsage={onOpenUsage}
          onOpenSettings={onOpenSettings}
        />
      </div>
    </div>
  );
}
