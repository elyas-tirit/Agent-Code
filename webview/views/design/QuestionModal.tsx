import { useEffect, useMemo, useState } from "react";
import type { QuestionAnswers, QuestionItem, QuestionRequest } from "@shared/protocol";
import { Icon } from "../../ui/Icon";

interface QuestionModalProps {
  request: QuestionRequest;
  onRespond: (answers: QuestionAnswers) => void;
  position?: "fixed" | "absolute";
}

interface QState {
  selected: string[];
  other: string;
}

function OptionCard({
  index,
  label,
  description,
  active,
  multi,
  onClick,
}: {
  index: number;
  label: string;
  description: string;
  active: boolean;
  multi: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative w-full overflow-hidden rounded-xl border px-3.5 py-3 text-left transition-all ${
        active
          ? "border-[#70fff3]/70 bg-[#70fff3]/[0.07] shadow-[0_0_22px_-8px_#70fff3]"
          : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold transition-colors ${
            active ? "bg-[#70fff3] text-black" : "bg-white/10 text-white/60 group-hover:text-white"
          }`}
        >
          {active ? <Icon name="check" size={13} /> : index}
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium text-white">{label}</div>
          {description && <div className="mt-0.5 text-[12px] leading-snug text-white/55">{description}</div>}
        </div>
        {multi && (
          <span
            className={`ml-auto mt-0.5 size-4 shrink-0 rounded border ${
              active ? "border-[#70fff3] bg-[#70fff3]/30" : "border-white/25"
            }`}
          />
        )}
      </div>
    </button>
  );
}

function QuestionBlock({
  q,
  state,
  onToggle,
  onOther,
}: {
  q: QuestionItem;
  state: QState;
  onToggle: (label: string) => void;
  onOther: (text: string) => void;
}) {
  const preview = useMemo(
    () => q.options.find((o) => state.selected.includes(o.label) && o.preview)?.preview,
    [q.options, state.selected],
  );
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-md bg-[#4067e8]/20 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[#9db4ff]">
          {q.header}
        </span>
        {q.multiSelect && <span className="text-[11px] text-white/40">selezione multipla</span>}
      </div>
      <p className="mb-3 text-[15px] font-medium leading-snug text-white">{q.question}</p>

      <div className="space-y-2">
        {q.options.map((o, i) => (
          <OptionCard
            key={o.label}
            index={i + 1}
            label={o.label}
            description={o.description}
            multi={q.multiSelect}
            active={state.selected.includes(o.label)}
            onClick={() => onToggle(o.label)}
          />
        ))}

        {preview && (
          <pre className="ac-fade-in mt-1 max-h-52 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/50 p-3 font-mono text-[11.5px] leading-relaxed text-white/70">
            {preview}
          </pre>
        )}

        {/* "Other" is provided automatically by the tool — surface it as free text. */}
        <div
          className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 transition-colors ${
            state.other.trim() ? "border-[#70fff3]/70 bg-[#70fff3]/[0.06]" : "border-white/10 bg-white/[0.02]"
          }`}
        >
          <Icon name="plus" size={15} className="shrink-0 text-white/45" />
          <input
            value={state.other}
            onChange={(e) => onOther(e.target.value)}
            placeholder="Altro… (scrivi la tua risposta)"
            className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-white/35"
          />
        </div>
      </div>
    </div>
  );
}

export function QuestionModal({ request, onRespond, position = "absolute" }: QuestionModalProps) {
  const [states, setStates] = useState<QState[]>(() => request.questions.map(() => ({ selected: [], other: "" })));

  const toggle = (qi: number, label: string) => {
    setStates((prev) =>
      prev.map((st, i) => {
        if (i !== qi) return st;
        const multi = request.questions[i].multiSelect;
        if (multi) {
          const selected = st.selected.includes(label)
            ? st.selected.filter((l) => l !== label)
            : [...st.selected, label];
          return { ...st, selected };
        }
        return { ...st, selected: st.selected.includes(label) ? [] : [label] };
      }),
    );
  };

  const setOther = (qi: number, text: string) =>
    setStates((prev) => prev.map((st, i) => (i === qi ? { ...st, other: text } : st)));

  const answerFor = (i: number): string =>
    [...states[i].selected, states[i].other.trim()].filter(Boolean).join(", ");

  const ready = request.questions.every((_, i) => answerFor(i).length > 0);

  const submit = () => {
    if (!ready) return;
    const answers: QuestionAnswers = {};
    request.questions.forEach((q, i) => (answers[q.question] = answerFor(i)));
    onRespond(answers);
  };

  // Keyboard: number keys toggle options of the first question, Enter submits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack keys while the user is typing in the "Altro" free-text field.
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (typing && !(e.key === "Enter" && (e.metaKey || e.ctrlKey))) return;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey || ready)) {
        e.preventDefault();
        submit();
        return;
      }
      const n = Number(e.key);
      const first = request.questions[0];
      if (first && n >= 1 && n <= first.options.length) {
        e.preventDefault();
        toggle(0, first.options[n - 1].label);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={`${position} inset-0 z-[60] flex items-center justify-center p-6`}>
      <div className="ac-fade-in absolute inset-0 bg-black/65 backdrop-blur-md" />
      <div
        className="ac-pop relative flex max-h-[90%] w-[560px] max-w-[94%] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141414]/95 shadow-[0_30px_90px_rgba(0,0,0,0.7)]"
        style={{ boxShadow: "0 30px 90px rgba(0,0,0,0.7), 0 0 40px -16px #70fff3" }}
      >
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#70fff3]/70 to-transparent" />
        <div className="flex items-center gap-2.5 px-5 pb-3 pt-4">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[#70fff3]/15 text-[#70fff3]">
            <Icon name="hand" size={16} />
          </span>
          <div className="text-[15px] font-medium text-white">Claude ha una domanda</div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-5">
          {request.questions.map((q, i) => (
            <QuestionBlock
              key={i}
              q={q}
              state={states[i]}
              onToggle={(label) => toggle(i, label)}
              onOther={(text) => setOther(i, text)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3.5">
          <span className="text-[11.5px] text-white/35">
            {request.questions[0]?.options.length
              ? "Usa 1–" + request.questions[0].options.length + " · Invio per confermare"
              : "Invio per confermare"}
          </span>
          <button
            onClick={submit}
            disabled={!ready}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13.5px] font-medium transition-all ${
              ready
                ? "bg-gradient-to-r from-[#4067e8] to-[#70fff3] text-black shadow-[0_0_20px_-4px_#70fff3]"
                : "cursor-not-allowed bg-white/10 text-white/40"
            }`}
          >
            Conferma <Icon name="arrow-up" size={15} className="rotate-90" />
          </button>
        </div>
      </div>
    </div>
  );
}
