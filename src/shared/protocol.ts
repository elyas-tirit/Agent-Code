// Shared message protocol + domain types between the extension host and the
// webview UI. Imported by both `src/` (esbuild) and `webview/` (vite).

export type WebviewView = "dashboard" | "design";

/** Real agent run states, mapped from the SDK's session_state_changed. */
export type AgentStatus =
  | "ready" // fresh session, no activity yet
  | "working" // SDK 'running'
  | "awaiting-approval" // SDK 'requires_action' (tool permission pending)
  | "asking" // AskUserQuestion pending (a multiple-choice question)
  | "idle" // finished a turn, can continue
  | "error";

/** Permission modes mirrored from the Claude Agent SDK. */
export type PermissionMode = "default" | "plan" | "acceptEdits" | "bypassPermissions";

/** Reasoning effort levels (Claude Agent SDK). */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

export interface AgentSettings {
  model: string; // "" = default
  thinking: boolean;
  effort: EffortLevel;
}

export const PERMISSION_MODES: { id: PermissionMode; label: string; hint: string }[] = [
  { id: "default", label: "Default", hint: "Chiede conferma per ogni azione" },
  { id: "plan", label: "Plan", hint: "Pianifica senza modificare nulla" },
  { id: "acceptEdits", label: "Auto-edit", hint: "Accetta le modifiche ai file" },
  { id: "bypassPermissions", label: "Auto", hint: "Nessuna conferma (full auto)" },
];

export type CardAccent = "blue" | "yellow" | "neutral" | "red";

export interface AgentAction {
  id: string;
  label: string;
  kind: "primary" | "secondary";
}

export interface AgentCard {
  id: string;
  name: string;
  status: AgentStatus;
  statusLabel: string;
  accent: CardAccent;
  /** Live one-liner (last activity / tool / error). */
  description?: string;
  /** Optional time-remaining-ish hint shown as a pill on the card. */
  metaLabel?: string;
  actions: AgentAction[];
  /** Per-session token totals, used for the dashboard aggregate. */
  tokens?: TokenUsage;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

/** Cumulative token usage for a session (or aggregated across sessions). */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  /** input + output (what the user reads as "tokens used"). */
  total: number;
  costUsd: number;
}

/** A single rate-limit window reported by the SDK (five_hour, seven_day, …). */
export interface RateWindow {
  type: string;
  label: string;
  percent: number;
  resetsInLabel: string;
  known: boolean;
  /** Human status when no % is provided (e.g. "Sotto i limiti"). */
  statusLabel?: string;
}

/** Authenticated account info (from the SDK's accountInfo()). */
export interface AccountInfoLite {
  authMethod: string; // "Claude AI", "API key", "AWS Bedrock", …
  email?: string;
  organization?: string;
  plan?: string; // subscriptionType, e.g. "Claude Team"
}

export interface UsageInfo {
  /** Primary (five-hour) utilization 0–100 — the "Session %" (when the SDK reports it). */
  percent: number;
  resetsInLabel: string;
  /** True once we've received a real utilization value from the SDK. */
  known: boolean;
  /** Session (or aggregate) token totals. */
  tokens?: TokenUsage;
  /** All rate-limit windows, for the detailed usage modal. */
  windows?: RateWindow[];
  /** Authenticated account, for the usage modal. */
  account?: AccountInfoLite;
}

export const EMPTY_TOKENS: TokenUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheCreation: 0,
  total: 0,
  costUsd: 0,
};

export interface ToolDiff {
  file: string;
  before: string;
  after: string;
}

export interface ToolCall {
  id: string;
  name: string;
  summary: string;
  state: "running" | "done" | "denied";
  /** For Edit/Write/MultiEdit — before/after to render an inline diff. */
  diff?: ToolDiff;
}

/** A plan presented by the agent (ExitPlanMode) awaiting approval. */
export interface PlanRequest {
  id: string;
  plan: string;
}

export interface PermissionRequest {
  id: string; // toolUseID
  title: string; // "Claude vuole leggere foo.txt"
  displayName?: string; // "Read file"
  description?: string;
  toolName: string;
  canAlwaysAllow: boolean;
}

export type PermissionDecision = "allow" | "always" | "deny";

// ---------------------------------------------------------------------------
// AskUserQuestion
// ---------------------------------------------------------------------------

export interface QuestionOption {
  label: string;
  description: string;
  preview?: string;
}

export interface QuestionItem {
  question: string;
  header: string;
  multiSelect: boolean;
  options: QuestionOption[];
}

export interface QuestionRequest {
  id: string; // toolUseID
  questions: QuestionItem[];
}

/** question text -> chosen label(s); multi-select answers are comma-separated. */
export type QuestionAnswers = Record<string, string>;

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export type AttachmentKind = "image" | "file" | "figma";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  /** Absolute path on disk (image/file) — appended as @path so Claude reads it. */
  path?: string;
  /** Data URL for in-UI thumbnails (images only). */
  dataUrl?: string;
  /** Figma URL (figma kind). */
  url?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  reasoning?: string;
  streaming?: boolean;
  tools?: ToolCall[];
  attachments?: Attachment[];
}

// ---------------------------------------------------------------------------
// Code view
// ---------------------------------------------------------------------------

