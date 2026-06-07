import { PermissionMode, ToolDiff } from "../shared/protocol";

/** Build a before/after diff from an Edit/Write/MultiEdit tool input. */
export function diffFromToolInput(name: string, input: Record<string, unknown>): ToolDiff | undefined {
  const file = (input?.file_path as string) ?? (input?.path as string) ?? "";
  if (name === "Edit") {
    return { file, before: String(input?.old_string ?? ""), after: String(input?.new_string ?? "") };
  }
  if (name === "Write") {
    return { file, before: "", after: String(input?.content ?? "") };
  }
  if (name === "MultiEdit" && Array.isArray(input?.edits)) {
    const edits = input.edits as { old_string?: string; new_string?: string }[];
    return {
      file,
      before: edits.map((e) => e.old_string ?? "").join("\n⋯\n"),
      after: edits.map((e) => e.new_string ?? "").join("\n⋯\n"),
    };
  }
  return undefined;
}

/** Derive a short conversation title from the first user message. */
export function deriveTitle(text: string): string {
  const firstLine =
    text
      .replace(/^\[Componente selezionato:[^\]]*\]\s*/i, "")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "Nuova conversazione";
  const trimmed = firstLine.length > 48 ? firstLine.slice(0, 47).trimEnd() + "…" : firstLine;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Short, human summary of a tool call for the chat/card. */
export function summarizeTool(name: string, input: Record<string, unknown>): string {
  const get = (k: string) => (typeof input?.[k] === "string" ? (input[k] as string) : undefined);
  switch (name) {
    case "Bash":
      return get("command")?.slice(0, 80) ?? "comando shell";
    case "Read":
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return get("file_path") ?? get("path") ?? name;
    case "Grep":
      return get("pattern") ?? "ricerca";
    case "Glob":
      return get("pattern") ?? "glob";
    case "WebFetch":
      return get("url") ?? "fetch";
    default: {
      const first = Object.values(input ?? {}).find((v) => typeof v === "string") as string | undefined;
      return first ? first.slice(0, 80) : name;
    }
  }
}

export const SDK_MODES: PermissionMode[] = ["default", "plan", "acceptEdits", "bypassPermissions"];
