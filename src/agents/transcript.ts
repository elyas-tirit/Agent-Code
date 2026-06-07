import { Attachment, ChatMessage } from "../shared/protocol";
import { AgentEvent } from "./types";

let counter = 0;
export function msgId(): string {
  return `m-${Date.now().toString(36)}-${++counter}`;
}

function lastAssistant(messages: ChatMessage[], create: boolean): ChatMessage | undefined {
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant" && last.streaming !== false) return last;
  if (!create) return undefined;
  const m: ChatMessage = { id: msgId(), role: "assistant", text: "", reasoning: "", streaming: true, tools: [] };
  messages.push(m);
  return m;
}

/** Apply a streaming agent event to a transcript (mutates). Returns true if it changed. */
export function applyAgentEvent(messages: ChatMessage[], event: AgentEvent): boolean {
  switch (event.kind) {
    case "text": {
      lastAssistant(messages, true)!.text += event.delta;
      return true;
    }
    case "reasoning": {
      const m = lastAssistant(messages, true)!;
      m.reasoning = (m.reasoning ?? "") + event.delta;
      return true;
    }
    case "tool": {
      const m = lastAssistant(messages, true)!;
      const tools = m.tools ?? (m.tools = []);
      const i = tools.findIndex((t) => t.id === event.tool.id);
      if (i >= 0) tools[i] = { ...tools[i], ...event.tool };
      else tools.push(event.tool);
      return true;
    }
    case "done": {
      const m = lastAssistant(messages, false);
      if (m) m.streaming = false;
      return Boolean(m);
    }
    default:
      return false;
  }
}

/** Append a user turn (finalizing any open assistant message first). */
export function addUserMessage(messages: ChatMessage[], text: string, attachments?: Attachment[]): void {
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant") last.streaming = false;
  messages.push({ id: msgId(), role: "user", text, attachments });
}
