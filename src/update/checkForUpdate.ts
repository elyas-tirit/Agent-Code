import * as vscode from "vscode";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { t } from "../i18n";

/**
 * Auto-update for Agent Code via GitHub Releases.
 *
 * Why this exists: the extension is distributed as a .vsix outside the Marketplace,
 * so VS Code has no idea when a new version ships. Once a day the extension asks
 * GitHub for the latest release tag, compares it to the current `package.json`
 * version, and — if newer — offers to download the attached .vsix and install it.
 *
 * Fail-soft contract: no network = silent no-op. We never block activation, never
 * surface API errors. Only fires UI when there's a concrete update to install.
 */

const REPO = "elyas-tirit/Agent-Code";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h — keeps us well under GitHub's 60/h anon rate limit
const LAST_CHECK_KEY = "agentCode.update.lastCheckAt";
const SKIP_VERSION_KEY = "agentCode.update.skipVersion";
const UA = "agent-code-extension";

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  name?: string;
  body?: string;
  prerelease?: boolean;
  draft?: boolean;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

/** Parse "1.2.3" or "v1.2.3" into [major, minor, patch]. Returns null on garbage. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec((v ?? "").trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** True iff `a` is strictly newer than `b`. Unparseable versions are treated as equal. */
export function isNewer(a: string, b: string): boolean {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
}

/**
 * Check GitHub Releases for a newer version and offer to install. Throttled to once
 * per CHECK_INTERVAL_MS; honors per-version "skip"; respects `agentCode.checkForUpdates`.
 * `opts.force` bypasses throttle/skip — used by the manual "Check for Updates" command.
 */
export async function checkForUpdate(
  context: vscode.ExtensionContext,
  opts: { force?: boolean } = {},
): Promise<void> {
  try {
    if (!opts.force) {
      const enabled = vscode.workspace
        .getConfiguration("agentCode")
        .get<boolean>("checkForUpdates", true);
      if (!enabled) return;
      const lastCheck = context.globalState.get<number>(LAST_CHECK_KEY, 0);
      if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
    }

    const release = await fetchLatestRelease();
    await context.globalState.update(LAST_CHECK_KEY, Date.now());
    if (!release || release.prerelease || release.draft) {
      if (opts.force) {
        void vscode.window.showInformationMessage(
          t("Agent Code: no update available.", "Agent Code: nessun aggiornamento disponibile."),
        );
      }
      return;
    }

    const current: string = String(context.extension.packageJSON.version ?? "0.0.0");
    const latest = release.tag_name;
    if (!isNewer(latest, current)) {
      if (opts.force) {
        void vscode.window.showInformationMessage(
          t(
            `Agent Code is up to date (${current}).`,
            `Agent Code è aggiornato (${current}).`,
          ),
        );
      }
      return;
    }

    if (!opts.force) {
      const skipped = context.globalState.get<string>(SKIP_VERSION_KEY, "");
      if (skipped === latest) return;
    }

    const vsix = release.assets.find((a) => a.name.endsWith(".vsix"));
    if (!vsix) {
      if (opts.force) {
        // Release exists but no installer attached — point the user at the page so
        // they can grab it manually instead of leaving them hanging.
        const open = t("Open release", "Apri release");
        const sel = await vscode.window.showInformationMessage(
          t(
            `Agent Code ${pretty(latest)} is available but the release has no .vsix attached.`,
            `Agent Code ${pretty(latest)} è disponibile ma la release non ha un .vsix allegato.`,
          ),
          open,
        );
        if (sel === open) void vscode.env.openExternal(vscode.Uri.parse(release.html_url));
      }
      return;
    }

    const update = t("Update", "Aggiorna");
    const later = t("Later", "Più tardi");
    const skip = t("Skip this version", "Salta questa versione");
    const sel = await vscode.window.showInformationMessage(
      t(
        `Agent Code ${pretty(latest)} is available (you have ${current}).`,
        `Agent Code ${pretty(latest)} è disponibile (hai ${current}).`,
      ),
      update,
      later,
      skip,
    );
    if (sel === skip) {
      await context.globalState.update(SKIP_VERSION_KEY, latest);
      return;
    }
    if (sel !== update) return;

    await installVsix(vsix.browser_download_url, vsix.name);
  } catch (err) {
    console.warn("[AgentCode] update check failed:", err);
    if (opts.force) {
      void vscode.window.showWarningMessage(
        t(
          "Agent Code: update check failed (see Output for details).",
          "Agent Code: controllo aggiornamenti fallito (dettagli nell'Output).",
        ),
      );
    }
  }
}

function pretty(tag: string): string {
  return parseVersion(tag)?.join(".") ?? tag;
}

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  // Node 18+ ships global fetch; no extra dep needed.
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": UA,
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as GitHubRelease;
}

async function installVsix(url: string, fileName: string): Promise<void> {
  const tmp = path.join(os.tmpdir(), `agent-code-${Date.now()}-${fileName}`);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t("Downloading Agent Code update…", "Scarico l'aggiornamento di Agent Code…"),
      cancellable: false,
    },
    async (progress) => {
      const res = await fetch(url, {
        headers: { Accept: "application/octet-stream", "User-Agent": UA },
      });
      if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
      const total = Number(res.headers.get("content-length") ?? 0);
      let received = 0;
      let lastPct = 0;

      // Tap stream: counts bytes for the progress notification while the underlying
      // stream pipes straight to disk. Using `pipeline` ensures backpressure +
      // proper cleanup if anything throws.
      const tap = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.floor((received / total) * 100);
            if (pct > lastPct) {
              progress.report({
                increment: pct - lastPct,
                message: `${pct}%`,
              });
              lastPct = pct;
            }
          }
          cb(null, chunk);
        },
      });

      // Cast: Node's `ReadableStream` from `fetch` is web-stream-shaped; `fromWeb`
      // accepts it, but the TS types differ. Safe in practice on node ≥18.
      const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
      await pipeline(source, tap, fs.createWriteStream(tmp));
    },
  );

  await vscode.commands.executeCommand(
    "workbench.extensions.installExtension",
    vscode.Uri.file(tmp),
  );

  const reload = t("Reload window", "Ricarica finestra");
  const sel = await vscode.window.showInformationMessage(
    t(
      "Agent Code update installed. Reload to apply.",
      "Aggiornamento di Agent Code installato. Ricarica per applicarlo.",
    ),
    reload,
  );
  if (sel === reload) {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
}
