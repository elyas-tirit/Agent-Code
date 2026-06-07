import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Attachment,
  ChatMessage,
  DesignMode,
  DesignState,
  PermissionRequest,
  PlanRequest,
  QuestionRequest,
  SelectedComponent,
} from "@shared/protocol";
import { onHostMessage, post } from "../../vscode";
import { SessionBadge } from "../dashboard/TopBar";
import { Icon } from "../../ui/Icon";
import { UsageModal } from "../../ui/UsageModal";
import { SettingsModal } from "../../ui/SettingsModal";
import { PreviewCanvas } from "./PreviewCanvas";
import { CodeView } from "./CodeView";
import { ChatPanel } from "./ChatPanel";
import { ApprovalModal } from "./ApprovalModal";
import { QuestionModal } from "./QuestionModal";
import { PlanModal } from "./PlanModal";

const MODES: DesignMode[] = ["preview", "design", "code"];
const MODE_LABEL: Record<DesignMode, string> = { preview: "Preview", design: "Design", code: "Code" };

const EMPTY: DesignState = {
  title: "Nuova conversazione",
  status: "ready",
  mode: "bypassPermissions",
  designMode: "design",
  previewUrl: "http://localhost:3000",
  usage: { percent: 0, resetsInLabel: "", known: false },
  messages: [],
  settings: { model: "", thinking: true, effort: "high" },
};

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function applyToLastAssistant(prev: ChatMessage[], mutate: (m: ChatMessage) => void): ChatMessage[] {
  const next = [...prev];
  let idx = next.length - 1;
  if (idx < 0 || next[idx].role !== "assistant" || next[idx].streaming === false) {
    next.push({ id: genId(), role: "assistant", text: "", reasoning: "", streaming: true, tools: [] });
    idx = next.length - 1;
  }
  const clone: ChatMessage = { ...next[idx], tools: next[idx].tools ? [...next[idx].tools!] : [] };
  mutate(clone);
  next[idx] = clone;
  return next;
}

function SegmentedControl({ mode, onChange }: { mode: DesignMode; onChange: (m: DesignMode) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-black/40 p-1 shadow-[0_5px_8px_rgba(0,0,0,0.12)]">
      {MODES.map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={`rounded-full px-5 py-1.5 text-[14px] font-medium transition-all ${
              active ? "text-white" : "font-light text-white/60 hover:text-white"
            }`}
            style={
              active
                ? { background: "linear-gradient(90deg,#70fff3 0%,#4067e8 100%)", boxShadow: "0 0 18px -4px #4cc4ff" }
                : undefined
            }
          >
            {MODE_LABEL[m]}
          </button>
        );
      })}
    </div>
  );
}

