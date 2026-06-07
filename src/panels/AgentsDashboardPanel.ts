import * as vscode from "vscode";
import { AgentManager } from "../agents/AgentManager";
import { ClientMessage, HostMessage } from "../shared/protocol";
import { getWebviewHtml } from "./html";
import { DesignWorkspacePanel } from "./DesignWorkspacePanel";
import { readAppSettings, writeAppSettings } from "./shared";

export class AgentsDashboardPanel {
  private static current: AgentsDashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private mediaUri = "";

  static createOrShow(context: vscode.ExtensionContext, manager: AgentManager): void {
    const column = vscode.ViewColumn.One;
    if (AgentsDashboardPanel.current) {
      AgentsDashboardPanel.current.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "agentCode.dashboard",
      "Agenti",
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
