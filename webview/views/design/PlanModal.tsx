import { useEffect } from "react";
import type { PlanRequest } from "@shared/protocol";
import { Icon } from "../../ui/Icon";
import { Md } from "../../ui/Markdown";
import { FloatingPanel } from "../../ui/FloatingPanel";

interface PlanModalProps {
  request: PlanRequest;
  onRespond: (approve: boolean) => void;
  onMinimize?: () => void;
}

export function PlanModal({ request, onRespond, onMinimize }: PlanModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) || e.key === "1") {
        e.preventDefault();
        onRespond(true);
      } else if (e.key === "Escape" || e.key === "2") {
        e.preventDefault();
        onRespond(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, onRespond]);

  return (
    <FloatingPanel title="Piano proposto" icon="list-checks" accent="#70ff8b" width={560} onMinimize={onMinimize}>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px] leading-relaxed text-white/85">
        <Md text={request.plan} />
      </div>
      <div className="flex flex-col gap-2 border-t border-white/8 p-4">
        <button
          onClick={() => onRespond(true)}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-medium text-black"
          style={{ background: "linear-gradient(90deg,#70fff3 0%,#70ff8b 100%)" }}
        >
          <Icon name="play-circle" size={16} /> Approva ed esegui
          <span className="ml-1 rounded border border-black/20 bg-black/10 px-1.5 text-[11px]">⌘↵</span>
        </button>
        <button
          onClick={() => onRespond(false)}
          className="h-10 w-full rounded-lg bg-white/8 text-[13px] text-white/80 hover:bg-white/12"
        >
          Continua a pianificare
        </button>
      </div>
    </FloatingPanel>
  );
}
