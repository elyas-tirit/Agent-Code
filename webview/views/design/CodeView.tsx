import { useEffect, useState } from "react";
import type { CodeNode } from "@shared/protocol";
import { Icon, IconName } from "../../ui/Icon";
import { onHostMessage, post } from "../../vscode";

function iconForFile(name: string): IconName {
  return /\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss|html|py|go|rs|java|sh|ya?ml|toml|sql)$/i.test(name)
    ? "file-code"
    : "file";
}

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
          <Icon name="chevron-right" size={13} className={`shrink-0 text-white/40 transition-transform ${expanded ? "rotate-90" : ""}`} />
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
      className={`flex w-full items-center gap-1.5 rounded-md py-[3px] pr-2 text-left text-[12.5px] transition-colors ${
        active ? "bg-[#4067e8]/20 text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white"
      }`}
      style={{ paddingLeft: pad + 16 }}
    >
      <Icon name={iconForFile(node.name)} size={14} className={`shrink-0 ${active ? "text-[#70fff3]" : "text-white/40"}`} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function CodeView() {
  const [tree, setTree] = useState<CodeNode[]>([]);
  const [open, setOpen] = useState<{ path: string; content: string; language: string } | null>(null);

  useEffect(() => {
    post({ type: "code/tree" });
    return onHostMessage((m) => {
      if (m.type === "code/tree") setTree(m.nodes);
      else if (m.type === "code/file") setOpen({ path: m.path, content: m.content, language: m.language });
    });
  }, []);

  const lines = open ? open.content.split("\n") : [];

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0f]">
      {/* File tree */}
      <div className="flex w-[260px] shrink-0 flex-col border-r border-white/[0.07] bg-black/30">
        <div className="flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
          <Icon name="folder" size={14} /> Esplora risorse
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          {tree.length === 0 ? (
            <div className="px-4 py-6 text-[12px] text-white/35">Nessun file nel workspace.</div>
          ) : (
            tree.map((n) => <TreeNode key={n.path} node={n} depth={0} openPath={open?.path ?? ""} onOpen={(p) => post({ type: "code/open", path: p })} />)
          )}
        </div>
      </div>

      {/* File content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {open ? (
          <>
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5 text-[12.5px] text-white/70">
              <Icon name={iconForFile(open.path)} size={14} className="text-[#70fff3]" />
              <span className="truncate">{open.path}</span>
              <span className="ml-auto rounded bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide text-white/40">
                {open.language}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="flex min-h-full font-mono text-[12.5px] leading-[1.55]">
                <div className="select-none border-r border-white/[0.05] bg-black/20 px-3 py-3 text-right text-white/25">
                  {lines.map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <pre className="flex-1 overflow-x-auto whitespace-pre px-4 py-3 text-white/85">{open.content}</pre>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white/35">
            <Icon name="file-code" size={40} className="text-white/20" />
            <p className="text-[13px]">Seleziona un file dall'alberatura per visualizzarlo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
