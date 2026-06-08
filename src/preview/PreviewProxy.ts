import * as http from "node:http";
import * as https from "node:https";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { t } from "../i18n";

/**
 * A tiny localhost reverse proxy for the design preview.
 *
 * The webview iframe (`vscode-webview://…`) is cross-origin to any dev server, so
 * we can't reach into `iframe.contentDocument` to inject the Cursor-style element
 * picker. This proxy fixes that out-of-the-box: it forwards every request to the
 * real dev server and **injects the picker `<script>` inline into HTML responses**,
 * so the picker runs inside the page and talks to the webview over `postMessage`
 * (which works cross-origin). It also proxies WebSockets (Vite/CRA HMR) and strips
 * framing/CSP headers that would otherwise block embedding or the injected script.
 *
 * Local-only (binds 127.0.0.1, ephemeral port), alive only while a Design panel is
 * open. Best-effort: if the dev server is down the iframe shows a friendly 502 and
 * the area-selection fallback still works.
 */
export class PreviewProxy {
  private server: http.Server;
  private target!: URL;
  private readonly injection: string;
  private base = "";

  constructor(pickerSource: string) {
    // Escape any literal `</script` in the source — otherwise it would close our
    // injected <script> early and the rest renders as visible text on the page.
    const safe = pickerSource.replace(/<\/(script)/gi, "<\\/$1");
    // Guard against double-injection (picker.js also self-guards via window.__acPicker).
    this.injection = `\n<script data-agent-code-picker>\n${safe}\n</script>\n`;
    this.server = http.createServer((req, res) => this.onRequest(req, res));
    this.server.on("upgrade", (req, socket, head) => this.onUpgrade(req, socket, head));
    this.server.on("error", () => {});
  }

  /** Start listening and point at `target`. Returns the local proxy base URL. */
  async start(target: string): Promise<string> {
    this.target = normalizeTarget(target);
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    const addr = this.server.address() as AddressInfo;
    this.base = `http://127.0.0.1:${addr.port}`;
    return this.base;
  }

  /** Re-point the proxy at a new dev-server URL (no restart, base URL is stable). */
  setTarget(target: string): void {
    this.target = normalizeTarget(target);
  }

  get baseUrl(): string {
    return this.base;
  }

  dispose(): void {
    try {
      this.server.close();
      // close() leaves upgraded (WebSocket/HMR) and in-flight sockets alive;
      // forcibly destroy them so a closed Design panel leaks nothing.
      this.server.closeAllConnections?.();
    } catch {
      /* already closed */
    }
  }

  private onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const target = this.target;
    const isHttps = target.protocol === "https:";
    const lib = isHttps ? https : http;
    const wantsHtml = String(req.headers["accept"] || "").includes("text/html");

    const headers: http.OutgoingHttpHeaders = { ...req.headers };
    headers.host = target.host;
    // For navigations, take HTML uncompressed so we can splice the picker in.
    if (wantsHtml) headers["accept-encoding"] = "identity";
    // Always revalidate so we never serve a cached HTML that missed injection.
    delete headers["if-none-match"];
    delete headers["if-modified-since"];

