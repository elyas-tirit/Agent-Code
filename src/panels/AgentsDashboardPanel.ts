import * as vscode from "vscode";
import { AgentManager } from "../agents/AgentManager";
import { ChangelogBundle, ClientMessage, HostMessage } from "../shared/protocol";
import { getWebviewHtml } from "./html";
import { DesignWorkspacePanel } from "./DesignWorkspacePanel";
import { readAppSettings, writeAppSettings } from "./shared";
import { getHostLang, t } from "../i18n";

export class AgentsDashboardPanel {
  private static current: AgentsDashboardPanel | undefined;

  /** Push a language change to the open dashboard webview. */
  static broadcastLang(lang: "en" | "it"): void {
    AgentsDashboardPanel.current?.post({ type: "lang/set", lang });
  }

  /**
   * Open the dashboard (revealing if already up) and show the changelog as an
   * in-dashboard overlay. We deliberately route changelog through the dashboard
   * webview instead of a separate `vscode.WebviewPanel`, so it appears as a
   * modal *over* the agents grid — not as a parallel editor tab.
   */
  static showChangelog(
    context: vscode.ExtensionContext,
    manager: AgentManager,
    bundle: ChangelogBundle,
    onMarkSeen: (version: string) => void,
    onDisable: () => void,
  ): void {
    AgentsDashboardPanel.createOrShow(context, manager);
    const inst = AgentsDashboardPanel.current!;
    inst.changelogMarkSeen = onMarkSeen;
    inst.changelogDisable = onDisable;
    inst.post({ type: "changelog/show", bundle });
  }

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private mediaUri = "";
  /** Set when `showChangelog` is in flight — wires the webview's dismiss /
   *  disable messages back to the host-side high-water mark + setting. */
  private changelogMarkSeen?: (version: string) => void;
  private changelogDisable?: () => void;

  static createOrShow(context: vscode.ExtensionContext, manager: AgentManager): void {
    const column = vscode.ViewColumn.One;
    if (AgentsDashboardPanel.current) {
      AgentsDashboardPanel.current.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "agentCode.dashboard",
      t("Agents", "Agenti"),
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist")],
      },
    );
    AgentsDashboardPanel.current = new AgentsDashboardPanel(panel, context, manager);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private manager: AgentManager,
  ) {
    this.panel = panel;
    this.mediaUri = panel.webview
      .asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist", "webview", "media"))
      .toString();
    this.panel.webview.html = getWebviewHtml(
      panel.webview,
      context.extensionUri,
      "dashboard",
      manager.getDashboardState(),
    );

    this.disposables.push({
      dispose: manager.onDidChange((state) => this.post({ type: "dashboard/state", state })),
    });
    this.panel.webview.onDidReceiveMessage(
      (m: ClientMessage) => this.handle(m),
      null,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private post(message: HostMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private async handle(message: ClientMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        this.post({
          type: "init",
          view: "dashboard",
          state: this.manager.getDashboardState(),
          media: this.mediaUri,
          lang: getHostLang(),
        });
        break;
      case "agent/new": {
        // Primary action: start a fresh Claude Code conversation and open it.
        const id = await this.manager.newAgent();
        DesignWorkspacePanel.createOrShow(this.context, this.manager, id);
        break;
      }
      case "agent/open":
        DesignWorkspacePanel.createOrShow(this.context, this.manager, message.agentId);
        break;
      case "agent/action":
        await this.handleAction(message.agentId, message.actionId);
        break;
      case "settings/get":
        this.post({ type: "settings/values", settings: readAppSettings() });
        break;
      case "settings/set":
        await writeAppSettings(message.patch);
        this.post({ type: "settings/values", settings: readAppSettings() });
        break;
      case "changelog/markSeen":
        this.changelogMarkSeen?.(message.version);
        this.changelogMarkSeen = undefined;
        this.changelogDisable = undefined;
        break;
      case "changelog/disable":
        this.changelogDisable?.();
        // Disable also implies "seen" for the current version so we don't
        // re-show on next launch even before the setting takes effect.
        this.changelogMarkSeen = undefined;
        this.changelogDisable = undefined;
        break;
      case "changelog/openUrl":
        void vscode.env.openExternal(vscode.Uri.parse(message.url));
        break;
      default:
        break;
    }
  }

  private async handleAction(agentId: string, actionId: string): Promise<void> {
    switch (actionId) {
      case "apri":
      case "controlla":
        DesignWorkspacePanel.createOrShow(this.context, this.manager, agentId);
        break;
      case "autonomo":
        // "Autonomo" = full-auto (no approval prompts), then open to watch.
        void this.manager.setMode(agentId, "bypassPermissions");
        DesignWorkspacePanel.createOrShow(this.context, this.manager, agentId);
        break;
      case "stop":
        this.manager.interrupt(agentId);
        break;
      case "fire-agent":
        this.manager.remove(agentId);
        break;
      default:
        break;
    }
  }

  private dispose(): void {
    AgentsDashboardPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}
