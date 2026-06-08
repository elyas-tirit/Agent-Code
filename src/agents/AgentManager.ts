import {
  AgentAction,
  AgentCard,
  AgentStatus,
  Attachment,
  CardAccent,
  ChatMessage,
  DashboardState,
  EMPTY_TOKENS,
  PermissionDecision,
  PermissionMode,
  QuestionAnswers,
  TokenUsage,
  UsageInfo,
} from "../shared/protocol";
import { AgentBackend, AgentSession, SpawnOptions } from "./types";
import { MockBackend } from "./backends/MockBackend";
import { ClaudeAgentBackend, ClaudeBackendConfig } from "./backends/ClaudeAgentBackend";
import { addUserMessage, applyAgentEvent } from "./transcript";

export type BackendChoice = "auto" | "mock" | "claude";
type ChangeListener = (state: DashboardState) => void;

/** Serialized agent for cross-restart persistence. */
export interface PersistedAgent {
  id: string;
  name: string;
  sdkSessionId?: string;
  /** The cwd the agent was created in. Claude Code indexes sessions by directory,
   *  so we MUST resume with the original cwd (not the currently-open folder),
   *  otherwise the resume can't find the conversation. */
  cwd?: string;
  messages: ChatMessage[];
  tokens?: TokenUsage;
}

function accentForStatus(status: AgentStatus): CardAccent {
  switch (status) {
    case "ready":
    case "idle":
      return "blue";
    case "awaiting-approval":
    case "asking":
      return "yellow";
    case "error":
      return "red";
    default:
      return "neutral";
  }
}

function labelForStatus(status: AgentStatus): string {
  switch (status) {
    case "ready":
    case "idle":
      return "In attesa di ordini";
    case "working":
      return "Sta lavorando";
    case "awaiting-approval":
    case "asking":
      return "Human Request";
    case "error":
      return "Errore";
  }
}

function actionsForStatus(status: AgentStatus): AgentAction[] {
  switch (status) {
    case "awaiting-approval":
    case "asking":
      return [
        { id: "controlla", label: "Controlla", kind: "primary" },
        { id: "autonomo", label: "Autonomo", kind: "secondary" },
      ];
    case "working":
      return [];
    case "error":
      return [
        { id: "apri", label: "Riapri", kind: "primary" },
        { id: "fire-agent", label: "Elimina", kind: "secondary" },
      ];
    default:
      return [
        { id: "apri", label: "Nuovi ordini", kind: "primary" },
        { id: "fire-agent", label: "Fire Agent", kind: "secondary" },
      ];
  }
}

function statusRank(status: AgentStatus): number {
  switch (status) {
    case "awaiting-approval":
    case "asking":
      return 0;
    case "idle":
    case "ready":
      return 1;
    case "error":
      return 2;
    default:
      return 3;
  }
}

function addTokens(a: TokenUsage, b?: TokenUsage): TokenUsage {
  if (!b) return a;
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheCreation: a.cacheCreation + b.cacheCreation,
    total: a.total + b.total,
    costUsd: a.costUsd + b.costUsd,
  };
}

let agentCounter = 0;
const newAgentId = () => `agent-${Date.now().toString(36)}-${++agentCounter}`;

export class AgentManager {
  // Keyed by a STABLE agentId (≠ the SDK session id, which changes on wake/resume).
  private cards = new Map<string, AgentCard>();
  private sessions = new Map<string, AgentSession>();
  private transcripts = new Map<string, ChatMessage[]>();
  private sdkSessionIds = new Map<string, string>();
  // The cwd each agent was created in — resume MUST use this, not the current folder.
  private agentCwds = new Map<string, string | undefined>();
  private waking = new Map<string, Promise<AgentSession | undefined>>();
  private listeners: ChangeListener[] = [];
  private attention: ((info: { agentId: string; name: string; message: string }) => void)[] = [];
  private usage: UsageInfo = { percent: 0, resetsInLabel: "", known: false };
  private onPersistCb?: (agents: PersistedAgent[]) => void;
  private persistTimer: ReturnType<typeof setTimeout> | undefined;

  private constructor(
    public readonly backend: AgentBackend,
    private cwd: string | undefined,
    private userName: string,
  ) {}

  static async create(
    choice: BackendChoice,
    cwd: string | undefined,
    userName: string,
    claudeCfg: ClaudeBackendConfig,
  ): Promise<AgentManager> {
    let backend: AgentBackend | null = null;
    if (choice === "claude" || choice === "auto") backend = await ClaudeAgentBackend.tryCreate(claudeCfg);
    if (!backend) backend = new MockBackend();
    return new AgentManager(backend, cwd, userName);
  }

