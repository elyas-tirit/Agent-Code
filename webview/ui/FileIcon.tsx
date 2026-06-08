import { Icon } from "./Icon";

type Kind = "react" | "js" | "ts" | "json" | "css" | "html" | "md" | "file";

export function fileKind(name: string): Kind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "tsx" || ext === "jsx") return "react";
  if (ext === "ts" || ext === "mts" || ext === "cts") return "ts";
  if (ext === "js" || ext === "mjs" || ext === "cjs") return "js";
  if (ext === "json") return "json";
  if (ext === "css" || ext === "scss" || ext === "sass" || ext === "less") return "css";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "md" || ext === "mdx") return "md";
  return "file";
}

function Badge({ text, bg, fg, size }: { text: string; bg: string; fg: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <rect width="24" height="24" rx="5.5" fill={bg} />
      <text x="12" y="13" dominantBaseline="central" textAnchor="middle" fontSize="9.5" fontWeight="800" fontFamily="ui-sans-serif, system-ui" fill={fg}>
        {text}
      </text>
    </svg>
  );
}

/** Colored, language-aware file glyph (React atom, JS/TS/CSS badges, …). */
export function FileIcon({ name, size = 15 }: { name: string; size?: number }) {
  const kind = fileKind(name);
  switch (kind) {
    case "react":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
          <circle cx="12" cy="12" r="1.7" fill="#61dafb" />
          <g stroke="#61dafb" fill="none" strokeWidth="1">
            <ellipse cx="12" cy="12" rx="10" ry="3.9" />
            <ellipse cx="12" cy="12" rx="10" ry="3.9" transform="rotate(60 12 12)" />
            <ellipse cx="12" cy="12" rx="10" ry="3.9" transform="rotate(120 12 12)" />
          </g>
        </svg>
      );
    case "js":
      return <Badge text="JS" bg="#f0db4f" fg="#1b1b1b" size={size} />;
    case "ts":
      return <Badge text="TS" bg="#3178c6" fg="#fff" size={size} />;
    case "json":
      return <Badge text="{}" bg="#3b3b1f" fg="#f0db4f" size={size} />;
    case "css":
      return <Badge text="#" bg="#2965f1" fg="#fff" size={size} />;
    case "html":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
          <rect width="24" height="24" rx="5.5" fill="#e34c26" />
          <path d="M8 9.5 5.5 12 8 14.5M16 9.5 18.5 12 16 14.5" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "md":
      return <Badge text="M" bg="#2b3137" fg="#9fb6c9" size={size} />;
    default:
      return <Icon name="file" size={size} className="shrink-0 text-white/40" />;
  }
}
