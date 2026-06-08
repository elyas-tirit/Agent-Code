import { useEffect, useRef, useState } from "react";
import type { AgentSettings, AgentStatus, Attachment, PermissionMode } from "@shared/protocol";
import { EFFORT_OPTIONS, MODEL_OPTIONS } from "@shared/protocol";
import { Icon, IconName, FigmaGlyph } from "../../ui/Icon";
import { FigmaModal } from "../../ui/FigmaModal";
import { onHostMessage, post } from "../../vscode";

const CYAN = "rgb(112,255,243)";

const MODE_META: Record<PermissionMode, { label: string; icon: IconName; color: string }> = {
  default: { label: "Ask", icon: "hand", color: "rgb(255,200,112)" },
  plan: { label: "Plan", icon: "list-checks", color: "rgb(112,255,139)" },
  acceptEdits: { label: "Edit Auto", icon: "play-circle", color: "rgb(222,112,255)" },
  bypassPermissions: { label: "Auto", icon: "zap", color: "rgb(64,103,232)" },
};
const CYCLE: PermissionMode[] = ["default", "plan", "acceptEdits", "bypassPermissions"];
const MODE_HINT: Record<PermissionMode, string> = {
  default: "Ask — chiede conferma per ogni azione",
  plan: "Plan — pianifica senza modificare nulla",
  acceptEdits: "Edit Auto — accetta le modifiche ai file",
  bypassPermissions: "Auto — nessuna conferma (full auto)",
};
const gradientFor = (m: PermissionMode) => `linear-gradient(90deg, ${MODE_META[m].color} 0%, ${CYAN} 100%)`;

interface ComposerProps {
  status: AgentStatus;
  mode: PermissionMode;
  settings: AgentSettings;
  onSend: (text: string, attachments: Attachment[]) => void;
  onInterrupt: () => void;
  onModeChange: (mode: PermissionMode) => void;
  onOpenUsage: () => void;
  onOpenSettings: () => void;
  onPreviewAttachment?: (a: Attachment) => void;
}

function MenuItem({
  icon,
  glyph,
  label,
  onClick,
  right,
}: {
  icon?: IconName;
  glyph?: React.ReactNode;
  label: string;
  onClick: () => void;
  right?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-white/85 transition-colors hover:bg-white/10"
    >
      {glyph ?? (icon && <Icon name={icon} size={15} className="text-white/55" />)}
      <span className="flex-1">{label}</span>
      {right}
    </button>
  );
}

function Popover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="ac-pop absolute bottom-[44px] left-0 z-50 w-[270px] rounded-xl border border-white/10 bg-[#1b1b1b] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
        {children}
      </div>
    </>
  );
}

