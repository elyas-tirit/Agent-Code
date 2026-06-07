import { useEffect } from "react";
import type { PermissionDecision, PermissionRequest } from "@shared/protocol";
import { Icon } from "../../ui/Icon";

interface ApprovalModalProps {
  request: PermissionRequest;
  onRespond: (decision: PermissionDecision) => void;
}

function Key({ children }: { children: string }) {
  return (
    <span className="ml-2 inline-flex size-5 items-center justify-center rounded border border-white/20 bg-white/10 text-[11px] text-white/70">
      {children}
    </span>
  );
}

export function ApprovalModal({ request, onRespond }: ApprovalModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[440px] max-w-[90%] rounded-2xl border border-white/10 bg-[#161616] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-[#4067e8]">
          <Icon name="shield" size={15} />
          Richiesta di approvazione
        </div>
        <p className="text-[15px] leading-snug text-white">{request.title}</p>
        {request.description && (
          <p className="mt-2 text-[13px] leading-relaxed text-white/55">{request.description}</p>
        )}
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
    </div>
  );
}
