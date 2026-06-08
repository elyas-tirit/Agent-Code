import { useEffect, useRef, useState } from "react";
import { Highlight, type PrismTheme } from "prism-react-renderer";
import type { CodeNode, SelectedComponent } from "@shared/protocol";
import { Icon } from "../../ui/Icon";
import { FileIcon } from "../../ui/FileIcon";
import { onHostMessage, post } from "../../vscode";
import { t } from "../../i18n";

const GREEN = "#3fb950";

/** GitHub-dark-ish theme tuned for the green "Code" surface. */
const THEME: PrismTheme = {
  plain: { color: "#e6edf3", backgroundColor: "transparent" },
  styles: [
    { types: ["comment", "prolog", "cdata"], style: { color: "#8b949e", fontStyle: "italic" } },
    { types: ["punctuation"], style: { color: "#a6b0bb" } },
    { types: ["keyword", "operator", "module", "control-flow"], style: { color: "#ff9d6b" } },
    { types: ["string", "char", "attr-value", "inserted"], style: { color: "#7ee787" } },
    { types: ["function", "method", "class-name", "maybe-class-name"], style: { color: "#d2a8ff" } },
    { types: ["number", "boolean", "constant", "symbol"], style: { color: "#79c0ff" } },
    { types: ["tag", "selector", "deleted"], style: { color: "#7ee787" } },
    { types: ["attr-name", "property"], style: { color: "#79c0ff" } },
    { types: ["variable", "parameter"], style: { color: "#e6edf3" } },
    { types: ["builtin"], style: { color: "#ffa657" } },
  ],
};

function prismLang(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "tsx" || ext === "jsx") return "tsx";
  if (ext === "ts" || ext === "mts" || ext === "cts") return "typescript";
  if (ext === "js" || ext === "mjs" || ext === "cjs") return "jsx";
  if (ext === "json") return "json";
  if (ext === "css" || ext === "scss" || ext === "less") return "css";
  if (ext === "html" || ext === "htm" || ext === "xml" || ext === "svg") return "markup";
  if (ext === "md" || ext === "mdx") return "markdown";
  if (ext === "py") return "python";
  if (ext === "sh" || ext === "bash") return "bash";
  return "tsx";
}

const baseName = (p: string) => p.split("/").pop() || p;