function AttachmentChip({ att, onRemove, onPreview }: { att: Attachment; onRemove: () => void; onPreview?: () => void }) {
  return (
    <div
      onClick={onPreview}
      title={onPreview ? "Anteprima" : undefined}
      className={`ac-pop group relative flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] py-1.5 pl-1.5 pr-2 text-[12px] text-white/80 ${onPreview ? "cursor-pointer hover:border-white/25" : ""}`}
    >
      {att.kind === "image" && att.dataUrl ? (
        <img src={att.dataUrl} alt={att.name} className="size-8 rounded-md object-cover" />
      ) : att.kind === "figma" ? (
        <span className="flex size-8 items-center justify-center rounded-md bg-black/40">
          <FigmaGlyph size={15} />
        </span>
      ) : (
        <span className="flex size-8 items-center justify-center rounded-md bg-black/40 text-white/60">
          <Icon name={att.kind === "image" ? "image" : "file"} size={15} />
        </span>
      )}
      <span className="max-w-[120px] truncate">{att.name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="flex size-4 items-center justify-center rounded text-white/40 hover:bg-white/10 hover:text-white"
      >
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}

export function Composer({
  status,
  mode,
  settings,
  onSend,
  onInterrupt,
  onModeChange,
  onOpenUsage,
  onOpenSettings,
  onPreviewAttachment,
}: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [figmaOpen, setFigmaOpen] = useState(false);
  const [menu, setMenu] = useState<null | "context" | "settings">(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const meta = MODE_META[mode];
  const grad = gradientFor(mode);
  const working = status === "working" || status === "asking";
  // The composer "stroke" is light + only present while you type or while Claude
  // is working; it fades away when idle.
  const active = focused || working;
  const hasText = draft.trim().length > 0;
  const canSend = hasText || attachments.length > 0;
  const sendActive = working || canSend;

  // Host pushes text (mention) and attachments (image/file/figma) into the composer.
  useEffect(
    () =>
      onHostMessage((m) => {
        if (m.type === "composer/insert") {
          setDraft((d) => (d ? d + (d.endsWith(" ") ? "" : " ") : "") + m.text);
          taRef.current?.focus();
        } else if (m.type === "composer/attach") {
          setAttachments((a) => [...a, m.attachment]);
        } else if (m.type === "code/tree") {
          const out: string[] = [];
          const walk = (ns: { path: string; type: string; children?: any[] }[]) => {
            for (const n of ns) {
              if (n.type === "file") out.push(n.path);
              else if (n.children) walk(n.children);
            }
          };
          walk(m.nodes as any);
          setFiles(out);
        }
      }),
    [],
  );

  // Fetch the workspace file list once (for @-mention autocomplete).
  useEffect(() => post({ type: "code/tree" }), []);

  const mentionMatches = mention
    ? files.filter((f) => f.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 7)
    : [];

  const onDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setDraft(v);
    const caret = e.target.selectionStart ?? v.length;
    const m = /(^|\s)@([\w./\-]*)$/.exec(v.slice(0, caret));
    setMention(m ? { query: m[2], start: caret - m[2].length } : null);
  };

  const pickMention = (path: string) => {
    if (!mention) return;
    setDraft((d) => `${d.slice(0, mention.start - 1)}@${path} ${d.slice(mention.start + mention.query.length)}`);
    setMention(null);
    taRef.current?.focus();
  };

  const handleImageFiles = (list: FileList | File[]) => {
    Array.from(list)
      .filter((f) => f.type.startsWith("image/"))
      .forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => post({ type: "image/save", dataUrl: String(reader.result), name: file.name || "immagine.png" });
        reader.readAsDataURL(file);
      });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleImageFiles(e.dataTransfer.files);
  };

  const send = () => {
    if (!canSend) return;
    onSend(draft.trim(), attachments);
    setDraft("");
    setAttachments([]);
  };
  const onSendClick = () => (working ? onInterrupt() : send());
  const cycleMode = () => onModeChange(CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length]);

  // Paste an image from the clipboard → persist it host-side, get back a chip.
  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = () => post({ type: "image/save", dataUrl: String(reader.result), name: file.name || "incolla.png" });
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="relative rounded-[12px] p-px pt-[2px]"
      style={{
        background: active ? grad : "rgba(255,255,255,0.10)",
        boxShadow: active ? `0 0 16px -9px ${meta.color}` : "none",
        transition: "background .35s ease, box-shadow .35s ease",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* @-mention autocomplete */}
      {mention && mentionMatches.length > 0 && (
        <div className="ac-pop absolute bottom-[calc(100%+6px)] left-0 z-50 max-h-60 w-[340px] overflow-auto rounded-xl border border-white/10 bg-[#1b1b1b] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
          <div className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-white/35">Menziona file</div>
          {mentionMatches.map((f) => (
            <button
              key={f}
              onMouseDown={(e) => {
                e.preventDefault();
                pickMention(f);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-white/85 hover:bg-white/10"
            >
              <Icon name="file" size={13} className="shrink-0 text-white/45" />
              <span className="truncate">{f}</span>
            </button>
          ))}
        </div>
      )}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-[12px] border-2 border-dashed border-[#70fff3] bg-[#70fff3]/10 text-[13px] font-medium text-[#70fff3]">
          Rilascia l'immagine qui
        </div>
      )}
      <div className="font-dm rounded-[11px] bg-black px-3 pb-2.5 pt-2.5">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                att={a}
                onPreview={onPreviewAttachment ? () => onPreviewAttachment(a) : undefined}
                onRemove={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
              />
            ))}
          </div>
        )}

        <textarea
          ref={taRef}
          value={draft}
          onChange={onDraftChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Escape" && mention) {
              setMention(null);
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (mention && mentionMatches.length) pickMention(mentionMatches[0]);
              else send();
            }
          }}
          rows={2}
          placeholder="Chiedimi qualsiasi cosa…  (incolla un'immagine, allega un file)"
          className="font-dm max-h-40 min-h-[40px] w-full resize-none bg-transparent text-[14px] text-white outline-none placeholder:text-[#898989]"
        />

        <div className="relative mt-1 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {/* + context menu */}
            <button
              title="Aggiungi contesto"
              onClick={() => setMenu(menu === "context" ? null : "context")}
              className="flex size-[35px] items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Icon name="plus" size={18} />
            </button>
            {menu === "context" && (
              <Popover onClose={() => setMenu(null)}>
                <div className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-white/35">Contesto</div>
                <MenuItem icon="image" label="Allega immagine…" onClick={() => { post({ type: "context/attachImage" }); setMenu(null); }} />
                <MenuItem icon="paperclip" label="Allega file…" onClick={() => { post({ type: "context/attach" }); setMenu(null); }} />
                <MenuItem glyph={<FigmaGlyph size={15} />} label="Allega file Figma…" onClick={() => { setFigmaOpen(true); setMenu(null); }} />
                <MenuItem icon="folder" label="Menziona file dal progetto…" onClick={() => { post({ type: "context/mention" }); setMenu(null); }} />
                <div className="my-1 h-px bg-white/10" />
                <MenuItem icon="trash" label="Pulisci conversazione" onClick={() => { post({ type: "chat/clear" }); setMenu(null); }} />
              </Popover>
            )}

            {/* sparkles → settings menu */}
            <button
              title="Impostazioni rapide"
              onClick={() => setMenu(menu === "settings" ? null : "settings")}
              className="flex size-[35px] items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Icon name="sparkles" size={18} />
            </button>
            {menu === "settings" && (
              <Popover onClose={() => setMenu(null)}>
                <div className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-white/35">Modello</div>
                {MODEL_OPTIONS.map((o) => (
                  <MenuItem
                    key={o.id}
                    label={o.label}
                    onClick={() => { post({ type: "settings/model", model: o.id }); setMenu(null); }}
                    right={settings.model === o.id ? <Icon name="check" size={14} className="text-[#4067e8]" /> : undefined}
                  />
                ))}
                <div className="my-1 h-px bg-white/10" />
                <MenuItem
                  icon="sparkles"
                  label="Thinking"
                  onClick={() => post({ type: "settings/thinking", enabled: !settings.thinking })}
                  right={
                    <span className={`h-4 w-7 rounded-full p-0.5 transition-colors ${settings.thinking ? "bg-[#4067e8]" : "bg-white/15"}`}>
                      <span className={`block size-3 rounded-full bg-white transition-transform ${settings.thinking ? "translate-x-3" : ""}`} />
                    </span>
                  }
                />
                <div className="px-2.5 py-1.5">
                  <div className="mb-1.5 text-[12px] text-white/60">Effort</div>
                  <div className="flex gap-1">
                    {EFFORT_OPTIONS.map((e) => (
                      <button
                        key={e}
                        onClick={() => post({ type: "settings/effort", effort: e })}
                        className={`flex-1 rounded px-1 py-1 text-[10px] capitalize transition-colors ${settings.effort === e ? "bg-[#4067e8] text-white" : "bg-white/5 text-white/55 hover:text-white"}`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="my-1 h-px bg-white/10" />
                <MenuItem icon="gauge" label="Account & usage" onClick={() => { onOpenUsage(); setMenu(null); }} />
                <MenuItem icon="sliders" label="Tutte le impostazioni…" onClick={() => { onOpenSettings(); setMenu(null); }} />
              </Popover>
            )}

            {/* mode pill */}
            <button
              onClick={cycleMode}
              title={MODE_HINT[mode]}
              className="flex h-[35px] items-center gap-1.5 rounded-full px-2 transition-transform hover:scale-[1.03]"
            >
              <Icon name={meta.icon} size={17} className="shrink-0" style={{ color: meta.color }} />
              <span
                className="font-dm text-[12px] font-medium"
                style={{ backgroundImage: grad, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
              >
                {meta.label}
              </span>
            </button>
          </div>

          <button
            onClick={onSendClick}
            disabled={!sendActive}
            title={working ? "Ferma (stop)" : "Invia"}
            className={`flex size-[35px] items-center justify-center rounded-lg text-white transition-all ${sendActive ? "" : "bg-white/15 text-white/60"}`}
            style={sendActive ? { background: grad, boxShadow: `0 0 18px -2px ${meta.color}` } : undefined}
          >
            <Icon name={working ? "square" : "arrow-up"} size={17} />
          </button>
        </div>
      </div>

      {figmaOpen && (
        <FigmaModal
          onSubmit={(url) => post({ type: "context/attachFigmaUrl", url })}
          onClose={() => setFigmaOpen(false)}
        />
      )}
    </div>
  );
}
