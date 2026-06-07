import { useEffect } from "react";
import type { PlanRequest } from "@shared/protocol";
import { Icon } from "../../ui/Icon";

interface PlanModalProps {
  request: PlanRequest;
  onRespond: (approve: boolean) => void;
}

export function PlanModal({ request, onRespond }: PlanModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <div className="ac-pop flex max-h-[80%] w-[560px] max-w-full flex-col rounded-2xl border border-white/10 bg-[#161616] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-2 border-b border-white/8 px-5 py-3.5 text-[12px] font-medium uppercase tracking-wide text-[#70ff8b]">
          <Icon name="list-checks" size={15} /> Piano proposto
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-white/85">{request.plan}</pre>
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
      </div>
    </div>
  );
}
