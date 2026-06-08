import { useState } from "react";
import type { SelectedComponent } from "@shared/protocol";
import { Icon } from "../../ui/Icon";
import { FloatingPanel } from "../../ui/FloatingPanel";

/**
 * Focused AI panel for a picked component (Cursor/Lovable-style). Lets you describe
 * a change in natural language ("Prompt") or tweak the element's Tailwind classes
 * directly ("Edit"); on Apply it sends a targeted prompt to the agent with the
 * component's name + source + classes as reference.
 */
export function ComponentPromptModal({
  component,
  onApply,
  onClose,
}: {
  component: SelectedComponent;
  onApply: (prompt: string) => void;
  onClose: () => void;
}) {
  const title = component.component ? `<${component.component}>` : component.tag ? `<${component.tag}>` : "Componente";
  const [tab, setTab] = useState<"edit" | "prompt">("prompt");
  const [prompt, setPrompt] = useState("");
  const [classes, setClasses] = useState(component.cls ?? "");
  const [builder, setBuilder] = useState(false);

  const ready = tab === "prompt" ? prompt.trim().length > 0 : classes.trim().length > 0;

  const apply = () => {
    if (!ready) return;
    const ref = component.source || (component.file ? `${component.file}${component.line ? `:${component.line}` : ""}` : "");
    let text: string;
    if (tab === "edit") {
      text = `Aggiorna le classi Tailwind di ${title}${ref ? ` (${ref})` : ""} con: ${classes.trim()}`;
    } else {
      text = `${builder ? "[Builder] " : ""}${prompt.trim()}`;
    }
    onApply(text);
  };

  return (
    <FloatingPanel title={title} icon="cursor" accent="#70fff3" width={460} onClose={onClose}>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {/* Edit / Prompt toggle */}
        <div className="flex items-center gap-1 self-start rounded-full bg-black/40 p-1">
          {(["edit", "prompt"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3.5 py-1 text-[12.5px] font-medium capitalize transition-all ${
                tab === t ? "text-black" : "text-white/55 hover:text-white"
              }`}
              style={tab === t ? { background: "linear-gradient(90deg,#70fff3,#4067e8)" } : undefined}
            >
              {t === "edit" ? "Edit" : "Prompt"}
            </button>
          ))}
        </div>

        {tab === "prompt" ? (
          <>
            <div className="text-[12.5px] text-white/55">Descrivi cosa vuoi cambiare</div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
              <textarea
                autoFocus
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && apply()}
                rows={4}
                placeholder="es. rendi il bottone più grande e spostalo a destra, con sfondo verde…"
                className="w-full resize-none bg-transparent text-[13px] text-white outline-none placeholder:text-white/30"
              />
              <div className="mt-1 flex items-center gap-1.5">
                <button
                  onClick={() => setBuilder((b) => !b)}
                  title="Modalità builder: ricostruisci il componente da zero"
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors ${
                    builder ? "bg-[#70fff3]/15 text-[#70fff3]" : "text-white/55 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon name="wand" size={14} /> Builder
                </button>
                <button
                  onClick={apply}
                  disabled={!ready}
                  title="Invia (⌘↵)"
                  className={`ml-auto flex size-8 items-center justify-center rounded-lg transition-all ${
                    ready ? "bg-white text-black" : "bg-white/10 text-white/40"
                  }`}
                >
                  <Icon name="arrow-up" size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="text-[12.5px] text-white/55">Classi Tailwind del componente</div>
            <textarea
              autoFocus
              value={classes}
              onChange={(e) => setClasses(e.target.value)}
              rows={4}
              placeholder="max-w-5xl sm:p-10 mr-auto ml-auto …"
              className="w-full resize-none rounded-xl border border-white/10 bg-black/40 p-2.5 font-mono text-[12px] text-[#7ee0ff] outline-none placeholder:text-white/25"
            />
          </>
        )}

        {/* Selected reference */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-white/45">
            <Icon name="cursor" size={12} className="text-[#70fff3]" /> Selezionato: {title}
            {(component.source || component.file) && (
              <span className="ml-auto truncate font-mono text-[11px] text-white/35">{component.source || component.file}</span>
            )}
          </div>
          {component.cls && (
            <div className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-white/55">
              {component.cls}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg bg-white/8 px-4 py-2 text-[13px] text-white/80 hover:bg-white/12">
            Annulla
          </button>
          <button
            onClick={apply}
            disabled={!ready}
            className={`rounded-lg px-4 py-2 text-[13px] font-medium transition-all ${
              ready ? "bg-[#4067e8] text-white hover:bg-[#3457cf]" : "cursor-not-allowed bg-white/10 text-white/40"
            }`}
          >
            Applica modifiche
          </button>
        </div>
      </div>
    </FloatingPanel>
  );
}
