import * as vscode from "vscode";
import * as fs from "node:fs";
import { AgentManager } from "../agents/AgentManager";
import { AgentSession } from "../agents/types";
import { AgentSettings, ClientMessage, DesignState, EffortLevel, HostMessage } from "../shared/protocol";
import { PreviewProxy } from "../preview/PreviewProxy";
import { getWebviewHtml } from "./html";
import {
  attachmentFromFile,
  attachmentsToText,
  buildCodeTree,
  figmaAttachment,
  imagePartFromAttachment,
  readAppSettings,
  readCodeFile,
  saveDataUrlImage,
  writeAppSettings,
} from "./shared";

const DETACHED_KEY = "__design__";

export class DesignWorkspacePanel {
  private static panels = new Map<string, DesignWorkspacePanel>();

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private session: AgentSession | undefined;
  private ownsSession = false;
  private state: DesignState;
  private mediaUri: string;
  private proxy: PreviewProxy;

  static async createOrShow(
    context: vscode.ExtensionContext,
    manager: AgentManager,
    agentId?: string,
  ): Promise<void> {
    const key = agentId ?? DETACHED_KEY;
    const existing = DesignWorkspacePanel.panels.get(key);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const title = agentId ? manager.getCard(agentId)?.name ?? "Agente" : "Design";
    const panel = vscode.window.createWebviewPanel(
      "agentCode.design",
      title,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist")],
      },
    );
    const instance = new DesignWorkspacePanel(panel, context, manager, agentId, key);
    DesignWorkspacePanel.panels.set(key, instance);
    await instance.init();
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private manager: AgentManager,
    private agentId: string | undefined,
    private key: string,
  ) {
    this.panel = panel;
    const acCfg = vscode.workspace.getConfiguration("agentCode");
    const previewUrl = acCfg.get<string>("previewUrl", "http://localhost:3000");
    const card = agentId ? manager.getCard(agentId) : undefined;
    const settings: AgentSettings = {
      model: acCfg.get<string>("model", ""),
      thinking: true,
      effort: (acCfg.get<string>("effort", "") || "high") as EffortLevel,
    };

    this.state = {
      title: card?.name ?? "Nuova conversazione",
      status: card?.status ?? "ready",
      mode: acCfg.get<DesignState["mode"]>("defaultMode", "bypassPermissions"),
      designMode: "design",
      previewUrl,
      usage: manager.getUsage(),
      // Rehydrate the stored conversation; settle streaming so no stuck cursor.
      messages: agentId ? manager.getTranscript(agentId).map((m) => ({ ...m, streaming: false })) : [],
      settings,
    };

    this.mediaUri = panel.webview
      .asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist", "webview", "media"))
      .toString();

    // The preview proxy injects the Cursor-style picker into the dev server's HTML
    // so element-select works cross-origin out of the box (see PreviewProxy).
    this.proxy = new PreviewProxy(this.readPickerSource());
  }

  private readPickerSource(): string {
    try {
      const p = vscode.Uri.joinPath(
        this.context.extensionUri,
        "dist",
        "webview",
        "media",
        "picker.js",
      ).fsPath;
      return fs.readFileSync(p, "utf8");
    } catch {
      return "";
    }
  }

  /** Start the proxy, wire the webview, then render. Awaited by createOrShow so the
   *  iframe loads through the proxy from the first paint (no raw → proxy reload flash). */
  private async init(): Promise<void> {
    this.panel.webview.onDidReceiveMessage((m: ClientMessage) => this.handle(m), null, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    try {
      this.state.proxyUrl = await this.proxy.start(this.state.previewUrl);
    } catch {
      // Proxy couldn't bind → iframe falls back to the raw URL (area-select still works).
    }
    if (this.disposed) {
      this.proxy.dispose();
      return;
    }
    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.context.extensionUri, "design", this.state);
    if (this.agentId) void this.ensureSession();
  }

  private ready = false;
  private disposed = false;
  private outbox: HostMessage[] = [];
  private sessionPromise: Promise<AgentSession> | undefined;

  private post(message: HostMessage): void {
    if (this.disposed) return;
    // Buffer until the webview signals 'ready' — messages posted before the
    // webview registers its listener are otherwise dropped (e.g. a replayed
    // permission/question/plan request when opened from an OS notification).
    if (this.ready) void this.panel.webview.postMessage(message);
    else this.outbox.push(message);
  }

  private attachChat(session: AgentSession): void {
    const off = session.onEvent((event) => {
      switch (event.kind) {
        case "text":
          this.post({ type: "chat/append", delta: event.delta, channel: "text" });
          break;
        case "reasoning":
          this.post({ type: "chat/append", delta: event.delta, channel: "reasoning" });
          break;
        case "tool":
          this.post({ type: "chat/tool", tool: event.tool });
          break;
        case "status":
          this.state.status = event.status;
          this.post({ type: "agent/status", status: event.status });
          break;
        case "mode":
          this.state.mode = event.mode;
          this.post({ type: "agent/mode", mode: event.mode });
          break;
        case "usage":
          this.state.usage = event.usage;
          this.post({ type: "usage/update", usage: event.usage });
          break;
        case "title":
          this.state.title = event.title;
          this.panel.title = event.title;
          this.post({ type: "agent/title", title: event.title });
          break;
        case "permission":
          this.state.pendingPermission = event.request;
          this.post({ type: "permission/request", request: event.request });
          break;
        case "permission-dismiss":
          this.state.pendingPermission = undefined;
          this.post({ type: "permission/dismiss", id: event.id });
          break;
        case "question":
          this.state.pendingQuestion = event.request;
          this.post({ type: "question/request", request: event.request });
          break;
        case "question-dismiss":
          this.state.pendingQuestion = undefined;
          this.post({ type: "question/dismiss", id: event.id });
          break;
        case "plan":
          this.state.pendingPlan = event.request;
          this.post({ type: "plan/request", request: event.request });
          break;
        case "plan-dismiss":
          this.state.pendingPlan = undefined;
          this.post({ type: "plan/dismiss", id: event.id });
          break;
        case "done":
          this.post({ type: "chat/done" });
          break;
        case "error":
          this.post({ type: "chat/append", delta: `\n[errore] ${event.message}`, channel: "text" });
          this.post({ type: "chat/done" });
          break;
        default:
          break;
      }
    });
    // Detach on panel dispose so we never post to a dead webview / leak listeners.
    this.disposables.push({ dispose: off });
  }

  private async ensureSession(): Promise<AgentSession> {
    if (this.session) return this.session;
    // Coalesce concurrent callers (constructor + webview handlers) onto one spawn.
    this.sessionPromise ??= (async () => {
      let session = this.agentId ? await this.manager.getOrWakeSession(this.agentId) : undefined;
      if (!session) {
        session = await this.manager.spawnDetached({ name: "Design agent" });
        this.ownsSession = true;
      }
      this.attachChat(session);
      this.session = session;
      return session;
    })();
    return this.sessionPromise;
  }

  private async handle(message: ClientMessage): Promise<void> {
    switch (message.type) {
      case "ready": {
        // init carries the current state (incl. any pending permission/question/
        // plan). Then flush anything that was emitted before the webview was ready.
        this.ready = true;
        const buffered = this.outbox.splice(0);
        void this.panel.webview.postMessage({ type: "init", view: "design", state: this.state, media: this.mediaUri });
        for (const m of buffered) void this.panel.webview.postMessage(m);
        break;
      }
      case "design/mode":
        this.state.designMode = message.mode;
        break;
      case "design/setUrl":
        this.state.previewUrl = message.url;
        // Re-point the (stable) proxy and tell the webview to reload the iframe.
        if (this.state.proxyUrl) {
          this.proxy.setTarget(message.url);
          this.post({ type: "preview/proxy", proxyUrl: this.proxy.baseUrl, previewUrl: message.url });
        }
        break;
      case "design/selectComponent":
        this.state.selected = message.component;
        break;
      case "mode/set": {
        const s = await this.ensureSession();
        s.setMode(message.mode);
        break;
      }
      case "agent/interrupt": {
        const s = await this.ensureSession();
        s.interrupt();
        break;
      }
      case "permission/respond": {
        const s = await this.ensureSession();
        s.respondPermission(message.id, message.decision);
        this.state.pendingPermission = undefined;
        break;
      }
      case "question/respond": {
        const s = await this.ensureSession();
        s.answerQuestion(message.id, message.answers);
        this.state.pendingQuestion = undefined;
        break;
      }
      case "plan/respond": {
        const s = await this.ensureSession();
        s.respondPlan(message.id, message.approve);
        this.state.pendingPlan = undefined;
        break;
      }
      case "nav/back":
        void vscode.commands.executeCommand("agentCode.openDashboard");
        break;
      case "chat/clear":
        this.post({ type: "chat/cleared" });
        break;
      case "context/attach": {
        const uris = await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: "Allega" });
        for (const u of uris ?? []) this.post({ type: "composer/attach", attachment: attachmentFromFile(u, "file") });
        break;
      }
      case "context/attachImage": {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: true,
          openLabel: "Allega immagine",
          filters: { Immagini: ["png", "jpg", "jpeg", "gif", "webp"] },
        });
        for (const u of uris ?? []) this.post({ type: "composer/attach", attachment: attachmentFromFile(u, "image") });
        break;
      }
      case "context/attachFigma": {
        const url = await vscode.window.showInputBox({
          title: "Allega file Figma",
          prompt: "Incolla il link a un frame Figma (con node-id)",
          placeHolder: "https://www.figma.com/design/…?node-id=123-456",
          ignoreFocusOut: true,
        });
        if (url?.trim()) this.post({ type: "composer/attach", attachment: figmaAttachment(url.trim()) });
        break;
      }
      case "image/save": {
        const att = saveDataUrlImage(message.dataUrl, message.name);
        if (att) this.post({ type: "composer/attach", attachment: att });
        break;
      }
      case "context/mention": {
        const files = await vscode.workspace.findFiles("**/*", "**/{node_modules,dist,.git}/**", 400);
        const labels = files.map((u) => vscode.workspace.asRelativePath(u)).sort();
        const pick = await vscode.window.showQuickPick(labels, { placeHolder: "Menziona un file del progetto" });
        if (pick) this.post({ type: "composer/insert", text: `@${pick} ` });
        break;
      }
      case "code/tree":
        this.post({ type: "code/tree", nodes: buildCodeTree() });
        break;
      case "code/open": {
        const f = readCodeFile(message.path);
        if (f) this.post({ type: "code/file", path: message.path, content: f.content, language: f.language });
        break;
      }
      case "settings/get":
        this.post({ type: "settings/values", settings: readAppSettings() });
        break;
      case "settings/set":
        await writeAppSettings(message.patch);
        this.post({ type: "settings/values", settings: readAppSettings() });
        break;
      case "settings/model": {
        const s = await this.ensureSession();
        s.setModel(message.model);
        this.state.settings.model = message.model;
        this.post({ type: "agent/settings", settings: this.state.settings });
        break;
      }
      case "settings/thinking": {
        const s = await this.ensureSession();
        s.setThinking(message.enabled);
        this.state.settings.thinking = message.enabled;
        this.post({ type: "agent/settings", settings: this.state.settings });
        break;
      }
      case "settings/effort":
        // Effort is a query-start option → persist for new agents.
        await vscode.workspace
          .getConfiguration("agentCode")
          .update("effort", message.effort, vscode.ConfigurationTarget.Global);
        this.state.settings.effort = message.effort;
        this.post({ type: "agent/settings", settings: this.state.settings });
        vscode.window.setStatusBarMessage("Agent Code: effort applicato ai nuovi agenti.", 3000);
        break;
      case "settings/openUsage":
        // The usage modal is rendered in-place by the webview; nothing to do host-side.
        break;
      case "chat/send": {
        const session = await this.ensureSession();
        // Record the user's raw turn in the canonical transcript (for history).
        if (this.agentId) this.manager.appendUserMessage(this.agentId, message.text, message.attachments);
        let text = message.text;
        if (message.component) {
          const c = message.component;
          // The picker reports the on-disk file (absolute). Make it workspace-relative
          // so Claude can open it directly (file:line).
          const relFile = c.file ? vscode.workspace.asRelativePath(c.file, false) : "";
          const loc = relFile ? `${relFile}${c.line ? `:${c.line}` : ""}` : c.label;
          const ctx = [
            `Elemento: ${loc}`,
            c.component ? `Componente React: <${c.component}>` : "",
            // Redundant once we have a real file:line; keep only as a fallback.
            !relFile && c.source ? `Sorgente: ${c.source}` : "",
            c.tag ? `Tag: <${c.tag}>` : "",
            c.text ? `Testo: "${c.text}"` : "",
            c.selector ? `Selettore CSS: ${c.selector}` : "",
            c.url ? `Pagina: ${c.url}` : "",
            c.device ? `Viewport: ${c.device}` : "",
            c.rect && !c.selector
              ? `Area selezionata (frazione 0–1): x=${c.rect.x.toFixed(3)} y=${c.rect.y.toFixed(3)} w=${c.rect.w.toFixed(3)} h=${c.rect.h.toFixed(3)}`
              : "",
          ]
            .filter(Boolean)
            .join(" · ");
          text = `[Componente selezionato nella preview — ${ctx}]\n${text}`;
        }
        text += attachmentsToText(message.attachments);
        // Real image attachments → inline base64 content blocks (Claude sees the pixels).
        const images = (message.attachments ?? [])
          .map((a) => imagePartFromAttachment(a))
          .filter((p): p is NonNullable<typeof p> => Boolean(p));
        session.send(text, images);
        break;
      }
      default:
        break;
    }
  }

  private dispose(): void {
    this.disposed = true;
    DesignWorkspacePanel.panels.delete(this.key);
    this.proxy.dispose();
    if (this.ownsSession) this.session?.stop();
    this.panel.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}
