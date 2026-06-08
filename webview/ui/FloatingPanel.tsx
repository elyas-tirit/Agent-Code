import { ReactNode, useRef, useState } from "react";
import { Icon, IconName } from "./Icon";

/**
 * A draggable, minimizable floating panel used for the approval / question / plan
 * modals. It deliberately has NO blocking backdrop: clicks outside the card pass
 * through (pointer-events-none wrapper), so you can still see and interact with the
 * preview/chat behind while deciding. Drag it by the header; minimize to a chip and
 * reopen later to answer.
 */
export function FloatingPanel({
  title,
  icon,
  accent,
  width = 460,
  onMinimize,
  onClose,
  children,
}: {
  title: string;
  icon: IconName;
  accent: string;
  width?: number;
  onMinimize?: () => void;
  onClose?: () => void;
  children: ReactNode;
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  const onDown = (e: React.MouseEvent) => {
    drag.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    const move = (ev: MouseEvent) => {
      if (!drag.current) return;
      setPos({ x: drag.current.px + (ev.clientX - drag.current.mx), y: drag.current.py + (ev.clientY - drag.current.my) });
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center p-6">
      <div
        className="ac-pop pointer-events-auto flex max-h-[88%] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#161616]"
        style={{
          width,
          maxWidth: "94%",
          transform: `translate(${pos.x}px, ${pos.y}px)`,
          boxShadow: `0 30px 90px rgba(0,0,0,0.7), 0 0 44px -18px ${accent}`,
        }}
      >
        <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
        <div
          onMouseDown={onDown}
          className="flex cursor-grab select-none items-center gap-2.5 px-4 py-3 active:cursor-grabbing"
        >
          <span className="flex size-6 items-center justify-center rounded-md" style={{ background: `${accent}22`, color: accent }}>
            <Icon name={icon} size={14} />
          </span>
          <span className="flex-1 truncate text-[13.5px] font-medium text-white">{title}</span>
          {onMinimize && (
            <button
              onClick={onMinimize}
              title="Riduci — rispondi dopo"
              className="flex size-6 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Icon name="minimize" size={14} />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              title="Chiudi"
              className="flex size-6 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Icon name="x" size={15} />
            </button>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

/** The chip shown when a panel is minimized — click to bring it back. */
export function MinimizedChip({
  label,
  icon,
  accent,
  index = 0,
  onRestore,
}: {
  label: string;
  icon: IconName;
  accent: string;
  index?: number;
  onRestore: () => void;
}) {
  return (
    <button
      onClick={onRestore}
      style={{ bottom: 16 + index * 46, borderColor: `${accent}66` }}
      className="ac-pop ac-pulse-ring absolute right-4 z-[60] flex items-center gap-2 rounded-full border bg-[#161616] py-2 pl-2.5 pr-3.5 text-[12.5px] text-white shadow-[0_10px_30px_rgba(0,0,0,0.5)] hover:bg-[#1e1e1e]"
    >
      <span className="flex size-5 items-center justify-center rounded-full" style={{ background: `${accent}22`, color: accent }}>
        <Icon name={icon} size={12} />
      </span>
      {label}
      <Icon name="arrow-up" size={13} className="text-white/40" />
    </button>
  );
}
