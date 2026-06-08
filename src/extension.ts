import * as vscode from "vscode";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AgentManager, BackendChoice, PersistedAgent } from "./agents/AgentManager";
import type { EffortLevel, PermissionMode } from "./shared/protocol";
import { AgentsDashboardPanel } from "./panels/AgentsDashboardPanel";
import { DesignWorkspacePanel } from "./panels/DesignWorkspacePanel";
import { JsonFileStore } from "./persistence";
import { resolveLang, setHostLang, t } from "./i18n";

let manager: AgentManager | undefined;
let managerPromise: Promise<AgentManager> | undefined;
let store: JsonFileStore<PersistedAgent[]> | undefined;

function resolveClaudePath(configured: string): string | undefined {
  if (configured && fs.existsSync(configured)) return configured;
  const home = os.homedir();
  // Best-effort auto-detect per platform. If none match (e.g. `claude` is only on
  // PATH), we leave it undefined and the SDK resolves it from PATH. Users can always
  // set `agentCode.claudePath` explicitly.
  const candidates =
    process.platform === "win32"
      ? [
          path.join(process.env.APPDATA ?? "", "npm", "claude.cmd"),
          path.join(process.env.APPDATA ?? "", "npm", "claude.exe"),
          path.join(home, ".claude", "local", "claude.exe"),
          path.join(home, "AppData", "Local", "Programs", "claude", "claude.exe"),
        ]
      : [
          "/opt/homebrew/bin/claude",
          "/usr/local/bin/claude",
          path.join(home, ".claude", "local", "claude"),
          path.join(home, ".local", "bin", "claude"),
        ];
  return candidates.find((p) => p && fs.existsSync(p));
}

function formatTokens(total: number): string {
  return total >= 1000 ? `${(total / 1000).toFixed(1)}k` : `${total}`;
}