  // --- greeting --------------------------------------------------------------
  private hourGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return "Buongiorno";
    if (h < 18) return "Buon pomeriggio";
    return "Buonasera";
  }
  get greeting(): string {
    return this.userName ? `${this.hourGreeting()}, ${this.userName}` : this.hourGreeting();
  }

  // --- subscriptions ---------------------------------------------------------
  onDidChange(listener: ChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
  private notify(): void {
    const state = this.getDashboardState();
    for (const l of this.listeners) l(state);
  }
  onAttention(cb: (info: { agentId: string; name: string; message: string }) => void): () => void {
    this.attention.push(cb);
    return () => {
      this.attention = this.attention.filter((c) => c !== cb);
    };
  }
  private notifyAttention(agentId: string, name: string, message: string): void {
    for (const cb of this.attention) cb({ agentId, name, message });
  }

  // --- persistence -----------------------------------------------------------
  onPersist(cb: (agents: PersistedAgent[]) => void): void {
    this.onPersistCb = cb;
  }
  private toPersisted(): PersistedAgent[] {
    return [...this.cards.keys()].map((id) => ({
      id,
      name: this.cards.get(id)!.name,
      sdkSessionId: this.sdkSessionIds.get(id),
      cwd: this.agentCwds.get(id),
      messages: this.transcripts.get(id) ?? [],
      tokens: this.cards.get(id)!.tokens,
    }));
  }
  private persist(): void {
    if (!this.onPersistCb) return;
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.onPersistCb?.(this.toPersisted()), 400);
  }
  /** Write immediately (on remove / shutdown) so a debounced write isn't lost. */
  flush(): void {
    if (!this.onPersistCb) return;
    clearTimeout(this.persistTimer);
    this.onPersistCb(this.toPersisted());
  }

  /** Recreate dormant cards + transcripts from disk (no live sessions spawned). */
  restore(agents: PersistedAgent[]): void {
    for (const a of agents) {
      this.cards.set(a.id, {
        id: a.id,
        name: a.name,
        status: "idle",
        statusLabel: labelForStatus("idle"),
        accent: accentForStatus("idle"),
        actions: actionsForStatus("idle"),
      });
      // Restored history is settled — clear any leftover streaming flag.
      this.transcripts.set(a.id, (a.messages ?? []).map((m) => ({ ...m, streaming: false })));
      if (a.sdkSessionId) this.sdkSessionIds.set(a.id, a.sdkSessionId);
      // Keep the entry even when undefined so getOrWakeSession knows it was restored.
      this.agentCwds.set(a.id, a.cwd);
      if (a.tokens) this.cards.get(a.id)!.tokens = a.tokens;
    }
    this.notify();
  }

  // --- usage / state ---------------------------------------------------------
  private aggregateUsage(): UsageInfo {
    let tokens: TokenUsage = { ...EMPTY_TOKENS };
    for (const c of this.cards.values()) tokens = addTokens(tokens, c.tokens);
    return { ...this.usage, tokens };
  }
  getDashboardState(): DashboardState {
    const agents = [...this.cards.values()].sort((a, b) => statusRank(a.status) - statusRank(b.status));
    return { greeting: this.greeting, usage: this.aggregateUsage(), agents };
  }
  getUsage(): UsageInfo {
    return this.usage;
  }
  getCard(agentId: string): AgentCard | undefined {
    return this.cards.get(agentId);
  }
  getTranscript(agentId: string): ChatMessage[] {
    return this.transcripts.get(agentId) ?? [];
  }

  private setCardStatus(c: AgentCard, status: AgentStatus): void {
    c.status = status;
    c.statusLabel = labelForStatus(status);
    c.accent = accentForStatus(status);
    c.actions = actionsForStatus(status);
  }

  // --- session wiring --------------------------------------------------------
  private attach(agentId: string, session: AgentSession): void {
    const transcript = this.transcripts.get(agentId) ?? (this.transcripts.set(agentId, []), this.transcripts.get(agentId)!);
    session.onEvent((event) => {
      const c = this.cards.get(agentId);
      if (!c) return;

      // Canonical transcript (assistant side) for history/persistence.
      if (applyAgentEvent(transcript, event)) this.persist();

      switch (event.kind) {
        case "status":
          this.setCardStatus(c, event.status);
          break;
        case "title":
          c.name = event.title;
          this.persist();
          break;
        case "session-id":
          this.sdkSessionIds.set(agentId, event.id);
          this.persist();
          break;
        case "description":
          c.description = event.text;
          break;
        case "permission":
          this.setCardStatus(c, "awaiting-approval");
          c.description = `Vuole: ${event.request.displayName ?? event.request.toolName}`;
          this.notifyAttention(agentId, c.name, `Approvazione: ${event.request.displayName ?? event.request.toolName}`);
          break;
        case "permission-dismiss":
          if (c.status === "awaiting-approval") this.setCardStatus(c, "working");
          break;
        case "question":
          this.setCardStatus(c, "asking");
          c.description = event.request.questions[0]?.question ?? "Ha una domanda per te";
          this.notifyAttention(agentId, c.name, event.request.questions[0]?.question ?? "Ti sta facendo una domanda");
          break;
        case "question-dismiss":
          if (c.status === "asking") this.setCardStatus(c, "working");
          break;
        case "plan":
          this.setCardStatus(c, "awaiting-approval");
          c.description = "Piano pronto — attende la tua approvazione";
          this.notifyAttention(agentId, c.name, "Ha un piano da approvare");
          break;
        case "plan-dismiss":
          if (c.status === "awaiting-approval") this.setCardStatus(c, "working");
          break;
        case "usage": {
          const u = event.usage;
          this.usage = {
            percent: u.known ? u.percent : this.usage.percent,
            resetsInLabel: u.resetsInLabel || this.usage.resetsInLabel,
            known: u.known || this.usage.known,
            windows: u.windows && u.windows.length ? u.windows : this.usage.windows,
            account: u.account ?? this.usage.account,
          };
          if (u.tokens) c.tokens = u.tokens;
          break;
        }
        case "error":
          c.description = event.message;
          break;
        default:
          // text/reasoning/tool/done/mode: already folded into the transcript;
          // no card change → skip the dashboard re-render.
          return;
      }
      this.notify();
    });
  }

  // --- agent lifecycle -------------------------------------------------------
  async newAgent(prompt?: string): Promise<string> {
    const agentId = newAgentId();
    const session = await this.backend.spawn({ name: "Nuova conversazione", prompt, cwd: this.cwd });
    const status: AgentStatus = prompt ? "working" : "ready";
    this.cards.set(agentId, {
      id: agentId,
      name: "Nuova conversazione",
      status,
      statusLabel: labelForStatus(status),
      accent: accentForStatus(status),
      actions: actionsForStatus(status),
    });
    this.transcripts.set(agentId, []);
    this.agentCwds.set(agentId, this.cwd);
    this.sessions.set(agentId, session);
    if (prompt) addUserMessage(this.transcripts.get(agentId)!, prompt);
    this.attach(agentId, session);
    this.notify();
    this.persist();
    return agentId;
  }

  /** Live session if present, else wake the dormant agent (resuming context). */
  async getOrWakeSession(agentId: string): Promise<AgentSession | undefined> {
    const live = this.sessions.get(agentId);
    if (live) return live;
    // Coalesce concurrent wakes so we never spawn the same agent twice.
    const inflight = this.waking.get(agentId);
    if (inflight) return inflight;
    const card = this.cards.get(agentId);
    if (!card) return undefined;
    const p = (async (): Promise<AgentSession> => {
      const session = await this.backend.spawn({
        name: card.name,
        // Resume under the agent's ORIGINAL cwd — Claude Code stores sessions per
        // directory, so the current workspace folder would look in the wrong place.
        // Agents created before cwd was tracked fall back to the current folder.
        cwd: this.agentCwds.get(agentId) ?? this.cwd,
        resume: this.sdkSessionIds.get(agentId),
      });
      this.sessions.set(agentId, session);
      this.attach(agentId, session);
      return session;
    })();
    this.waking.set(agentId, p);
    try {
      return await p;
    } finally {
      this.waking.delete(agentId);
    }
  }

  getSession(agentId: string): AgentSession | undefined {
    return this.sessions.get(agentId);
  }

  async spawnDetached(opts: SpawnOptions): Promise<AgentSession> {
    return this.backend.spawn({ ...opts, cwd: opts.cwd ?? this.cwd });
  }

  /** Record a user turn in the canonical transcript (call before sending). */
  appendUserMessage(agentId: string, text: string, attachments?: Attachment[]): void {
    const t = this.transcripts.get(agentId);
    if (!t) return;
    addUserMessage(t, text, attachments);
    this.persist();
  }

  async sendTo(agentId: string, text: string): Promise<void> {
    (await this.getOrWakeSession(agentId))?.send(text);
  }

  respondPermission(agentId: string, id: string, decision: PermissionDecision): void {
    this.sessions.get(agentId)?.respondPermission(id, decision);
  }
  answerQuestion(agentId: string, id: string, answers: QuestionAnswers): void {
    this.sessions.get(agentId)?.answerQuestion(id, answers);
  }
  async setMode(agentId: string, mode: PermissionMode): Promise<void> {
    (await this.getOrWakeSession(agentId))?.setMode(mode);
  }
  setModel(agentId: string, model: string): void {
    this.sessions.get(agentId)?.setModel(model);
  }
  setThinking(agentId: string, enabled: boolean): void {
    this.sessions.get(agentId)?.setThinking(enabled);
  }
  interrupt(agentId: string): void {
    this.sessions.get(agentId)?.interrupt();
  }
  stop(agentId: string): void {
    this.sessions.get(agentId)?.stop();
  }

  remove(agentId: string): void {
    this.sessions.get(agentId)?.stop();
    this.sessions.delete(agentId);
    this.cards.delete(agentId);
    this.transcripts.delete(agentId);
    this.sdkSessionIds.delete(agentId);
    this.agentCwds.delete(agentId);
    this.notify();
    this.flush();
  }

  /** Seed a few mock conversations so the dashboard isn't empty in demo mode. */
  async seedDemo(): Promise<void> {
    await this.newAgent();
    await this.newAgent("Sistema il layout della homepage");
    await this.newAgent("Aggiungi la validazione al form di checkout");
    await this.newAgent("Refactor del modulo di autenticazione");
    this.notify();
  }
}