function TreeNode({
  node,
  depth,
  openPath,
  onOpen,
}: {
  node: CodeNode;
  depth: number;
  openPath: string;
  onOpen: (p: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const pad = 8 + depth * 12;

  if (node.type === "dir") {
    return (
      <div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-center gap-1.5 rounded-md py-[3px] pr-2 text-left text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
          style={{ paddingLeft: pad }}
        >
          <Icon name="chevron-right" size={13} className={`shrink-0 text-white/35 transition-transform ${expanded ? "rotate-90" : ""}`} />
          <Icon name={expanded ? "folder-open" : "folder"} size={14} className="shrink-0 text-[#7fa0ff]" />
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children?.map((c) => (
          <TreeNode key={c.path} node={c} depth={depth + 1} openPath={openPath} onOpen={onOpen} />
        ))}
      </div>
    );
  }

  const active = openPath === node.path;
  return (
    <button
      onClick={() => onOpen(node.path)}
      className={`flex w-full items-center gap-2 rounded-md py-[3px] pr-2 text-left text-[12.5px] transition-colors ${
        active ? "bg-[#3fb950]/15 text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white"
      }`}
      style={{ paddingLeft: pad + 14 }}
    >
      <FileIcon name={node.name} size={14} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

/** Loading skeleton (shimmering lines) shown while a file's content is fetched. */
function CodeSkeleton() {
  const widths = [55, 70, 48, 80, 38, 62, 0, 30, 18, 44, 52, 66, 40, 24, 58, 0, 34, 46, 28, 60];
  return (
    <div className="relative flex-1 overflow-hidden px-4 py-3">
      <div className="pointer-events-none absolute left-0 top-0 h-full w-24" style={{ background: `linear-gradient(90deg, ${GREEN}22, transparent)` }} />
      {widths.map((w, i) => (
        <div key={i} className="flex h-[22px] items-center gap-3">
          <div className="ac-shimmer h-2 w-2 shrink-0 rounded-full bg-white/[0.07]" />
          {w > 0 && <div className="ac-shimmer h-2 rounded bg-white/[0.06]" style={{ width: `${w}%` }} />}
        </div>
      ))}
    </div>
  );
}

interface OpenFile {
  path: string;
  content: string;
  language: string;
}

const ZOOMS = [90, 100, 115, 130];

export function CodeView({ onSelectCode }: { onSelectCode?: (ref: SelectedComponent) => void }) {
  const [tree, setTree] = useState<CodeNode[]>([]);
  const [tabs, setTabs] = useState<OpenFile[]>([]);
  const [active, setActive] = useState<string>("");
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [sel, setSel] = useState<{ anchor: number; head: number } | null>(null);
  const [zoom, setZoom] = useState(100);
  const dragging = useRef(false);

  useEffect(() => {
    post({ type: "code/tree" });
    return onHostMessage((m) => {
      if (m.type === "code/tree") setTree(m.nodes);
      else if (m.type === "code/file") {
        // Normalize CRLF/CR → LF so line counts + snippets match prism's display.
        const file = { path: m.path, content: m.content.replace(/\r\n?/g, "\n"), language: m.language };
        setTabs((t) => (t.some((f) => f.path === m.path) ? t.map((f) => (f.path === m.path ? file : f)) : [...t, file]));
        setActive(m.path);
        setLoadingPath((p) => (p === m.path ? null : p));
      }
    });
  }, []);

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // Drop any line selection when the active file changes (tab click, close, …) so
  // a stale range never attaches to the wrong/shorter file.
  useEffect(() => setSel(null), [active]);

  const openFile = (path: string) => {
    setSel(null);
    if (tabs.some((f) => f.path === path)) {
      setActive(path);
      return;
    }
    setLoadingPath(path);
    post({ type: "code/open", path });
  };

  const closeTab = (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTabs((t) => {
      const idx = t.findIndex((f) => f.path === path);
      const next = t.filter((f) => f.path !== path);
      // Activate the adjacent neighbor (the one that slid into the slot), like VS Code.
      if (active === path) setActive(next.length ? next[Math.min(idx, next.length - 1)].path : "");
      return next;
    });
  };

  const current = tabs.find((f) => f.path === active);
  const lines = current ? current.content.replace(/\n$/, "").split("\n") : [];
  const range = sel ? { start: Math.min(sel.anchor, sel.head), end: Math.max(sel.anchor, sel.head) } : null;

  const onGutterDown = (line: number, e: React.MouseEvent) => {
    if (e.shiftKey && sel) setSel({ anchor: sel.anchor, head: line });
    else setSel({ anchor: line, head: line });
    dragging.current = true;
  };
  const onGutterEnter = (line: number) => {
    if (dragging.current && sel) setSel((s) => (s ? { ...s, head: line } : s));
  };

  const attachSelection = () => {
    if (!current || !range || range.start > lines.length) return;
    const end = Math.min(range.end, lines.length);
    const snippet = lines.slice(range.start - 1, end).join("\n");
    const loc = range.start === end ? `${current.path}:${range.start}` : `${current.path}:${range.start}-${end}`;
    onSelectCode?.({
      kind: "code",
      label: loc,
      file: current.path,
      line: range.start,
      endLine: end,
      code: snippet,
    });
    setSel(null);
  };

  const RailBtn = ({ icon, label, activeIcon }: { icon: "files" | "puzzle" | "github"; label: string; activeIcon?: boolean }) => (
    <button
      title={label}
      className={`flex size-9 items-center justify-center rounded-xl transition-colors ${
        activeIcon ? "bg-white/10 text-white" : "text-white/45 hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon name={icon === "files" ? "folder" : icon} size={18} />
    </button>
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-xl border border-white/10 bg-[#0c0c0e]">
      {/* Activity rail */}
      <div className="flex w-12 shrink-0 flex-col items-center gap-1.5 border-r border-white/[0.06] bg-black/40 py-3">
        <RailBtn icon="files" label={t("Explorer", "Esplora risorse")} activeIcon />
        <RailBtn icon="puzzle" label={t("Extensions", "Estensioni")} />
        <RailBtn icon="github" label="Source control" />
      </div>

      {/* Explorer */}
      <div className="flex w-[244px] shrink-0 flex-col border-r border-white/[0.07] bg-black/25">
        <div className="flex items-center justify-between px-3.5 py-2.5">
          <span className="text-[13px] font-semibold text-white/90">Explorer</span>
          <Icon name="search" size={14} className="text-white/35" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          {tree.length === 0 ? (
            <div className="px-4 py-6 text-[12px] text-white/35">{t("No files in the workspace.", "Nessun file nel workspace.")}</div>
          ) : (
            tree.map((n) => <TreeNode key={n.path} node={n} depth={0} openPath={active} onOpen={openFile} />)
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-white/[0.07] bg-black/20 pl-2 pr-3">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1.5">
            {tabs.map((f) => (
              <button
                key={f.path}
                onClick={() => setActive(f.path)}
                className={`group flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors ${
                  active === f.path ? "bg-white/[0.08] text-white" : "text-white/55 hover:bg-white/[0.04] hover:text-white/80"
                }`}
              >
                <FileIcon name={f.path} size={13} />
                <span className="max-w-[140px] truncate">{baseName(f.path)}</span>
                <span
                  onClick={(e) => closeTab(f.path, e)}
                  className="flex size-4 items-center justify-center rounded text-white/35 opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover:opacity-100"
                >
                  <Icon name="x" size={11} />
                </span>
              </button>
            ))}
          </div>
          {current && (
            <div className="flex shrink-0 items-center gap-1.5 text-white/40">
              <button
                onClick={() => setZoom((z) => ZOOMS[(ZOOMS.indexOf(z) + 1) % ZOOMS.length])}
                title="Zoom"
                className="rounded-md px-1.5 py-1 text-[11.5px] tabular-nums hover:bg-white/5 hover:text-white"
              >
                {zoom}%
              </button>
              <button
                onClick={() => void navigator.clipboard.writeText(current.content).catch(() => {})}
                title={t("Copy file", "Copia file")}
                className="flex size-7 items-center justify-center rounded-md hover:bg-white/5 hover:text-white"
              >
                <Icon name="copy" size={14} />
              </button>
              <Icon name="split" size={14} className="opacity-50" />
            </div>
          )}
        </div>

        {/* Decorative green glow over the editor body (fixed; doesn't scroll away) */}
        <div
          className="pointer-events-none absolute left-0 top-12 z-[1] h-44 w-44 opacity-50 blur-3xl"
          style={{ background: `radial-gradient(circle, ${GREEN}40, transparent 70%)` }}
        />

        {/* Body */}
        {loadingPath ? (
          <CodeSkeleton />
        ) : current ? (
          <div className="relative min-h-0 flex-1 overflow-auto">
            <Highlight theme={THEME} code={current.content.replace(/\n$/, "")} language={prismLang(current.path)}>
              {({ tokens, getLineProps, getTokenProps }) => (
                <div className="relative flex min-h-full font-mono leading-[1.6]" style={{ fontSize: `${(12.5 * zoom) / 100}px` }}>
                  {/* Gutter */}
                  <div
                    className="sticky left-0 z-[2] select-none border-r border-white/[0.05] bg-[#0c0c0e] py-3 text-right text-white/25"
                    onMouseLeave={() => (dragging.current = dragging.current)}
                  >
                    {tokens.map((_, i) => {
                      const ln = i + 1;
                      const inSel = range && ln >= range.start && ln <= range.end;
                      return (
                        <div
                          key={i}
                          onMouseDown={(e) => onGutterDown(ln, e)}
                          onMouseEnter={() => onGutterEnter(ln)}
                          className={`cursor-pointer px-3 transition-colors hover:text-white/60 ${inSel ? "bg-[#3fb950]/20 text-[#7ee787]" : ""}`}
                        >
                          {ln}
                        </div>
                      );
                    })}
                  </div>
                  {/* Code */}
                  <div className="min-w-0 flex-1 py-3 pl-4 pr-6">
                    {tokens.map((line, i) => {
                      const ln = i + 1;
                      const inSel = range && ln >= range.start && ln <= range.end;
                      const lp = getLineProps({ line });
                      return (
                        <div
                          key={i}
                          {...lp}
                          className={`${lp.className ?? ""} whitespace-pre`}
                          style={{ ...lp.style, background: inSel ? `${GREEN}1f` : undefined, boxShadow: inSel ? `inset 2px 0 0 ${GREEN}` : undefined }}
                        >
                          {line.map((token, key) => (
                            <span key={key} {...getTokenProps({ token })} />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Highlight>

            {/* Selection action bar */}
            {range && (
              <div className="ac-pop sticky bottom-3 left-1/2 z-10 mx-auto flex w-fit -translate-x-0 items-center gap-2 rounded-full border border-[#3fb950]/40 bg-[#10160f]/95 py-1.5 pl-3 pr-1.5 text-[12.5px] text-white shadow-[0_12px_36px_rgba(0,0,0,0.6)] backdrop-blur">
                <Icon name="cursor" size={13} className="text-[#7ee787]" />
                <span className="text-white/80">
                  {range.start === range.end ? t(`Line ${range.start}`, `Riga ${range.start}`) : t(`Lines ${range.start}–${range.end}`, `Righe ${range.start}–${range.end}`)}
                </span>
                <button
                  onClick={() => void navigator.clipboard.writeText(lines.slice(range.start - 1, range.end).join("\n")).catch(() => {})}
                  title={t("Copy", "Copia")}
                  className="flex size-7 items-center justify-center rounded-full text-white/55 hover:bg-white/10 hover:text-white"
                >
                  <Icon name="copy" size={13} />
                </button>
                <button onClick={() => setSel(null)} title={t("Cancel", "Annulla")} className="flex size-7 items-center justify-center rounded-full text-white/45 hover:bg-white/10 hover:text-white">
                  <Icon name="x" size={13} />
                </button>
                <button
                  onClick={attachSelection}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-black"
                  style={{ background: "linear-gradient(90deg,#7ee787,#3fb950)" }}
                >
                  <Icon name="sparkles" size={13} /> {t("Ask AI", "Chiedi all'AI")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white/35">
            <Icon name="file-code" size={40} className="text-white/15" />
            <p className="text-[13px]">{t("Open a file from the Explorer to read it, or select lines for the AI.", "Apri un file dall'Explorer per leggerlo o selezionare righe per l'AI.")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
