import { useEffect } from "react";
import type { PermissionDecision, PermissionRequest } from "@shared/protocol";
import { Icon } from "../../ui/Icon";
import { FloatingPanel } from "../../ui/FloatingPanel";

interface ApprovalModalProps {
  request: PermissionRequest;
  onRespond: (decision: PermissionDecision) => void;
  onMinimize?: () => void;
}

function Key({ children }: { children: string }) {
  return (
    <span className="ml-2 inline-flex size-5 items-center justify-center rounded border border-white/20 bg-white/10 text-[11px] text-white/70">
      {children}
    </span>
  );
}

export function ApprovalModal({ request, onRespond, onMinimize }: ApprovalModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "1" || e.key === "Enter") {
        e.preventDefault();
        onRespond("allow");
      } else if (e.key === "2" && request.canAlwaysAllow) {
        e.preventDefault();
        onRespond("always");
      } else if (e.key === "3" || e.key === "Escape") {
        e.preventDefault();
        onRespond("deny");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, onRespond]);

  return (
    <FloatingPanel title="Richiesta di approvazione" icon="shield" accent="#4067e8" width={440} onMinimize={onMinimize}>
      <div className="p-5">
        <p className="text-[15px] leading-snug text-white">{request.title}</p>
        {request.description && <p className="mt-2 text-[13px] leading-relaxed text-white/55">{request.description}</p>}
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-black/40 px-2 py-1 text-[12px] text-white/70">
          <Icon name="tool" size={13} />
          {request.displayName ?? request.toolName}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => onRespond("allow")}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-[#4067e8] text-[14px] font-medium text-white hover:bg-[#3457cf]"
          >
            Consenti una volta <Key>1</Key>
          </button>
          <div className="flex gap-2">
            {request.canAlwaysAllow && (
              <button
                onClick={() => onRespond("always")}
                className="flex h-10 flex-1 items-center justify-center rounded-lg bg-white/10 text-[13px] text-white hover:bg-white/15"
              >
                Consenti sempre <Key>2</Key>
              </button>
            )}
            <button
              onClick={() => onRespond("deny")}
              className="flex h-10 flex-1 items-center justify-center rounded-lg bg-white/5 text-[13px] text-white/80 hover:bg-white/10"
            >
              Rifiuta <Key>3</Key>
            </button>
          </div>
        </div>
      </div>
    </FloatingPanel>
  );
}
