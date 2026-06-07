import { useEffect, ReactNode } from "react";
import { Icon, IconName } from "./Icon";

interface ModalProps {
  title: string;
  icon?: IconName;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Absolute-positioned inside the panel (design view) vs fixed (dashboard). */
  position?: "fixed" | "absolute";
}

export function Modal({ title, icon, onClose, children, footer, width = 480, position = "fixed" }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={`${position} inset-0 z-[60] flex items-center justify-center p-6`}>
      <div className="ac-fade-in absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div
        className="ac-scale-in relative flex max-h-[88%] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141414]/95 shadow-[0_30px_80px_rgba(0,0,0,0.65)]"
        style={{ width, maxWidth: "94%" }}
      >
        {/* Accent top hairline */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#70fff3]/60 to-transparent" />
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <div className="flex items-center gap-2.5 text-[15px] font-medium text-white">
            {icon && (
              <span className="flex size-7 items-center justify-center rounded-lg bg-white/[0.06] text-[#70fff3]">
                <Icon name={icon} size={16} />
              </span>
            )}
            {title}
          </div>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-white/10 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
