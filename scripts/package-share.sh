#!/usr/bin/env bash
# Build a self-contained bundle to hand to testers: the .vsix + installer + guide.
# Produces agent-code-installer.zip (share it via AirDrop / cloud — no repo access needed).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "▸ Building a fresh .vsix…"
npm run package >/dev/null

STAGE="$ROOT/.share/agent-code-installer"
rm -rf "$ROOT/.share" && mkdir -p "$STAGE"
cp "$ROOT/agent-code.vsix" "$STAGE/"
cp "$ROOT/scripts/install.sh" "$STAGE/"
cp "$ROOT/INSTALL.md" "$STAGE/"
chmod +x "$STAGE/install.sh"

OUT="$ROOT/agent-code-installer.zip"
rm -f "$OUT"
( cd "$ROOT/.share" && zip -qr "$OUT" agent-code-installer )
rm -rf "$ROOT/.share"

echo "✓ $OUT  ($(du -h "$OUT" | cut -f1))"
echo "  Contiene: agent-code.vsix + install.sh + INSTALL.md"
echo "  Mandalo agli amici: scompattano ed eseguono ./install.sh (o installano il vsix a mano)."
