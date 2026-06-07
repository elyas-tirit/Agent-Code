# Agent Code — Fase 3: fork sottile di VS Code

Per il **full-bleed** (finestra propria, title bar custom con saluto/Session, branding) serve un fork sottile — la stessa strada di Cursor/VSCodium. Tutta la logica vive già nell'estensione: il fork la imbarca come *built-in* e aggiunge solo la chrome.

> ⚠️ La build di VS Code è pesante (clone multi-GB, `npm install` da diversi GB, compilazione di qualche minuto) e va **rifatta in locale** + rebasata sui tag upstream per le patch di sicurezza. Lo scaffold qui automatizza branding + bundling + l'unica patch al sorgente; **la compilazione la lanci tu**.

## Passi

```bash
# 1) Scaffold del fork (clona VS Code, branding, imbarca l'estensione, applica la chrome)
#    Pacchettizza l'estensione da solo se manca il .vsix.
./fork/setup-fork.sh            # crea ../agent-code-app

# 2) Compila e avvia (sulla tua macchina — è la parte pesante)
cd ../agent-code-app
npm install                     # deps di VS Code: multi-GB, qualche minuto
./scripts/code.sh               # macOS/Linux  (scripts\code.bat su Windows)
```

## Cosa fa lo scaffold (automatico)
- **Branding** (`fork/product.overlay.json`) → fuso in `product.json`: nome "Agent Code", app id, protocollo `agent-code://`, marketplace Open VSX.
- **Default full-bleed** → **non** servono patch al sorgente: stanno in `product.json` come `configurationDefaults` (activity bar nascosta, status bar off, title bar custom, dashboard come landing, command center off…). VS Code li legge nativamente; l'utente può comunque sovrascriverli.
- **Estensione built-in**: il `.vsix` viene scompattato in `extensions/agent-code` del fork → parte già dentro, niente install.
- **Chrome custom** (`fork/apply-chrome.mjs`) → applica **l'unica patch al sorgente** davvero necessaria.

## La chrome custom (una sola patch, automatica)
Il saluto "Buongiorno, …" e il badge **Session** nella title bar sono l'unica cosa che non si ottiene da settings/estensione (non esiste API per contenuto custom nella titlebar nativa). Li inietta `fork/apply-chrome.mjs` in:

- `src/vs/workbench/browser/parts/titlebar/titlebarPart.ts` — aggiunge un greeting localizzato a sinistra (legge `agentCode.userName` + ora del giorno) e una pill **Session** opzionale.

L'iniezione è **ancorata** (cerca landmark stabili nel codice, non numeri di riga) e **idempotente** (rilanciala dopo un rebase senza danni). Se un anchor sparisce, lo script **rifiuta di scrivere** e ti dice di patchare a mano invece di indovinare.

La pill Session è alimentata dall'estensione via comando `agentCode.titlebarStatus` (IPC ext-host → renderer): mostra i token live nel fork, ed è un **no-op** in VS Code normale (comando assente → l'estensione ignora). Nessun churn di settings.

> Rail/landing/status bar **non** richiedono patch: sono già `configurationDefaults` + l'estensione che apre la dashboard all'avvio. È per questo che la patch al sorgente è **una sola** — il 90% dell'app resta nell'estensione e il rebase su upstream resta banale.

Re-applicare la chrome a mano (es. dopo un rebase):
```bash
node fork/apply-chrome.mjs ../agent-code-app
```

## Manutenzione
- Aggiorna `VSCODE_TAG` in `setup-fork.sh` e rifai lo scaffold per salire di versione VS Code.
- `apply-chrome.mjs` è idempotente: dopo un rebase rilancialo; se gli anchor sono cambiati ti avvisa.
