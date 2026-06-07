import { ReactNode } from "react";

interface PillProps {
  children: ReactNode;
  tone?: "blue" | "dark" | "ghost";
  className?: string;
}

const TONES: Record<NonNullable<PillProps["tone"]>, string> = {
  blue: "bg-[#4067e8]/10 text-white",
  dark: "bg-black/20 text-white",
  ghost: "bg-transparent text-white/90",
};

export function Pill({ children, tone = "dark", className = "" }: PillProps) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-[12px] font-light leading-none shadow-[0_4px_8px_rgba(0,0,0,0.1)] ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
