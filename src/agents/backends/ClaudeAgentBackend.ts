import {
  AccountInfoLite,
  AgentStatus,
  EffortLevel,
  EMPTY_TOKENS,
  PermissionMode,
  QuestionAnswers,
  QuestionItem,
  RateWindow,
  TokenUsage,
  UsageInfo,
} from "../../shared/protocol";
import {
  AgentBackend,
  AgentEvent,
  AgentEventListener,
  AgentSession,
  ImagePart,
  SpawnOptions,
} from "../types";
import { deriveTitle, diffFromToolInput, summarizeTool } from "../util";

class AsyncQueue<T> implements AsyncIterable<T> {
  private values: T[] = [];
  private resolvers: ((r: IteratorResult<T>) => void)[] = [];
  private closed = false;

  push(value: T): void {
    if (this.closed) return;
    const resolve = this.resolvers.shift();
    if (resolve) resolve({ value, done: false });
    else this.values.push(value);
  }

  close(): void {
    this.closed = true;
    const resolve = this.resolvers.shift();
    if (resolve) resolve({ value: undefined as unknown as T, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.values.length) return Promise.resolve({ value: this.values.shift() as T, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as unknown as T, done: true });
        return new Promise((resolve) => this.resolvers.push(resolve));
      },
    };
  }
}

function userMessage(text: string, images?: ImagePart[]): unknown {
  if (images && images.length) {
    const content = [
      ...images.map((img) => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.dataBase64 },
      })),
      { type: "text", text: text || "(immagine allegata)" },
    ];
    return { type: "user", message: { role: "user", content } };
  }
  return { type: "user", message: { role: "user", content: text } };
}

function mapState(state: string): AgentStatus {
  if (state === "running") return "working";
  if (state === "requires_action") return "awaiting-approval";
  return "idle";
}

const WINDOW_LABELS: Record<string, string> = {
  five_hour: "Sessione (5 ore)",
  seven_day: "Settimanale",
  seven_day_opus: "Settimanale · Opus",
  seven_day_sonnet: "Settimanale · Sonnet",
};

function windowLabel(type: string): string {
  return WINDOW_LABELS[type] ?? type.replace(/_/g, " ");
}

function resetsLabel(resetsAt: unknown): string {
  if (typeof resetsAt !== "number") return "";
  const ms = resetsAt < 1e12 ? resetsAt * 1000 : resetsAt;
  const diff = ms - Date.now();
  if (diff <= 0) return "";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `Reset tra ${d}g ${h % 24}h`;
  return h > 0 ? `Reset tra ${h}h ${m}m` : `Reset tra ${m}m`;
}

const STATUS_LABELS: Record<string, string> = {
  allowed: "Sotto i limiti",
  allowed_warning: "Vicino al limite",
  rejected: "Limite raggiunto",
};

function rateWindow(info: any): RateWindow {
  const hasUtil = typeof info?.utilization === "number";
  const raw = hasUtil ? info.utilization : 0;
  return {
    type: info?.rateLimitType ?? "five_hour",
    label: windowLabel(info?.rateLimitType ?? "five_hour"),
    percent: Math.round(raw <= 1 ? raw * 100 : raw),
    resetsInLabel: resetsLabel(info?.resetsAt),
    known: hasUtil,
    statusLabel: typeof info?.status === "string" ? STATUS_LABELS[info.status] ?? info.status : undefined,
  };
}

function mapAccount(a: any): AccountInfoLite | undefined {
  if (!a) return undefined;
  const providerLabels: Record<string, string> = {
    firstParty: "Claude AI",
    bedrock: "AWS Bedrock",
    vertex: "Google Vertex",
    foundry: "Azure Foundry",
    anthropicAws: "Anthropic AWS",
    mantle: "Mantle",
    gateway: "Gateway",
  };
  const authMethod = a.apiProvider
    ? providerLabels[a.apiProvider] ?? a.apiProvider
    : a.apiKeySource
      ? "API key"
      : "Claude AI";
  return {
    authMethod,
    email: a.email,
    organization: a.organization,
    plan: a.subscriptionType,
  };
}

