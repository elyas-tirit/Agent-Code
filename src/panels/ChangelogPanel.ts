import * as vscode from "vscode";
import { ClientMessage, HostMessage, ChangelogBundle } from "../shared/protocol";
import { getWebviewHtml } from "./html";
import { getHostLang, t } from "../i18n";

/**
 * "What's New" panel shown after an update — renders one or more changelog
 * entries (one per version the user skipped) loaded from `media/changelogs/`.
 *
 * Singleton like the other panels: re-invoking `createOrShow` reveals the
 * existing one instead of stacking duplicates. When the user dismisses or
 * disables, we send `changelog/markSeen` (host updates `globalState`) or
 * `changelog/disable` (host flips the setting) — the panel itself stays
 * "just a view".
 */
export class ChangelogPanel {
  private static current: ChangelogPanel | undefined;

  static broadcastLang(lang: "en" | "it"): void {
    ChangelogPanel.current?.post({ type: "lang/set", lang });
  }

  static createOrShow(
    context: vscode.ExtensionContext,
    bundle: ChangelogBundle,
    onMarkSeen: (version: string) => void,
    onDisable: () => void,
  ): void {
    if (ChangelogPanel.current) {
      ChangelogPanel.current.bundle = bundle;
      ChangelogPanel.current.onMarkSeen = onMarkSeen;
      ChangelogPanel.current.onDisable = onDisable;
      ChangelogPanel.current.panel.reveal(vscode.ViewColumn.One);
      ChangelogPanel.current.post({ type: "init", view: "changelog", state: bundle, media: ChangelogPanel.current.mediaUri, lang: getHostLang() });
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "agentCode.changelog",
      t("What's New", "Novità"),
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist")],
      },
    );
    ChangelogPanel.current = new ChangelogPanel(panel, context, bundle, onMarkSeen, onDisable);
  }

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private mediaUri = "";

  private constructor(
    panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private bundle: ChangelogBundle,
    private onMarkSeen: (version: string) => void,
    private onDisable: () => void,
  ) {
    this.panel = panel;
    this.mediaUri = panel.webview
      .asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist", "webview", "media"))
      .toString();
    this.panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri, "changelog", bundle);
    this.panel.webview.onDidReceiveMessage((m: ClientMessage) => this.handle(m), null, this.disposables);
    this.panel.onDidDispose(() => {
      // Closing the panel counts as "seen" — we bump the high-water mark to the
      // current version so the same notes don't re-pop next launch. Without this,
      // the user would see the panel every restart until they clicked "Got it".
      this.onMarkSeen(this.bundle.current);
      this.dispose();
    }, null, this.disposables);
  }

  private post(message: HostMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private handle(message: ClientMessage): void {
    switch (message.type) {
      case "ready":
        this.post({ type: "init", view: "changelog", state: this.bundle, media: this.mediaUri, lang: getHostLang() });
        break;
      case "changelog/markSeen":
        this.onMarkSeen(message.version);
        this.panel.dispose(); // closing is the natural "got it" affordance
        break;
      case "changelog/disable":
        this.onDisable();
        this.onMarkSeen(this.bundle.current);
        this.panel.dispose();
        break;
      case "changelog/openUrl":
        void vscode.env.openExternal(vscode.Uri.parse(message.url));
        break;
      default:
        break;
    }
  }

  private dispose(): void {
    ChangelogPanel.current = undefined;
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}