export function DesignWorkspace({ initial }: { initial?: DesignState }) {
  const [state, setState] = useState<DesignState>(initial ?? EMPTY);
  const [messages, setMessages] = useState<ChatMessage[]>(initial?.messages ?? []);
  const [pending, setPending] = useState<PermissionRequest | undefined>(initial?.pendingPermission);
  const [question, setQuestion] = useState<QuestionRequest | undefined>(initial?.pendingQuestion);
  const [plan, setPlan] = useState<PlanRequest | undefined>(initial?.pendingPlan);
  const [usageOpen, setUsageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [chatWidth, setChatWidth] = useState(420);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onHostMessage((msg) => {
      switch (msg.type) {
        case "init":
          if (msg.view === "design") {
            setState(msg.state);
            setMessages(msg.state.messages);
            setPending(msg.state.pendingPermission);
            setQuestion(msg.state.pendingQuestion);
            setPlan(msg.state.pendingPlan);
          }
          break;
        case "agent/status":
          setState((s) => ({ ...s, status: msg.status }));
          break;
        case "agent/title":
          setState((s) => ({ ...s, title: msg.title }));
          break;
        case "agent/mode":
          setState((s) => ({ ...s, mode: msg.mode }));
          break;
        case "agent/settings":
          setState((s) => ({ ...s, settings: msg.settings }));
          break;
        case "chat/cleared":
          setMessages([]);
          break;
        case "usage/update":
          setState((s) => ({ ...s, usage: msg.usage }));
          break;
        case "preview/proxy":
          // Host re-pointed the preview proxy (URL changed) — reload the iframe.
          setState((s) => ({ ...s, proxyUrl: msg.proxyUrl, previewUrl: msg.previewUrl }));
          setReloadKey((k) => k + 1);
          break;
        case "chat/append":
          setMessages((prev) =>
            applyToLastAssistant(prev, (m) => {
              if (msg.channel === "reasoning") m.reasoning = (m.reasoning ?? "") + msg.delta;
              else m.text += msg.delta;
            }),
          );
          break;
        case "chat/tool":
          setMessages((prev) =>
            applyToLastAssistant(prev, (m) => {
              const tools = m.tools ?? [];
              m.tools = tools.some((t) => t.id === msg.tool.id)
                ? tools.map((t) => (t.id === msg.tool.id ? { ...t, ...msg.tool } : t))
                : [...tools, msg.tool];
            }),
          );
          break;
        case "chat/done":
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") next[next.length - 1] = { ...last, streaming: false };
            return next;
          });
          break;
        case "permission/request":
          setPending(msg.request);
          break;
        case "permission/dismiss":
          setPending((p) => (p && p.id === msg.id ? undefined : p));
          break;
        case "question/request":
          setQuestion(msg.request);
          break;
        case "question/dismiss":
          setQuestion((q) => (q && q.id === msg.id ? undefined : q));
          break;
        case "plan/request":
          setPlan(msg.request);
          break;
        case "plan/dismiss":
          setPlan((p) => (p && p.id === msg.id ? undefined : p));
          break;
        default:
          break;
      }
    });
  }, []);

  const setSelected = (selected?: SelectedComponent) => setState((s) => ({ ...s, selected }));

  const send = (text: string, attachments: Attachment[]) => {
    setMessages((prev) => [
      ...prev,
      { id: genId(), role: "user", text, attachments },
      { id: genId(), role: "assistant", text: "", reasoning: "", streaming: true, tools: [] },
    ]);
    post({ type: "chat/send", text, component: state.selected, attachments });
    setSelected(undefined);
  };

  // --- draggable splitter -----------------------------------------------------
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const rect = bodyRef.current?.getBoundingClientRect();
      if (!rect) return;
      const w = rect.right - ev.clientX;
      setChatWidth(Math.max(320, Math.min(760, w)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const isPreviewFull = state.designMode === "preview";
  const left =
    state.designMode === "code" ? (
      <CodeView />
    ) : (
      <PreviewCanvas
        mode={state.designMode}
        url={state.previewUrl}
        proxyUrl={state.proxyUrl}
        reloadKey={reloadKey}
        onSetUrl={(url) => {
          setState((s) => ({ ...s, previewUrl: url }));
          post({ type: "design/setUrl", url });
        }}
        onSelect={(component) => {
          setSelected(component);
          post({ type: "design/selectComponent", component });
        }}
      />
    );

  return (
    <div className="relative flex h-full flex-col px-6 py-4">
      {/* Top bar */}
      <div className="relative flex items-center justify-between">
        <button
          onClick={() => post({ type: "nav/back" })}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[14px] text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Icon name="arrow-left" size={16} /> Agenti
        </button>
        <div className="absolute left-1/2 -translate-x-1/2">
          <SegmentedControl
            mode={state.designMode}
            onChange={(m) => {
              setState((s) => ({ ...s, designMode: m }));
              post({ type: "design/mode", mode: m });
            }}
          />
        </div>
        <button onClick={() => setUsageOpen(true)} title="Vedi l'uso della sessione">
          <SessionBadge usage={state.usage} />
        </button>
      </div>

      {/* Conversation title */}
      <div className="mt-3 truncate text-[15px] font-medium text-white/90">{state.title}</div>

      {/* Body */}
      <div ref={bodyRef} className="relative mt-3 flex min-h-0 flex-1 gap-0">
        <div className="flex min-w-0 flex-1">{left}</div>

        {!isPreviewFull && (
          <>
            {/* Splitter */}
            <div
              onMouseDown={startDrag}
              className="group relative mx-1 flex w-2 cursor-col-resize items-center justify-center"
              title="Trascina per ridimensionare"
            >
              <div className="h-14 w-[3px] rounded-full bg-white/10 transition-colors group-hover:bg-[#70fff3]/70" />
            </div>

            <div className="flex shrink-0 flex-col" style={{ width: chatWidth }}>
              <ChatPanel
                messages={messages}
                status={state.status}
                mode={state.mode}
                settings={state.settings}
                selected={state.selected}
                onSend={send}
                onInterrupt={() => post({ type: "agent/interrupt" })}
                onModeChange={(mode) => {
                  setState((s) => ({ ...s, mode }));
                  post({ type: "mode/set", mode });
                }}
                onClearSelected={() => setSelected(undefined)}
                onOpenUsage={() => setUsageOpen(true)}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </div>
          </>
        )}

        {pending && (
          <ApprovalModal
            request={pending}
            onRespond={(decision) => {
              post({ type: "permission/respond", id: pending.id, decision });
              setPending(undefined);
            }}
          />
        )}
        {question && (
          <QuestionModal
            request={question}
            onRespond={(answers) => {
              post({ type: "question/respond", id: question.id, answers });
              setQuestion(undefined);
            }}
          />
        )}
        {plan && (
          <PlanModal
            request={plan}
            onRespond={(approve) => {
              post({ type: "plan/respond", id: plan.id, approve });
              setPlan(undefined);
            }}
          />
        )}
        {usageOpen && (
          <UsageModal
            usage={state.usage}
            title="Uso della sessione"
            scope="Token e limiti consumati da questa conversazione, sul tuo abbonamento Claude."
            position="absolute"
            onClose={() => setUsageOpen(false)}
          />
        )}
        {settingsOpen && <SettingsModal position="absolute" onClose={() => setSettingsOpen(false)} />}
      </div>
    </div>
  );
}
