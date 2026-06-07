import { PermissionMode } from "../../shared/protocol";
import {
  AgentBackend,
  AgentEvent,
  AgentEventListener,
  AgentSession,
  ImagePart,
  SpawnOptions,
} from "../types";
import { deriveTitle } from "../util";

let counter = 0;

/** Simulated session mirroring the real event flow (incl. an approval modal). */
class MockSession implements AgentSession {
  readonly id: string;
  private listeners: AgentEventListener[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private titled = false;
  private mode: PermissionMode = "default";

  constructor(opts: SpawnOptions) {
    this.id = `mock-${++counter}`;
    this.at(0, () => this.emit({ kind: "session-id", id: `sess-${this.id}` }));
    this.at(0, () =>
      this.emit({
        kind: "usage",
        usage: { percent: 9, resetsInLabel: "Resets in 3h", known: true },
      }),
    );
    if (opts.prompt) this.at(0, () => this.run(opts.prompt!));
    else this.at(0, () => this.emit({ kind: "status", status: "ready" }));
  }

  private openReq = new Map<string, AgentEvent>();

  onEvent(listener: AgentEventListener): () => void {
    this.listeners.push(listener);
    for (const ev of this.openReq.values()) listener(ev);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  send(text: string, _images?: ImagePart[]): void {
    this.run(text);
  }

  answerQuestion(id: string, answers: Record<string, string>): void {
    this.emit({ kind: "question-dismiss", id });
    this.emit({ kind: "status", status: "working" });
    const picked = Object.values(answers).join(", ") || "—";
    const words = `Perfetto, procedo con: ${picked}. `.split(" ");
    words.forEach((w, i) => this.at(i * 70, () => this.emit({ kind: "text", delta: w + " " })));
    this.at(words.length * 70 + 200, () => this.finish());
  }

  respondPlan(id: string, approve: boolean): void {
    this.emit({ kind: "plan-dismiss", id });
    if (!approve) {
      this.emit({ kind: "text", delta: "\nOk, continuo a pianificare." });
      this.finish();
      return;
    }
    this.emit({ kind: "status", status: "working" });
    this.emit({ kind: "tool", tool: { id: "pe1", name: "Edit", summary: "src/pages/Home.tsx", state: "running", diff: { file: "src/pages/Home.tsx", before: "<div className=\"hero\">", after: "<div className=\"hero grid gap-6\">" } } });
    this.at(700, () => this.emit({ kind: "tool", tool: { id: "pe1", name: "Edit", summary: "src/pages/Home.tsx", state: "done", diff: { file: "src/pages/Home.tsx", before: "<div className=\"hero\">", after: "<div className=\"hero grid gap-6\">" } } }));
    const words = "Eseguo il piano: ho allineato la griglia della hero. ".split(" ");
    words.forEach((w, i) => this.at(900 + i * 80, () => this.emit({ kind: "text", delta: w + " " })));
    this.at(900 + words.length * 80 + 200, () => this.finish());
  }

  respondPermission(id: string, decision: "allow" | "always" | "deny"): void {
    this.emit({ kind: "permission-dismiss", id });
    if (decision === "deny") {
      this.emit({ kind: "text", delta: "\nOk, non eseguo il comando." });
      this.finish();
      return;
    }
    this.emit({ kind: "status", status: "working" });
    this.emit({ kind: "tool", tool: { id: "t2", name: "Bash", summary: "npm test", state: "running" } });
    this.at(900, () =>
      this.emit({ kind: "tool", tool: { id: "t2", name: "Bash", summary: "npm test", state: "done" } }),
    );
    const words = "Fatto. I test passano e ho aggiornato il componente come richiesto. ".split(" ");
    words.forEach((w, i) => this.at(1000 + i * 90, () => this.emit({ kind: "text", delta: w + " " })));
    this.at(1000 + words.length * 90 + 200, () => this.finish());
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
    this.emit({ kind: "mode", mode });
  }

  setModel(_model: string): void {
    /* mock: no-op */
  }

  setThinking(_enabled: boolean): void {
    /* mock: no-op */
  }

  interrupt(): void {
    this.clear();
    this.emit({ kind: "text", delta: "\n[interrotto]" });
    this.finish();
  }

  stop(): void {
    this.clear();
    this.emit({ kind: "status", status: "idle" });
  }

  private finish(): void {
    this.emit({ kind: "status", status: "idle" });
    this.emit({ kind: "done" });
  }

  private emit(event: AgentEvent): void {
    if (event.kind === "permission" || event.kind === "question" || event.kind === "plan") {
      this.openReq.set(event.request.id, event);
    } else if (event.kind === "permission-dismiss" || event.kind === "question-dismiss" || event.kind === "plan-dismiss") {
      this.openReq.delete(event.id);
    }
    for (const l of this.listeners) l(event);
  }

  private clear(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private at(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  private run(text: string): void {
    this.clear();
    if (!this.titled) {
      this.titled = true;
      this.emit({ kind: "title", title: deriveTitle(text) });
    }
    this.emit({ kind: "status", status: "working" });
    this.emit({ kind: "mode", mode: this.mode });
    this.emit({
      kind: "usage",
      usage: {
        percent: 9,
        resetsInLabel: "Reset tra 3h",
        known: true,
        tokens: { input: 18420, output: 5234, cacheRead: 120400, cacheCreation: 8200, total: 23654, costUsd: 0.34 },
        account: { authMethod: "Claude AI", email: "elyas.t@veliu.com", organization: "Veliu", plan: "Claude Team" },
        windows: [
          { type: "five_hour", label: "Sessione (5 ore)", percent: 9, resetsInLabel: "Reset tra 3h", known: true },
          { type: "seven_day", label: "Settimanale", percent: 34, resetsInLabel: "Reset tra 4g 6h", known: true },
          { type: "seven_day_sonnet", label: "Settimanale · Sonnet", percent: 0, resetsInLabel: "", known: false, statusLabel: "Sotto i limiti" },
        ],
      },
    });

    // A message ending with "?" demoes the AskUserQuestion modal.
    if (text.trim().endsWith("?")) {
      this.at(600, () => {
        this.emit({ kind: "status", status: "asking" });
        this.emit({
          kind: "question",
          request: {
            id: "q1",
            questions: [
              {
                question: "Quale approccio preferisci per questa modifica?",
                header: "Approccio",
                multiSelect: false,
                options: [
                  { label: "Minimale", description: "Cambia solo lo stretto necessario, basso rischio." },
                  { label: "Refactor", description: "Riorganizza il componente per renderlo più pulito." },
                  { label: "Riscrittura", description: "Ricostruisce il componente da zero seguendo il design." },
                ],
              },
            ],
          },
        });
      });
      return;
    }

    const reasoning = "Analizzo la richiesta e preparo le modifiche. ".split(" ");
    reasoning.forEach((w, i) => this.at(i * 80, () => this.emit({ kind: "reasoning", delta: w + " " })));

    const t0 = reasoning.length * 80 + 200;
    this.at(t0, () =>
      this.emit({ kind: "tool", tool: { id: "t1", name: "Read", summary: "src/App.tsx", state: "running" } }),
    );
    this.at(t0 + 700, () =>
      this.emit({ kind: "tool", tool: { id: "t1", name: "Read", summary: "src/App.tsx", state: "done" } }),
    );

    const intro = "Ho letto il file. Per procedere vorrei eseguire i test. ".split(" ");
    intro.forEach((w, i) => this.at(t0 + 800 + i * 80, () => this.emit({ kind: "text", delta: w + " " })));

    // In bypass mode there's no prompt; otherwise raise an approval request.
    const t1 = t0 + 800 + intro.length * 80 + 200;
    if (this.mode === "plan") {
      this.at(t1, () => {
        this.emit({ kind: "status", status: "awaiting-approval" });
        this.emit({
          kind: "plan",
          request: {
            id: "plan1",
            plan: "## Piano\n\n1. Allineare la griglia della hero (CSS grid, gap 6)\n2. Rendere i bottoni full-width su mobile\n3. Aggiungere i test di layout\n\nProcedo?",
          },
        });
      });
    } else if (this.mode === "bypassPermissions") {
      this.at(t1, () => this.respondPermission("p1", "allow"));
    } else {
      this.at(t1, () => {
        this.emit({ kind: "status", status: "awaiting-approval" });
        this.emit({
          kind: "permission",
          request: {
            id: "p1",
            title: "Claude vuole eseguire: npm test",
            displayName: "Esegui comando",
            description: "Eseguirà il comando nella shell del progetto.",
            toolName: "Bash",
            canAlwaysAllow: true,
          },
        });
      });
    }
  }
}

export class MockBackend implements AgentBackend {
  readonly id = "mock";
  async spawn(opts: SpawnOptions): Promise<AgentSession> {
    return new MockSession(opts);
  }
}
