#!/usr/bin/env bash
# Agent Code — friendly installer for testers.
# Finds a VS Code-family editor and installs the bundled .vsix into it.
# Works from the shared folder (agent-code.vsix sits next to this script).
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
VSIX="$DIR/agent-code.vsix"

say() { printf "\033[36m▸\033[0m %s\n" "$1"; }
ok()  { printf "\033[32m✓\033[0m %s\n" "$1"; }
warn(){ printf "\033[33m!\033[0m %s\n" "$1"; }
die() { printf "\033[31m✗ %s\033[0m\n" "$1" >&2; exit 1; }

[ -f "$VSIX" ] || die "Non trovo agent-code.vsix accanto a questo script ($DIR)."

# 1) Locate a VS Code / Cursor / VSCodium CLI.
say "Cerco VS Code / Cursor / VSCodium…"
CLI=""
for c in code cursor codium code-insiders; do
  if command -v "$c" >/dev/null 2>&1; then CLI="$c"; break; fi
done
if [ -z "$CLI" ]; then
  for p in \
    "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
    "/Applications/Cursor.app/Contents/Resources/app/bin/cursor" \
    "/Applications/VSCodium.app/Contents/Resources/app/bin/codium" \
    "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
    "$HOME/Applications/Cursor.app/Contents/Resources/app/bin/cursor"; do
    if [ -x "$p" ]; then CLI="$p"; break; fi
  done
fi

# Last resort: derive it from a running editor (handles App Translocation / installs
# in non-standard locations). Works only if the editor is currently open.
if [ -z "$CLI" ]; then
  APP=$(ps aux 2>/dev/null | grep -oE "/[^ ]*/(Visual Studio Code|Cursor|VSCodium)\.app" | head -1 || true)
  if [ -n "$APP" ]; then
    for bin in code cursor codium; do
      if [ -x "$APP/Contents/Resources/app/bin/$bin" ]; then CLI="$APP/Contents/Resources/app/bin/$bin"; break; fi
    done
  fi
fi

if [ -z "$CLI" ]; then
  warn "Non ho trovato l'eseguibile da riga di comando."
  cat <<EOF

Installa a mano (30 secondi):
  1. Apri VS Code
  2. Cmd/Ctrl + Shift + P  →  "Install from VSIX"
  3. Scegli:  $VSIX
  4. Riavvia VS Code

EOF
  exit 1
fi

ok "Editor trovato: $CLI"

# 2) Install the extension.
say "Installo Agent Code…"
"$CLI" --install-extension "$VSIX" --force

# 3) Check the Claude Code prerequisite (real vs demo).
echo
if command -v claude >/dev/null 2>&1; then
  ok "Claude Code rilevato → agenti REALI attivi (usa il tuo login/abbonamento)."
else
  warn "Claude Code (CLI \`claude\`) non trovato → l'app parte in modalità DEMO (simulata)."
  echo "    Per gli agenti veri:  npm install -g @anthropic-ai/claude-code  &&  claude  (login una volta)"
fi

echo
ok "Fatto! Riavvia VS Code: la dashboard Agenti si apre da sola."
echo "   (altrimenti: Cmd/Ctrl + Shift + P → \"Agent Code: Open Agents Dashboard\")"