    const proxyReq = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        method: req.method,
        path: req.url,
        headers,
        rejectUnauthorized: false,
      },
      (proxyRes) => {
        const out = sanitizeHeaders(proxyRes.headers);
        const loc = proxyRes.headers["location"];
        if (typeof loc === "string") out["location"] = this.rewriteLocation(loc);

        const ct = String(proxyRes.headers["content-type"] || "");
        // HEAD (and other bodyless replies) must not be buffered/injected — we'd
        // fabricate a wrong content-length for a response that carries no body.
        const injectable =
          req.method !== "HEAD" && ct.includes("text/html") && !proxyRes.headers["content-encoding"];

        if (injectable) {
          // We buffer + resend with our own content-length, so any chunked
          // transfer-encoding from the dev server must go (the two can't coexist).
          delete out["content-length"];
          delete out["transfer-encoding"];
          const chunks: Buffer[] = [];
          proxyRes.on("data", (c) => chunks.push(c as Buffer));
          proxyRes.on("end", () => {
            const body = this.inject(Buffer.concat(chunks).toString("utf8"));
            out["content-length"] = Buffer.byteLength(body).toString();
            res.writeHead(proxyRes.statusCode || 200, out);
            res.end(body);
          });
          // Upstream dropped mid-response: surface a 502 rather than an implicit 200.
          proxyRes.on("error", () => {
            if (!res.headersSent) res.writeHead(502, { "content-type": "text/html; charset=utf-8" });
            res.end();
          });
        } else {
          res.writeHead(proxyRes.statusCode || 200, out);
          proxyRes.pipe(res);
        }
      },
    );

    proxyReq.on("error", () => {
      if (res.headersSent) return;
      // Friendly empty state (not a scary error): this is what you see before a
      // dev server is running. It auto-retries so the preview appears on its own.
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(emptyStatePage(target.origin));
    });

    req.pipe(proxyReq);
  }

  private onUpgrade(req: http.IncomingMessage, clientSocket: Duplex, head: Buffer): void {
    const target = this.target;
    const isHttps = target.protocol === "https:";
    const lib = isHttps ? https : http;

    const headers: http.OutgoingHttpHeaders = { ...req.headers };
    headers.host = target.host;

    const proxyReq = lib.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      method: req.method,
      path: req.url,
      headers,
      rejectUnauthorized: false,
    });

    proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
      const statusLine = `HTTP/1.1 ${proxyRes.statusCode || 101} ${proxyRes.statusMessage || "Switching Protocols"}\r\n`;
      const head2 = Object.entries(proxyRes.headers)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}\r\n`)
        .join("");
      clientSocket.write(statusLine + head2 + "\r\n");
      if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);
      proxySocket.pipe(clientSocket);
      clientSocket.pipe(proxySocket);
      proxySocket.on("error", () => clientSocket.destroy());
      clientSocket.on("error", () => proxySocket.destroy());
    });
    // If the upstream answers the Upgrade with an ordinary HTTP response (HMR off,
    // dev server mid-restart, plain server), Node fires 'response' — not 'upgrade'.
    // Relay it and close, otherwise the client WS hangs and the socket leaks.
    proxyReq.on("response", (proxyRes) => {
      try {
        clientSocket.write(
          `HTTP/1.1 ${proxyRes.statusCode || 502} ${proxyRes.statusMessage || ""}\r\nConnection: close\r\n\r\n`,
        );
      } catch {
        /* client already gone */
      }
      proxyRes.resume();
      clientSocket.destroy();
    });
    proxyReq.on("error", () => clientSocket.destroy());

    if (head && head.length) proxyReq.write(head);
    proxyReq.end();
  }

  private inject(html: string): string {
    if (html.includes("data-agent-code-picker") || html.includes("__acPicker")) return html;
    if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, this.injection + "</head>");
    if (/<body[^>]*>/i.test(html)) return html.replace(/(<body[^>]*>)/i, "$1" + this.injection);
    return this.injection + html;
  }

  private rewriteLocation(loc: string): string {
    try {
      const u = new URL(loc, this.target);
      if (u.host === this.target.host) return this.base + u.pathname + u.search + u.hash;
      return loc;
    } catch {
      return loc;
    }
  }
}

function normalizeTarget(target: string): URL {
  let t = (target || "").trim();
  if (!/^https?:\/\//i.test(t)) t = "http://" + t;
  return new URL(t);
}

/** Strip headers that would block embedding the page or running the injected script. */
function sanitizeHeaders(headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = { ...headers };
  delete out["x-frame-options"];
  delete out["content-security-policy"];
  delete out["content-security-policy-report-only"];
  delete out["cross-origin-opener-policy"];
  delete out["cross-origin-embedder-policy"];
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] || c);
}

/** Inviting placeholder shown in the iframe while no dev server answers. Polls in
 *  the background and reloads itself the moment the dev server comes up. */
function emptyStatePage(origin: string): string {
  const safe = escapeHtml(origin);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
    background:radial-gradient(120% 120% at 50% 0%,#15151c 0%,#0b0b0f 70%);color:#e8e8ea}
  .card{text-align:center;max-width:380px;padding:32px}
  .orb{width:74px;height:74px;margin:0 auto 22px;border-radius:22px;
    background:linear-gradient(135deg,#4067e8,#70fff3);display:flex;align-items:center;justify-content:center;
    box-shadow:0 12px 40px -10px rgba(112,255,243,.5);animation:fl 4s ease-in-out infinite}
  .orb svg{width:34px;height:34px;stroke:#06060a;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
  h1{font-size:17px;font-weight:600;margin:0 0 8px}
  p{font-size:13.5px;line-height:1.55;color:#9a9aa2;margin:0 0 18px}
  code{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;background:rgba(255,255,255,.07);
    border:1px solid rgba(255,255,255,.08);padding:2px 7px;border-radius:6px;color:#cdebe8}
  .dots{display:flex;gap:6px;justify-content:center;margin-top:22px}
  .dots i{width:6px;height:6px;border-radius:50%;background:#70fff3;opacity:.4;animation:bp 1.1s ease-in-out infinite}
  .dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}
  .wait{font-size:12px;color:#6a6a72;margin-top:10px}
  @keyframes fl{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
  @keyframes bp{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-5px);opacity:1}}
  </style></head><body><div class="card">
    <div class="orb"><svg viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V5"/><circle cx="12" cy="3.5" r="1.4" fill="#06060a" stroke="none"/><path d="M9 13h.01M15 13h.01"/></svg></div>
    <h1>${t("Waiting for your frontend", "In attesa del tuo frontend")}</h1>
    <p>${t("Start the dev server and the preview will appear here automatically.", "Avvia il dev server e la preview comparirà qui in automatico.")}<br>${t("Expected at", "Atteso su")} <code>${safe}</code></p>
    <div class="dots"><i></i><i></i><i></i></div>
    <div class="wait">${t("Checking the connection…", "Controllo la connessione…")}</div>
  </div>
  <script>setInterval(function(){fetch(location.href,{method:"HEAD",cache:"no-store"}).then(function(r){if(r.ok)location.reload()}).catch(function(){})},2000)</script>
  </body></html>`;
}