function resolveUserName(configured: string): string {
  if (configured.trim()) return configured.trim();
  const raw = os.userInfo().username || "";
  const first = raw.split(/[.\-_ ]/)[0] || raw;
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

function getManager(context: vscode.ExtensionContext): Promise<AgentManager> {
  // Memoize the PROMISE (not the resolved value) so concurrent callers on
  // activate/reload share one construction instead of racing to build twice.
  return (managerPromise ??= buildManager(context));
}

async function buildManager(context: vscode.ExtensionContext): Promise<AgentManager> {
  const cfg = vscode.workspace.getConfiguration("agentCode");
  const choice = cfg.get<BackendChoice>("backend", "auto");
  const claudePath = resolveClaudePath(cfg.get<string>("claudePath", ""));
  const userName = resolveUserName(cfg.get<string>("userName", ""));
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const fullAccess = cfg.get<boolean>("fullAccess", true);
  const effort = cfg.get<string>("effort", "");

  manager = await AgentManager.create(choice, cwd, userName, {
    mode: cfg.get<PermissionMode>("defaultMode", "bypassPermissions"),
    claudePath,
    fullAccess,
    // Full access → reach any project under home (e.g. other repos), not just cwd.
    extraDirectories: fullAccess ? [os.homedir()] : [],
    effort: effort ? (effort as EffortLevel) : undefined,
    model: cfg.get<string>("model", "") || undefined,
    figmaMcpUrl: cfg.get<string>("figmaMcpUrl", "http://127.0.0.1:3845/sse") || undefined,
  });

  // Persist agents + transcripts to a file in globalStorage (long transcripts
  // would bloat globalState, which re-serializes its whole blob on every write).
  store = new JsonFileStore<PersistedAgent[]>(
    path.join(context.globalStorageUri.fsPath, "agents.json"),
  );
  // One-time migration of any data from the previous globalState location.
  const legacy = context.globalState.get<PersistedAgent[]>("agentCode.agents");
  if (legacy && legacy.length && !store.exists()) {
    await store.write(legacy);
    await context.globalState.update("agentCode.agents", undefined);
  }
  manager.onPersist((agents) => void store!.write(agents));
  const saved = store.read([]);
  if (saved.length) manager.restore(saved);

  // OS notification when an agent needs you — only when the window is NOT
  // focused, so you can step away and get pinged (no spam while you watch).
  manager.onAttention(({ agentId, name, message }) => {
    if (vscode.window.state.focused) return;
    const open = t("Open", "Apri");
    void vscode.window.showWarningMessage(`${name} — ${message}`, open).then((sel) => {
      if (sel === open && manager) DesignWorkspacePanel.createOrShow(context, manager, agentId);
    });
  });

  // Feed the Phase-3 fork's title-bar "Session" pill with live usage. Best-effort
  // and de-duped: the `agentCode.titlebarStatus` command only exists in the fork,
  // so in plain VS Code this rejects and we swallow it (no pill, no harm).
  let lastTitlebar = "";
  manager.onDidChange((state) => {
    const u = state.usage;
    const label = u.known
      ? `Session ${Math.round(u.percent)}%`
      : u.tokens && u.tokens.total > 0
        ? `${formatTokens(u.tokens.total)} token`
        : "";
    if (label === lastTitlebar) return;
    lastTitlebar = label;
    void vscode.commands.executeCommand("agentCode.titlebarStatus", label).then(undefined, () => {});
  });

  if (saved.length === 0 && manager.backend.id === "mock") {
    await manager.seedDemo();
  }
  surfaceBackendStatus(context, manager, choice, claudePath);
  return manager;
}

/**
 * Make the backend state visible instead of silently falling into mock. Shows a
 * persistent status-bar item and — when the user wanted real Claude but we fell
 * back to the simulated backend — an actionable warning.
 */
function surfaceBackendStatus(
  context: vscode.ExtensionContext,
  mgr: AgentManager,
  choice: BackendChoice,
  claudePath: string | undefined,
): void {
  const real = mgr.backend.id !== "mock";
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  if (real) {
    item.text = "$(sparkle) Agent Code";
    item.tooltip = t(
      "Real Claude agents active (login with your Claude subscription).",
      "Agenti Claude reali attivi (login del tuo abbonamento Claude).",
    );
  } else {
    item.text = t("$(warning) Agent Code: simulated", "$(warning) Agent Code: simulato");
    item.tooltip = t(
      "Claude Code unavailable — simulated agents (mock). Click for settings.",
      "Claude Code non disponibile — agenti simulati (mock). Clicca per le impostazioni.",
    );
  }
  item.command = { title: t("Settings", "Impostazioni"), command: "workbench.action.openSettings", arguments: ["agentCode"] };
  item.show();
  context.subscriptions.push(item);

  if (!real && choice !== "mock") {
    const howTo = t("How to enable it", "Come attivarlo");
    const settings = t("Settings", "Impostazioni");
    void vscode.window
      .showWarningMessage(
        t(
          "Agent Code is using simulated agents (mock): Claude Code is unavailable (SDK not loaded or login missing). Responses are fake until you enable it.",
          "Agent Code sta usando agenti simulati (mock): Claude Code non è disponibile (SDK non caricato o login mancante). Le risposte sono finte finché non lo attivi.",
        ),
        howTo,
        settings,
      )
      .then((sel) => {
        if (sel === settings) {
          void vscode.commands.executeCommand("workbench.action.openSettings", "agentCode");
        } else if (sel === howTo) {
          void vscode.env.openExternal(vscode.Uri.parse("https://docs.claude.com/claude-code"));
        }
      });
  } else if (real && !claudePath) {
    // SDK loaded but no `claude` CLI found on disk → agents may fail until login.
    void vscode.window.showInformationMessage(
      t(
        "Agent Code: SDK ready, but I couldn't find the `claude` CLI. If agents fail, log in to Claude Code (or set `agentCode.claudePath`).",
        "Agent Code: SDK pronto, ma non ho trovato il CLI `claude`. Se gli agenti falliscono, esegui il login a Claude Code (o imposta `agentCode.claudePath`).",
      ),
    );
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Resolve the UI language up front (host strings + bootstrap), and keep it in
  // sync when the user changes it from Settings.
  const applyLang = (): "en" | "it" => {
    const lang = resolveLang(
      vscode.workspace.getConfiguration("agentCode").get<string>("language", "auto"),
      vscode.env.language,
    );
    setHostLang(lang);
    return lang;
  };
  applyLang();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("agentCode.language")) return;
      const lang = applyLang();
      AgentsDashboardPanel.broadcastLang(lang);
      DesignWorkspacePanel.broadcastLang(lang);
      manager?.refresh(); // re-emit host-rendered labels (greeting, card states)
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentCode.openDashboard", async () => {
      AgentsDashboardPanel.createOrShow(context, await getManager(context));
    }),
    vscode.commands.registerCommand("agentCode.openDesignWorkspace", async () => {
      DesignWorkspacePanel.createOrShow(context, await getManager(context));
    }),
    vscode.commands.registerCommand("agentCode.newAgent", async () => {
      const m = await getManager(context);
      const id = await m.newAgent();
      DesignWorkspacePanel.createOrShow(context, m, id);
    }),
    vscode.commands.registerCommand("agentCode.toggleImmersive", async () => {
      AgentsDashboardPanel.createOrShow(context, await getManager(context));
      await vscode.commands.executeCommand("workbench.action.toggleZenMode");
    }),
  );

  // On window reload, revive the dashboard (with restored agents) and drop dead
  // design tabs instead of leaving "cannot restore" placeholders.
  const reviver = (viewType: "agentCode.dashboard" | "agentCode.design") =>
    vscode.window.registerWebviewPanelSerializer(viewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        panel.dispose();
        if (viewType === "agentCode.dashboard") {
          AgentsDashboardPanel.createOrShow(context, await getManager(context));
        }
      },
    });
  context.subscriptions.push(reviver("agentCode.dashboard"), reviver("agentCode.design"));

  const openOnStartup = vscode.workspace
    .getConfiguration("agentCode")
    .get<boolean>("openDashboardOnStartup", true);
  if (openOnStartup) {
    AgentsDashboardPanel.createOrShow(context, await getManager(context));
  }
}

export function deactivate(): void {
  manager?.flush(); // push the latest snapshot into the store…
  store?.flushSync(); // …and write it to disk synchronously before we exit
  manager = undefined;
  managerPromise = undefined;
  store = undefined;
}
