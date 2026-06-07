# Agent Code — Fase 3: fork sottile di VS Code

Per il **full-bleed** (finestra propria, title bar custom con saluto/Session, branding) serve un fork sottile — la stessa strada di Cursor/VSCodium. Tutta la logica vive già nell'estensione: il fork la imbarca come *built-in* e aggiunge solo la chrome.

> ⚠️ La build di VS Code è pesante (clone multi-GB, compilazione di alcuni minuti) e va **rifatta in locale** + rebasata sui tag upstream per le patch di sicurezza. Lo scaffold qui automatizza branding + bundling; la compilazione la lanci tu.

## Passi

```bash
# 1) Pacchettizza l'estensione (.vsix)
npm run package

# 2) Scaffold del fork (clona VS Code, applica branding, imbarca l'estensione)
./fork/setup-fork.sh            # crea ../agent-code-app

# 3) Compila e avvia (sulla tua macchina)
cd ../agent-code-app
npm install
./scripts/code.sh               # macOS/Linux  (scripts\code.bat su Windows)
```

## Cosa fa lo scaffold
- **Branding** (`fork/product.overlay.json`) → fuso in `product.json`: nome "Agent Code", app id, protocollo `agent-code://`, marketplace Open VSX.
- **Estensione built-in**: il `.vsix` viene scompattato in `extensions/agent-code` del fork → parte già dentro, niente install.
- **Default immersivi** (`fork/default-settings.json`): activity bar nascosta, status bar off, title bar custom, dashboard all'avvio.

## Chrome custom (la parte "a mano")
Il saluto "Buongiorno" e il badge Session **nella title bar** richiedono di toccare il workbench:
- `src/vs/workbench/browser/parts/titlebar/titlebarPart.ts` — area titolo (inietta greeting + Session%).
- `src/vs/workbench/browser/parts/activitybar/` — nascondi/sostituisci la rail.
- `src/vs/workbench/browser/parts/editor/` — far aprire la dashboard Agenti come landing.

Mantieni le patch **minime** (poche righe mirate) così il rebase su upstream resta gestibile: il 90% dell'app resta nell'estensione, il fork tocca solo la cornice.

## Manutenzione
- Aggiorna `VSCODE_TAG` in `setup-fork.sh` e rifai lo scaffold per salire di versione VS Code.
- Tieni le patch della chrome in un branch separato per rebasarle pulite.
