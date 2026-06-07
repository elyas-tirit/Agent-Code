import { test } from "node:test";
import assert from "node:assert/strict";
import { PreviewProxy } from "../.test-build/PreviewProxy.mjs";
import http from "node:http";
import net from "node:net";

const PICKER = "window.__acPicker_TESTMARK=1;";

function listen(server) {
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${server.address().port}`)));
}
function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
      })
      .on("error", reject);
  });
}

// A stand-in dev server (Vite/CRA-like): chunked HTML + hostile headers, a JSON
// endpoint, a self-redirect, and a WebSocket echo.
function makeTarget() {
  const s = http.createServer((req, res) => {
    if (req.url.startsWith("/api")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: req.url }));
    } else if (req.url === "/redir") {
      res.writeHead(302, { location: "http://" + req.headers.host + "/dest" });
      res.end();
    } else {
      // No content-length set → Node sends this chunked, exercising the
      // transfer-encoding→content-length fix.
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "x-frame-options": "DENY",
        "content-security-policy": "script-src 'self'",
      });
      res.end("<html><head><title>app</title></head><body>hello <b>world</b></body></html>");
    }
  });
  s.on("upgrade", (req, socket) => {
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
    socket.on("data", (d) => socket.write(d));
  });
  return s;
}

test("injects the picker into chunked HTML and fixes content-length", async () => {
  const target = makeTarget();
  const url = await listen(target);
  const proxy = new PreviewProxy(PICKER);
  const base = await proxy.start(url);
  try {
    const r = await get(base + "/");
    assert.equal(r.status, 200);
    assert.match(r.body, /__acPicker_TESTMARK/);
    assert.match(r.body, /data-agent-code-picker/);
    assert.match(r.body, /hello <b>world<\/b>/);
    assert.equal(r.headers["transfer-encoding"], undefined);
    assert.equal(Number(r.headers["content-length"]), Buffer.byteLength(r.body));
  } finally {
    proxy.dispose();
    target.close();
  }
});

test("strips framing/CSP headers so the page can be embedded", async () => {
  const target = makeTarget();
  const url = await listen(target);
  const proxy = new PreviewProxy(PICKER);
  const base = await proxy.start(url);
  try {
    const r = await get(base + "/");
    assert.equal("x-frame-options" in r.headers, false);
    assert.equal("content-security-policy" in r.headers, false);
  } finally {
    proxy.dispose();
    target.close();
  }
});

test("passes non-HTML responses through untouched", async () => {
  const target = makeTarget();
  const url = await listen(target);
  const proxy = new PreviewProxy(PICKER);
  const base = await proxy.start(url);
  try {
    const r = await get(base + "/api?x=1");
    assert.equal(r.body, JSON.stringify({ ok: true, path: "/api?x=1" }));
    assert.doesNotMatch(r.body, /__acPicker_TESTMARK/);
  } finally {
    proxy.dispose();
    target.close();
  }
});

test("rewrites same-origin redirects to the proxy origin", async () => {
  const target = makeTarget();
  const url = await listen(target);
  const proxy = new PreviewProxy(PICKER);
  const base = await proxy.start(url);
  try {
    const r = await new Promise((resolve, reject) =>
      http.get(base + "/redir", (res) => resolve({ status: res.statusCode, loc: res.headers.location })).on("error", reject),
    );
    assert.equal(r.status, 302);
    assert.ok(String(r.loc).startsWith(base + "/dest"), `location was ${r.loc}`);
  } finally {
    proxy.dispose();
    target.close();
  }
});

test("does not double-inject when the picker is already present", async () => {
  const target = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><head><script>window.__acPicker=1;</script></head><body>x</body></html>");
  });
  const url = await listen(target);
  const proxy = new PreviewProxy(PICKER);
  const base = await proxy.start(url);
  try {
    const r = await get(base + "/");
    assert.doesNotMatch(r.body, /__acPicker_TESTMARK/);
  } finally {
    proxy.dispose();
    target.close();
  }
});

test("setTarget re-points to a new dev server, keeping the base URL stable", async () => {
  const a = makeTarget();
  const b = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><head></head><body>SECOND</body></html>");
  });
  const aUrl = await listen(a);
  const bUrl = await listen(b);
  const proxy = new PreviewProxy(PICKER);
  const base = await proxy.start(aUrl);
  try {
    proxy.setTarget(bUrl);
    assert.equal(proxy.baseUrl, base);
    const r = await get(base + "/");
    assert.match(r.body, /SECOND/);
  } finally {
    proxy.dispose();
    a.close();
    b.close();
  }
});

test("proxies a WebSocket upgrade end-to-end (echo)", async () => {
  const target = makeTarget();
  const url = await listen(target);
  const proxy = new PreviewProxy(PICKER);
  const base = await proxy.start(url);
  try {
    const result = await new Promise((resolve) => {
      const u = new URL(base);
      const sock = net.connect(Number(u.port), u.hostname, () => {
        sock.write(
          "GET /socket HTTP/1.1\r\nHost: " + u.host + "\r\nUpgrade: websocket\r\n" +
            "Connection: Upgrade\r\nSec-WebSocket-Key: x\r\nSec-WebSocket-Version: 13\r\n\r\n",
        );
      });
      let buf = "", got101 = false;
      sock.on("data", (d) => {
        buf += d.toString("binary");
        if (!got101 && buf.includes("101")) {
          got101 = true;
          sock.write("PINGPONG");
        } else if (got101 && buf.indexOf("PINGPONG", buf.indexOf("\r\n\r\n") + 4) >= 0) {
          sock.destroy();
          resolve({ got101: true, echoed: true });
        }
      });
      sock.on("error", () => resolve({ got101, echoed: false }));
      setTimeout(() => { sock.destroy(); resolve({ got101, echoed: false }); }, 1500);
    });
    assert.equal(result.got101, true);
    assert.equal(result.echoed, true);
  } finally {
    proxy.dispose();
    target.close();
  }
});

test("returns a friendly 502 when the dev server is down", async () => {
  const proxy = new PreviewProxy(PICKER);
  const base = await proxy.start("http://127.0.0.1:1");
  try {
    const r = await get(base + "/");
    assert.equal(r.status, 502);
    assert.match(r.body, /Preview non raggiungibile/);
  } finally {
    proxy.dispose();
  }
});
