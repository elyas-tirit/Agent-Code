#!/usr/bin/env bash
# Agent Code — Phase 3 thin-fork bootstrapper.
# Clones a VS Code base, applies Agent Code branding, and bundles the extension
# as a built-in. The heavy compile runs on YOUR machine (multi-GB, several min).
#
# Usage:  ./fork/setup-fork.sh [base-dir]
# Requires: git, node, and (for the build) the VS Code toolchain (yarn/npm).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${1:-$ROOT/../agent-code-app}"
# Pin a known-good VS Code release tag (rebase periodically for security fixes).
VSCODE_TAG="${VSCODE_TAG:-1.96.0}"

echo "▸ Base dir: $BASE  (VS Code $VSCODE_TAG)"

# 1) Build the extension VSIX from this repo.
echo "▸ Packaging the extension…"
( cd "$ROOT" && npm run package )
VSIX="$(ls -t "$ROOT"/*.vsix | head -1)"
echo "  → $VSIX"

# 2) Clone the base if missing.
if [ ! -d "$BASE" ]; then
  echo "▸ Cloning microsoft/vscode @ $VSCODE_TAG (shallow)…"
  git clone --depth 1 --branch "$VSCODE_TAG" https://github.com/microsoft/vscode.git "$BASE"
fi

# 3) Apply branding overlay into product.json.
echo "▸ Applying Agent Code branding to product.json…"
node -e '
const fs=require("fs"),path=require("path");
const base=process.argv[1], root=process.argv[2];
const pj=path.join(base,"product.json");
const product=JSON.parse(fs.readFileSync(pj,"utf8"));
const overlay=JSON.parse(fs.readFileSync(path.join(root,"fork","product.overlay.json"),"utf8"));
Object.assign(product, overlay);
fs.writeFileSync(pj, JSON.stringify(product,null,2));
console.log("  product.json updated");
' "$BASE" "$ROOT"

# 4) Bundle the extension as a built-in (unpack the VSIX into extensions/).
echo "▸ Bundling the extension as built-in…"
DEST="$BASE/extensions/agent-code"
rm -rf "$DEST" && mkdir -p "$DEST"
( cd "$DEST" && unzip -q "$VSIX" && mv extension/* . 2>/dev/null && rm -rf extension "[Content_Types].xml" extension.vsixmanifest 2>/dev/null || true )

# 5) Apply the custom chrome patch (title-bar greeting + Session pill).
#    The full-bleed defaults (hidden rail, no status bar, dashboard landing) are
#    baked into product.json via product.overlay.json → "configurationDefaults"
#    in step 3 — no source patch needed for those. The ONE genuine source patch
#    is the title-bar chrome, applied here idempotently.
echo "▸ Applying custom chrome (title-bar greeting + Session pill)…"
node "$ROOT/fork/apply-chrome.mjs" "$BASE"

cat <<EOF

✅ Scaffold ready in: $BASE

Next (on your machine — this is the heavy part):
  cd "$BASE"
  npm install          # or: yarn   (VS Code's deps are multi-GB, several minutes)
  ./scripts/code.sh    # run the dev build (macOS/Linux); scripts\\code.bat on Windows

What the scaffold already did for you:
  • Branding fused into product.json (name, ids, agent-code:// protocol, Open VSX).
  • Full-bleed defaults baked in via product.configurationDefaults (rail hidden,
    no status bar, custom title bar, dashboard as the landing surface).
  • The extension bundled as a built-in (no install step inside the app).
  • The title-bar chrome patch applied to titlebarPart.ts (idempotent — safe to
    re-run after a rebase; re-run with: node fork/apply-chrome.mjs "$BASE").

Rebase on upstream tags periodically for security fixes (bump VSCODE_TAG, re-run).
EOF
