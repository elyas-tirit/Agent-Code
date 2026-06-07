import * as vscode from "vscode";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AppSettings, Attachment, CodeNode, EffortLevel, PermissionMode } from "../shared/protocol";
import { ImagePart } from "../agents/types";

// ---------------------------------------------------------------------------
// Settings panel <-> VS Code configuration
// ---------------------------------------------------------------------------

export function readAppSettings(): AppSettings {
  const cfg = vscode.workspace.getConfiguration("agentCode");
  return {
    userName: cfg.get<string>("userName", ""),
    defaultMode: cfg.get<PermissionMode>("defaultMode", "bypassPermissions"),
    model: cfg.get<string>("model", ""),
    effort: (cfg.get<string>("effort", "") || "") as EffortLevel | "",
    thinking: cfg.get<boolean>("thinking", true),
    fullAccess: cfg.get<boolean>("fullAccess", true),
    previewUrl: cfg.get<string>("previewUrl", "http://localhost:3000"),
    openDashboardOnStartup: cfg.get<boolean>("openDashboardOnStartup", true),
  };
}

export async function writeAppSettings(patch: Partial<AppSettings>): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("agentCode");
  const G = vscode.ConfigurationTarget.Global;
  const entries = Object.entries(patch) as [keyof AppSettings, unknown][];
  for (const [key, value] of entries) await cfg.update(key, value, G);
}

// ---------------------------------------------------------------------------
// Code view: workspace file tree + file contents
// ---------------------------------------------------------------------------

const IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "out",
  ".next",
  ".vscode-test",
  "coverage",
  ".turbo",
  ".cache",
]);

function walk(dir: string, rel: string, depth: number): CodeNode[] {
  if (depth > 6) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs: CodeNode[] = [];
  const files: CodeNode[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".gitignore") continue;
    if (IGNORE.has(e.name)) continue;
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      const children = walk(path.join(dir, e.name), childRel, depth + 1);
      dirs.push({ name: e.name, path: childRel, type: "dir", children });
    } else if (e.isFile()) {
      files.push({ name: e.name, path: childRel, type: "file" });
    }
  }
  const byName = (a: CodeNode, b: CodeNode) => a.name.localeCompare(b.name);
  return [...dirs.sort(byName), ...files.sort(byName)];
}

export function buildCodeTree(): CodeNode[] {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) return [];
  return walk(root, "", 0);
}

const LANG_BY_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  json: "json",
  css: "css",
  scss: "scss",
  html: "html",
  md: "markdown",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  sh: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sql: "sql",
};

export function readCodeFile(rel: string): { content: string; language: string } | undefined {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) return undefined;
  const abs = path.join(root, rel);
  if (!abs.startsWith(root)) return undefined; // no path traversal
  try {
    const stat = fs.statSync(abs);
    if (stat.size > 800_000) return { content: "// File troppo grande per l'anteprima.", language: "text" };
    const content = fs.readFileSync(abs, "utf8");
    const ext = rel.split(".").pop()?.toLowerCase() ?? "";
    return { content, language: LANG_BY_EXT[ext] ?? "text" };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Image attachments
// ---------------------------------------------------------------------------

let attachCounter = 0;
const nextId = () => `att-${Date.now()}-${++attachCounter}`;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

// Forward map ext → mime (handles jpeg≠jpg correctly; the reverse lookup did not).
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};
const mimeForExt = (ext: string): string => MIME_BY_EXT[ext.toLowerCase()] ?? "image/png";

/** Persist a pasted/dropped data-URL image to a temp file Claude can read. */
export function saveDataUrlImage(dataUrl: string, name: string): Attachment | undefined {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return undefined;
  const mime = m[1];
  const ext = EXT_BY_MIME[mime] ?? "png";
  // Save under the home dir (which is in `additionalDirectories`) so the agent
  // can Read the image even in full-access mode (tmpdir is outside it).
  const dir = path.join(os.homedir(), ".agent-code", "attachments");
  fs.mkdirSync(dir, { recursive: true });
  const safe = (name || "incolla").replace(/[^\w.-]/g, "_").slice(0, 40);
  const file = path.join(dir, `${Date.now()}-${safe}.${ext}`);
  fs.writeFileSync(file, Buffer.from(m[2], "base64"));
  return { id: nextId(), kind: "image", name: safe || `image.${ext}`, path: file, dataUrl };
}

/** Read a picked image file into an attachment (with a data URL for the thumbnail). */
export function attachmentFromFile(uri: vscode.Uri, kind: "image" | "file"): Attachment {
  const abs = uri.fsPath;
  const name = path.basename(abs);
  let dataUrl: string | undefined;
  if (kind === "image") {
    try {
      const ext = name.split(".").pop()?.toLowerCase() ?? "png";
      const mime = mimeForExt(ext);
      const bytes = fs.readFileSync(abs);
      if (bytes.length < 4_000_000) dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
    } catch {
      /* ignore — thumbnail is optional */
    }
  }
  return { id: nextId(), kind, name, path: abs, dataUrl };
}

export function figmaAttachment(url: string): Attachment {
  let name = "Figma";
  const node = /node-id=([0-9-]+)/.exec(url)?.[1];
  if (node) name = `Figma · ${node}`;
  return { id: nextId(), kind: "figma", name, url };
}

/** Extract a base64 image block from an image attachment (read from disk, else its data URL). */
export function imagePartFromAttachment(a: Attachment): ImagePart | undefined {
  if (a.kind !== "image") return undefined;
  if (a.path) {
    const ext = a.path.split(".").pop()?.toLowerCase() ?? "png";
    if (ext === "svg") return undefined; // the API can't ingest SVG as an image
    try {
      const bytes = fs.readFileSync(a.path);
      return { mediaType: mimeForExt(ext), dataBase64: bytes.toString("base64") };
    } catch {
      /* fall through to data URL */
    }
  }
  if (a.dataUrl) {
    const m = /^data:([^;]+);base64,(.*)$/s.exec(a.dataUrl);
    if (m && m[1] !== "image/svg+xml") return { mediaType: m[1], dataBase64: m[2] };
  }
  return undefined;
}

/** Turn NON-image attachments into text the agent can act on (paths to Read, Figma URL). */
export function attachmentsToText(attachments: Attachment[] | undefined): string {
  if (!attachments?.length) return "";
  const lines = attachments
    .filter((a) => a.kind !== "image") // images are sent as real image content blocks
    .map((a) =>
      a.kind === "figma"
        ? `Design Figma da implementare — usa il Figma MCP (server "figma", strumenti get_design_context/get_screenshot) su questo nodo: ${a.url}`
        : `@${a.path}`,
    );
  return lines.length ? "\n\n" + lines.join("\n") : "";
}