function num(v: unknown): number {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

export interface ClaudeBackendConfig {
  mode: PermissionMode;
  claudePath?: string;
  /** Maximum capability: disable sandbox, allow dangerous skips, broad dirs. */
  fullAccess: boolean;
  extraDirectories: string[];
  effort?: EffortLevel;
  model?: string;
  /** Figma desktop MCP SSE URL (so the agent can pull Figma designs). */
  figmaMcpUrl?: string;
}

let counter = 0;

interface PendingPermission {
  resolve: (result: unknown) => void;
  suggestions?: unknown[];
}

interface PendingQuestion {
  resolve: (result: unknown) => void;
  input: Record<string, unknown>;
}

class ClaudeSession implements AgentSession {
  readonly id: string;
  private listeners: AgentEventListener[] = [];
  private input = new AsyncQueue<unknown>();
  private queryHandle: any;
  private mode: PermissionMode;
  private model: string | undefined;
  private pending = new Map<string, PendingPermission>();
  private questions = new Map<string, PendingQuestion>();
  private plans = new Map<string, { resolve: (r: unknown) => void }>();
  /** Outstanding permission/question/plan requests, replayed to new listeners. */
  private openReq = new Map<string, AgentEvent>();
  private toolInfo = new Map<string, { name: string; summary: string }>();
  private titled = false;
  private tokens: TokenUsage = { ...EMPTY_TOKENS };
  private windows = new Map<string, RateWindow>();
  private account?: AccountInfoLite;
  private sessionId?: string;
  /** When resuming, the SDK re-emits history — suppress it until the next send. */
  private suppressReplay = false;
  /** Guards the one-shot resume→fresh recovery so we don't loop. */
  private recovered = false;

  constructor(
    private sdk: { query: (args: unknown) => any },
    opts: SpawnOptions,
    private cfg: ClaudeBackendConfig,
  ) {
    this.id = `claude-${++counter}`;
    this.mode = cfg.mode;
    this.model = cfg.model || undefined;
    // Resumed session: history is already on disk → don't re-ingest the replay,
    // and keep the restored title (don't re-derive from the next message).
    this.suppressReplay = Boolean(opts.resume);
    this.titled = Boolean(opts.resume);
    if (opts.prompt) this.queueUser(opts.prompt);
    else this.emit({ kind: "status", status: "ready" });
    void this.run(opts);
  }

  onEvent(listener: AgentEventListener): () => void {
    this.listeners.push(listener);
    // Replay any in-flight request so a panel attaching late (e.g. opened from
    // an OS notification) still gets the modal instead of deadlocking.
    for (const ev of this.openReq.values()) listener(ev);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  send(text: string, images?: ImagePart[]): void {
    this.queueUser(text, images);
    this.emit({ kind: "status", status: "working" });
  }

  private queueUser(text: string, images?: ImagePart[]): void {
    this.suppressReplay = false; // a real user turn → resume replay is over
    if (!this.titled) {
      this.titled = true;
      this.emit({ kind: "title", title: deriveTitle(text) });
    }
    this.input.push(userMessage(text, images));
  }

  respondPermission(id: string, decision: "allow" | "always" | "deny"): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    if (decision === "deny") p.resolve({ behavior: "deny", message: "Rifiutato dall'utente" });
    else if (decision === "always") p.resolve({ behavior: "allow", updatedPermissions: p.suggestions });
    else p.resolve({ behavior: "allow" });
    this.openReq.delete(id);
    this.emit({ kind: "permission-dismiss", id });
  }

  answerQuestion(id: string, answers: QuestionAnswers): void {
    const q = this.questions.get(id);
    if (!q) return;
    this.questions.delete(id);
    // The SDK reads selected answers from the (updated) tool input — verified
    // empirically: tool_result becomes "Your questions have been answered: …".
    q.resolve({ behavior: "allow", updatedInput: { ...q.input, answers } });
    this.openReq.delete(id);
    this.emit({ kind: "question-dismiss", id });
  }

  respondPlan(id: string, approve: boolean): void {
    const p = this.plans.get(id);
    if (!p) return;
    this.plans.delete(id);
    if (approve) p.resolve({ behavior: "allow" }); // exits plan mode → executes
    else p.resolve({ behavior: "deny", message: "Non uscire dal piano: continua a pianificare." });
    this.openReq.delete(id);
    this.emit({ kind: "plan-dismiss", id });
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
    this.emit({ kind: "mode", mode });
    void this.queryHandle?.setPermissionMode?.(mode);
  }

  setModel(model: string): void {
    this.model = model || undefined;
    void this.queryHandle?.setModel?.(this.model);
  }

  setThinking(enabled: boolean): void {
    void this.queryHandle?.setMaxThinkingTokens?.(enabled ? 16000 : 0);
  }

  interrupt(): void {
    void this.queryHandle?.interrupt?.();
  }

  stop(): void {
    this.input.close();
    void this.queryHandle?.interrupt?.();
    this.emit({ kind: "status", status: "idle" });
  }

  private emit(event: AgentEvent): void {
    for (const l of this.listeners) l(event);
  }

  private emitUsage(): void {
    const windows = [...this.windows.values()];
    const primary = this.windows.get("five_hour") ?? windows.find((w) => w.known);
    this.emit({
      kind: "usage",
      usage: {
        percent: primary?.percent ?? 0,
        resetsInLabel: primary?.resetsInLabel ?? "",
        known: primary?.known ?? false,
        tokens: { ...this.tokens },
        windows,
        account: this.account,
      },
    });
  }

  private accrueUsage(usage: any, costUsd: unknown): void {
    if (usage) {
      this.tokens.input += num(usage.input_tokens);
      this.tokens.output += num(usage.output_tokens);
      this.tokens.cacheRead += num(usage.cache_read_input_tokens);
      this.tokens.cacheCreation += num(usage.cache_creation_input_tokens);
      this.tokens.total = this.tokens.input + this.tokens.output;
    }
    this.tokens.costUsd += num(costUsd);
  }

  private canUseTool = (toolName: string, input: Record<string, unknown>, options: any): Promise<unknown> => {
    const id: string = options?.toolUseID ?? `perm-${Math.random().toString(36).slice(2)}`;

    // AskUserQuestion is not a permission — it's a multiple-choice question.
    // We surface a rich question modal and feed the answers back via updatedInput.
    if (toolName === "AskUserQuestion") {
      const questions = (Array.isArray(input?.questions) ? input.questions : []) as QuestionItem[];
      return new Promise((resolve) => {
        this.questions.set(id, { resolve, input });
        this.emit({ kind: "status", status: "asking" });
        const ev: AgentEvent = { kind: "question", request: { id, questions } };
        this.openReq.set(id, ev);
        this.emit(ev);
        options?.signal?.addEventListener?.("abort", () => {
          if (this.questions.has(id)) {
            this.questions.delete(id);
            this.openReq.delete(id);
            resolve({ behavior: "deny", message: "Interrotto" });
            this.emit({ kind: "question-dismiss", id });
          }
        });
      });
    }

    // ExitPlanMode → present the plan and let the user approve/keep planning.
    if (toolName === "ExitPlanMode" || toolName === "exit_plan_mode") {
      const plan = typeof input?.plan === "string" ? input.plan : String(input?.plan ?? "");
      return new Promise((resolve) => {
        this.plans.set(id, { resolve });
        this.emit({ kind: "status", status: "awaiting-approval" });
        const ev: AgentEvent = { kind: "plan", request: { id, plan } };
        this.openReq.set(id, ev);
        this.emit(ev);
        options?.signal?.addEventListener?.("abort", () => {
          if (this.plans.has(id)) {
            this.plans.delete(id);
            this.openReq.delete(id);
            resolve({ behavior: "deny", message: "Interrotto" });
            this.emit({ kind: "plan-dismiss", id });
          }
        });
      });
    }

    return new Promise((resolve) => {
      this.pending.set(id, { resolve, suggestions: options?.suggestions });
      const ev: AgentEvent = {
        kind: "permission",
        request: {
          id,
          title: options?.title ?? `Claude vuole usare ${toolName}`,
          displayName: options?.displayName,
          description: options?.description,
          toolName,
          canAlwaysAllow: Array.isArray(options?.suggestions) && options.suggestions.length > 0,
        },
      };
      this.openReq.set(id, ev);
      this.emit(ev);
      options?.signal?.addEventListener?.("abort", () => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          this.openReq.delete(id);
          resolve({ behavior: "deny", message: "Interrotto" });
          this.emit({ kind: "permission-dismiss", id });
        }
      });
    });
  };

  private async run(opts: SpawnOptions): Promise<void> {
    try {
      this.queryHandle = this.sdk.query({
        prompt: this.input,
        options: {
          cwd: opts.cwd,
          permissionMode: this.mode,
          canUseTool: this.canUseTool,
          ...(opts.resume ? { resume: opts.resume } : {}),
          ...(this.model ? { model: this.model } : {}),
          ...(this.cfg.effort ? { effort: this.cfg.effort } : {}),
          ...(this.cfg.claudePath ? { pathToClaudeCodeExecutable: this.cfg.claudePath } : {}),
          ...(this.cfg.figmaMcpUrl
            ? { mcpServers: { figma: { type: "sse", url: this.cfg.figmaMcpUrl } } }
            : {}),
          // Maximum capability: no sandbox, allow dangerous skips, reach any dir.
          ...(this.cfg.fullAccess
            ? {
                sandbox: { enabled: false },
                allowDangerouslySkipPermissions: true,
                additionalDirectories: this.cfg.extraDirectories,
              }
            : {}),
        },
      });
      this.emit({ kind: "mode", mode: this.mode });
      // Fetch real account info (email / org / plan / auth) — the SDK exposes
      // this even when the rate-limit stream omits the utilization %.
      void this.queryHandle
        ?.accountInfo?.()
        .then((a: unknown) => {
          this.account = mapAccount(a);
          if (this.account) this.emitUsage();
        })
        .catch(() => {});
      for await (const message of this.queryHandle) this.handle(message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Resume target gone (cwd mismatch, pruned history, …) → don't brick the
      // agent: restart fresh in the same cwd. The visible transcript is preserved
      // (we keep it ourselves), only Claude's server-side context is reset.
      if (opts.resume && !this.recovered && /no conversation found|session id/i.test(msg)) {
        this.recovered = true;
        this.suppressReplay = false;
        this.sessionId = undefined;
        this.emit({
          kind: "text",
          delta:
            "\n_(La sessione precedente non era ripristinabile, riparto pulito in questo progetto — la cronologia qui sopra resta visibile.)_\n",
        });
        this.emit({ kind: "done" });
        void this.run({ ...opts, resume: undefined });
        return;
      }
      this.emit({ kind: "error", message: msg });
      this.emit({ kind: "status", status: "idle" });
    }
  }

  private handle(message: any): void {
    if (message?.session_id && !this.sessionId) {
      this.sessionId = message.session_id;
      this.emit({ kind: "session-id", id: message.session_id });
    }
    switch (message?.type) {
      case "assistant": {
        if (this.suppressReplay) break; // resumed-history replay — already on disk
        if (message.error) {
          this.emit({ kind: "error", message: String(message.error) });
          return;
        }
        for (const block of message.message?.content ?? []) {
          if (block?.type === "text" && block.text) this.emit({ kind: "text", delta: block.text });
          else if (block?.type === "thinking" && block.thinking) this.emit({ kind: "reasoning", delta: block.thinking });
          else if (block?.type === "tool_use") {
            const summary = summarizeTool(block.name, block.input ?? {});
            this.toolInfo.set(block.id, { name: block.name, summary });
            const diff = diffFromToolInput(block.name, block.input ?? {});
            this.emit({ kind: "tool", tool: { id: block.id, name: block.name, summary, state: "running", diff } });
            this.emit({ kind: "description", text: `${block.name}: ${summary}` });
          }
        }
        break;
      }
      case "user": {
        if (this.suppressReplay) break; // resumed-history replay
        for (const block of message.message?.content ?? []) {
          if (block?.type === "tool_result" && block.tool_use_id) {
            const info = this.toolInfo.get(block.tool_use_id);
            this.emit({
              kind: "tool",
              tool: {
                id: block.tool_use_id,
                name: info?.name ?? "tool",
                summary: info?.summary ?? "",
                state: block.is_error ? "denied" : "done",
              },
            });
          }
        }
        break;
      }
      case "system": {
        if (message.subtype === "session_state_changed") this.emit({ kind: "status", status: mapState(message.state) });
        else if (message.subtype === "status" && message.permissionMode) {
          this.mode = message.permissionMode;
          this.emit({ kind: "mode", mode: message.permissionMode });
        }
        break;
      }
      case "rate_limit_event": {
        const info = message.rate_limit_info;
        // Keep every window except raw overage; the usage modal shows them all.
        if (info && info.rateLimitType !== "overage") {
          const w = rateWindow(info);
          this.windows.set(w.type, w);
          this.emitUsage();
        }
        break;
      }
      case "result": {
        if (this.suppressReplay) break; // replayed result — don't double-count or finalize
        this.accrueUsage(message.usage, message.total_cost_usd);
        this.emitUsage();
        this.emit({ kind: "status", status: "idle" });
        this.emit({ kind: "done" });
        break;
      }
      default:
        break;
    }
  }
}

export class ClaudeAgentBackend implements AgentBackend {
  readonly id = "claude";

  private constructor(
    private sdk: { query: (args: unknown) => any },
    private cfg: ClaudeBackendConfig,
  ) {}

  static async tryCreate(cfg: ClaudeBackendConfig): Promise<ClaudeAgentBackend | null> {
    try {
      const sdkModule = "@anthropic-ai/claude-agent-sdk";
      const sdk: any = await import(sdkModule);
      if (typeof sdk?.query !== "function") return null;
      return new ClaudeAgentBackend(sdk, cfg);
    } catch {
      return null;
    }
  }

  async spawn(opts: SpawnOptions): Promise<AgentSession> {
    return new ClaudeSession(this.sdk, opts, this.cfg);
  }
}
