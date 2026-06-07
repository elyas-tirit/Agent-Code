import { useState } from "react";
import { Icon } from "./Icon";
import { mediaUrl } from "../vscode";

interface AvatarProps {
  size?: number;
  /** Pulsing glow + ring animation (used while the agent is working). */
  active?: boolean;
  /** Accent ring colour. */
  ring?: string;
}

/**
 * Agent avatar — the brand robot render inside a glowing circular frame.
 * Falls back to a gradient orb + glyph if the asset can't load.
 */
export function Avatar({ size = 80, active = false, ring = "rgba(112,255,243,0.55)" }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      className="relative shrink-0 rounded-full p-[2px]"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(from 140deg, ${ring}, rgba(64,103,232,0.5), rgba(162,89,255,0.45), ${ring})`,
        boxShadow: active
          ? `0 0 0 1px rgba(255,255,255,0.05), 0 8px 26px rgba(0,0,0,0.5), 0 0 26px -4px ${ring}`
          : "0 0 0 1px rgba(255,255,255,0.05), 0 6px 18px rgba(0,0,0,0.45)",
      }}
    >
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full"
        style={{ background: "radial-gradient(120% 120% at 30% 20%, #2a2350 0%, #14122a 45%, #0a0913 100%)" }}
      >
        {!broken ? (
          <img
            src={mediaUrl("robot.png")}
            alt="agent"
            onError={() => setBroken(true)}
            className="h-full w-full scale-[1.06] object-cover"
            draggable={false}
          />
        ) : (
          <Icon name="bot" size={size * 0.42} className="text-white/85" />
        )}
        {active && (
          <span
            className="pointer-events-none absolute inset-0 animate-pulse rounded-full"
            style={{ boxShadow: `inset 0 0 22px -6px ${ring}` }}
          />
        )}
      </div>
    </div>
  );
}
