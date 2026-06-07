import * as vscode from "vscode";
import { WebviewView } from "../shared/protocol";

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  view: WebviewView,
  initialState: unknown,
): string {
  const nonce = getNonce();
  const dist = vscode.Uri.joinPath(extensionUri, "dist", "webview");
  const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(dist, "webview.js"));
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(dist, "webview.css"));
  const mediaUri = webview.asWebviewUri(vscode.Uri.joinPath(dist, "media"));

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data: blob:`,
    `media-src ${webview.cspSource} blob:`,
    `script-src 'nonce-${nonce}'`,
    `style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src ${webview.cspSource} https://fonts.gstatic.com data:`,
    `frame-src http: https:`,
    `connect-src ${webview.cspSource} https: http:`,
  ].join("; ");

  // Embed initial state safely (avoid breaking out of the script tag).
  const bootstrap = JSON.stringify({ view, state: initialState, media: mediaUri.toString() }).replace(
    /</g,
    "\\u003c",
  );

  return `<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Host+Grotesk:wght@300;400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet" />
    <link href="${cssUri}" rel="stylesheet" />
    <title>Agent Code</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">window.__AGENT_CODE__ = ${bootstrap};</script>
    <script type="module" nonce="${nonce}" src="${jsUri}"></script>
  </body>
</html>`;
}