export interface CodeNode {
  name: string;
  /** Path relative to the workspace root. */
  path: string;
  type: "file" | "dir";
  children?: CodeNode[];
}

// ---------------------------------------------------------------------------
// Settings panel
// ---------------------------------------------------------------------------

export interface AppSettings {
  userName: string;
  defaultMode: PermissionMode;
  model: string;
  effort: EffortLevel | "";
  thinking: boolean;
  fullAccess: boolean;
  previewUrl: string;
  openDashboardOnStartup: boolean;
}

export interface DashboardState {
  greeting: string;
  usage: UsageInfo;
  agents: AgentCard[];
}

export type DesignMode = "preview" | "design" | "code";

export interface SelectedComponent {
  file?: string;
  line?: number;
  label: string;
  /** Page URL the selection was made on. */
  url?: string;
  /** Device/viewport label (Desktop, iPad, …). */
  device?: string;
  /** Normalized selection rect (0–1) within the preview, if a region was drawn. */
  rect?: { x: number; y: number; w: number; h: number };
  /** DOM info captured by the in-page element picker (when available). */
  tag?: string;
  text?: string;
  selector?: string;
  /** React component name + source (file:line) from the fiber, when available. */
  component?: string;
  source?: string;
}

export interface DesignState {
  title: string;
  status: AgentStatus;
  mode: PermissionMode;
  designMode: DesignMode;
  /** URL shown in the preview URL bar (the real dev server the user typed). */
  previewUrl: string;
  /** What the iframe actually loads: the local proxy that injects the picker.
   *  Empty when the proxy couldn't start → the iframe falls back to previewUrl. */
  proxyUrl?: string;
  usage: UsageInfo;
  messages: ChatMessage[];
  selected?: SelectedComponent;
  pendingPermission?: PermissionRequest;
  pendingQuestion?: QuestionRequest;
  pendingPlan?: PlanRequest;
  settings: AgentSettings;
}

/** Models offered in the settings menu (label → SDK model id; "" = default). */
export const MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: "", label: "Default (consigliato)" },
  { id: "claude-opus-4-8", label: "Opus 4.8" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

export const EFFORT_OPTIONS: EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

// ---------------------------------------------------------------------------
// Extension -> Webview
// ---------------------------------------------------------------------------
export type HostMessage =
  | { type: "init"; view: "dashboard"; state: DashboardState; media: string }
  | { type: "init"; view: "design"; state: DesignState; media: string }
  | { type: "dashboard/state"; state: DashboardState }
  | { type: "usage/update"; usage: UsageInfo }
  | { type: "agent/status"; status: AgentStatus }
  | { type: "agent/title"; title: string }
  | { type: "agent/mode"; mode: PermissionMode }
  | { type: "chat/messageStart"; message: ChatMessage }
  | { type: "chat/append"; delta: string; channel: "text" | "reasoning" }
  | { type: "chat/tool"; tool: ToolCall }
  | { type: "chat/done" }
  | { type: "permission/request"; request: PermissionRequest }
  | { type: "permission/dismiss"; id: string }
  | { type: "question/request"; request: QuestionRequest }
  | { type: "question/dismiss"; id: string }
  | { type: "plan/request"; request: PlanRequest }
  | { type: "plan/dismiss"; id: string }
  | { type: "agent/settings"; settings: AgentSettings }
  | { type: "composer/insert"; text: string }
  | { type: "composer/attach"; attachment: Attachment }
  | { type: "chat/cleared" }
  | { type: "code/tree"; nodes: CodeNode[] }
  | { type: "code/file"; path: string; content: string; language: string }
  | { type: "settings/values"; settings: AppSettings }
  | { type: "preview/proxy"; proxyUrl: string; previewUrl: string };

// ---------------------------------------------------------------------------
// Webview -> Extension
// ---------------------------------------------------------------------------
export type ClientMessage =
  | { type: "ready" }
  | { type: "agent/action"; agentId: string; actionId: string }
  | { type: "agent/open"; agentId: string }
  | { type: "agent/new" }
  | { type: "agent/interrupt" }
  | { type: "nav/back" }
  | { type: "mode/set"; mode: PermissionMode }
  | { type: "permission/respond"; id: string; decision: PermissionDecision }
  | { type: "question/respond"; id: string; answers: QuestionAnswers }
  | { type: "plan/respond"; id: string; approve: boolean }
  | { type: "design/mode"; mode: DesignMode }
  | { type: "design/setUrl"; url: string }
  | { type: "design/selectComponent"; component: SelectedComponent }
  | { type: "chat/send"; text: string; component?: SelectedComponent; attachments?: Attachment[] }
  | { type: "chat/clear" }
  | { type: "context/attach" }
  | { type: "context/attachImage" }
  | { type: "context/attachFigma" }
  | { type: "context/mention" }
  | { type: "image/save"; dataUrl: string; name: string }
  | { type: "code/tree" }
  | { type: "code/open"; path: string }
  | { type: "settings/model"; model: string }
  | { type: "settings/thinking"; enabled: boolean }
  | { type: "settings/effort"; effort: EffortLevel }
  | { type: "settings/openUsage" }
  | { type: "settings/get" }
  | { type: "settings/set"; patch: Partial<AppSettings> };
