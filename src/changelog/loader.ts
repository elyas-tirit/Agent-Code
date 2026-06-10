import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Changelog, ChangelogBundle } from "../shared/protocol";

/**
 * Reads changelog JSONs from `media/changelogs/<version>.json` and returns the
 * ones the user hasn't seen yet (version > lastSeen && <= current), newest first.
 *
 * Why a per-version JSON instead of one big CHANGELOG.md: this gives the panel
 * structured data (highlights, section accents, embedded visuals) without
 * parsing markdown, and aggregating multi-version skips is just an array filter.
 */
export function loadChangelogsSince(
  extensionUri: vscode.Uri,
  currentVersion: string,
  lastSeenVersion: string | undefined,
): Changelog[] {
  const dir = path.join(extensionUri.fsPath, "media", "changelogs");
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return []; // no directory yet → no changelogs to show
  }

  const entries: Changelog[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const parsed = JSON.parse(raw) as Changelog;
      if (!parsed.version) continue;
      if (compareSemver(parsed.version, currentVersion) > 0) continue; // skip future versions (shouldn't happen, but be defensive)
      if (lastSeenVersion && compareSemver(parsed.version, lastSeenVersion) <= 0) continue;
      entries.push(parsed);
    } catch (err) {
      console.warn("[AgentCode] failed to parse changelog", file, err);
    }
  }

  entries.sort((a, b) => compareSemver(b.version, a.version)); // newest first
  return entries;
}

export function makeBundle(
  extensionUri: vscode.Uri,
  currentVersion: string,
  lastSeenVersion: string | undefined,
): ChangelogBundle | null {
  const entries = loadChangelogsSince(extensionUri, currentVersion, lastSeenVersion);
  if (entries.length === 0) return null;
  return { current: currentVersion, entries };
}

/** Returns negative / 0 / positive in the usual semver way. Tolerant of garbage. */
function compareSemver(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function parse(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec((v ?? "").trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
