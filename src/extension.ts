import * as vscode from "vscode";
import * as fs from "node:fs";
import * as os from "node:os";
import { AgentManager, BackendChoice, PersistedAgent } from "./agents/AgentManager";
import type { EffortLevel, PermissionMode } from "./shared/protocol";
import { AgentsDashboardPanel } from "./panels/AgentsDashboardPanel";
import { DesignWorkspacePanel } from "./panels/DesignWorkspacePanel";

let manager: AgentManager | undefined;
let managerPromise: Promise<AgentManager> | undefined;

function resolveClaudePath(configured: string): string | undefined {
  if (configured && fs.existsSync(configured)) return configured;
  const candidates = [
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    `${os.homedir()}/.claude/local/claude`,
    `${os.homedir()}/.local/bin/claude`,
  ];
  return candidates.find((p) => fs.existsSync(p));
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

  // Persist agents + transcripts so they survive reloads/restarts.
  manager.onPersist((agents) => void context.globalState.update("agentCode.agents", agents));
  const saved = context.globalState.get<PersistedAgent[]>("agentCode.agents", []);
  if (saved.length) manager.restore(saved);

  // OS notification when an agent needs you — only when the window is NOT
  // focused, so you can step away and get pinged (no spam while you watch).
  manager.onAttention(({ agentId, name, message }) => {
    if (vscode.window.state.focused) return;
    void vscode.window.showWarningMessage(`${name} — ${message}`, "Apri").then((sel) => {
      if (sel === "Apri" && manager) DesignWorkspacePanel.createOrShow(context, manager, agentId);
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
  } else if (manager.backend.id !== "mock") {
    vscode.window.setStatusBarMessage(
      "Agent Code: agenti Claude reali attivi (login del tuo abbonamento).",
      4000,
    );
  }
  return manager;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
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
  manager?.flush(); // persist any debounced changes before shutdown
  manager = undefined;
  managerPromise = undefined;
}
