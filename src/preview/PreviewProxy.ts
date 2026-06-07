import * as http from "node:http";
import * as https from "node:https";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";

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
    // Guard against double-injection (picker.js also self-guards via window.__acPicker).
    this.injection = `\n<script data-agent-code-picker>\n${pickerSource}\n</script>\n`;
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
        const injectable =
          ct.includes("text/html") && !proxyRes.headers["content-encoding"];

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
          proxyRes.on("error", () => res.end());
        } else {
          res.writeHead(proxyRes.statusCode || 200, out);
          proxyRes.pipe(res);
        }
      },
    );

    proxyReq.on("error", (err) => {
      if (res.headersSent) return;
      res.writeHead(502, { "content-type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;background:#0e0e0e;color:#ddd;padding:32px">` +
          `<h2 style="color:#70fff3">Preview non raggiungibile</h2>` +
          `<p>Agent Code non riesce a contattare <b>${escapeHtml(target.origin)}</b>.</p>` +
          `<p>Il dev server è avviato? Controlla l'URL nella barra in alto.</p>` +
          `<pre style="color:#888">${escapeHtml(String(err))}</pre></body>`,
      );
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
