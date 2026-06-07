import {
  AgentStatus,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  PlanRequest,
  QuestionAnswers,
  QuestionRequest,
  ToolCall,
  UsageInfo,
} from "../shared/protocol";

/** Events emitted by a backend session as the agent runs. */
export type AgentEvent =
  | { kind: "status"; status: AgentStatus }
  | { kind: "usage"; usage: UsageInfo }
  | { kind: "mode"; mode: PermissionMode }
  | { kind: "title"; title: string }
  | { kind: "text"; delta: string }
  | { kind: "reasoning"; delta: string }
  | { kind: "tool"; tool: ToolCall }
  | { kind: "description"; text: string }
  | { kind: "permission"; request: PermissionRequest }
  | { kind: "permission-dismiss"; id: string }
  | { kind: "question"; request: QuestionRequest }
  | { kind: "question-dismiss"; id: string }
  | { kind: "plan"; request: PlanRequest }
  | { kind: "plan-dismiss"; id: string }
  | { kind: "session-id"; id: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

export type AgentEventListener = (event: AgentEvent) => void;

export interface SpawnOptions {
  name: string;
  prompt?: string;
  cwd?: string;
  /** SDK session id to resume (continue a prior conversation with full context). */
  resume?: string;
}

/** An inline image sent to the model as a base64 content block. */
export interface ImagePart {
  mediaType: string;
  dataBase64: string;
}

/** A single running agent session. */
export interface AgentSession {
  readonly id: string;
  send(text: string, images?: ImagePart[]): void;
  /** Resolve a pending tool-permission request. */
  respondPermission(id: string, decision: PermissionDecision): void;
  /** Answer a pending AskUserQuestion. */
  answerQuestion(id: string, answers: QuestionAnswers): void;
  /** Approve or reject a presented plan (ExitPlanMode). */
  respondPlan(id: string, approve: boolean): void;
  /** Change the permission mode (default / plan / acceptEdits / bypass). */
  setMode(mode: PermissionMode): void;
  /** Switch model live ("" / "default" = SDK default). */
  setModel(model: string): void;
  /** Toggle extended thinking live. */
  setThinking(enabled: boolean): void;
  /** Interrupt the current turn. */
  interrupt(): void;
  stop(): void;
  /** Subscribe to events; returns a disposer to detach the listener. */
  onEvent(listener: AgentEventListener): () => void;
}

export interface AgentBackend {
  readonly id: string;
  spawn(opts: SpawnOptions): Promise<AgentSession>;
}
