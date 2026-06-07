# Agent Code

Una "mod" di VS Code pensata per designer: una **dashboard multi-agente** e un
**workspace Preview / Design / Code** con select-component → AI, costruiti come
estensione VS Code + UI in webview. Mantiene tutte le funzioni di VS Code perché
ci vive dentro.

## Stack

- **Extension host**: TypeScript, bundle con esbuild → `dist/extension.js`
- **Webview UI**: React 18 + Vite + Tailwind v4 → `dist/webview/`
- **Agenti**: [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
  dietro un'interfaccia `AgentBackend`, con un **MockBackend** di fallback così la
  UI funziona anche senza API key.

Scelta architetturale: *extension-first*. Tutta la logica vive in un'estensione
auto-contenuta; un eventuale *fork sottile* di VS Code (per la chrome custom)
riuserà la stessa estensione senza riscrivere nulla.

## Come si lancia

```bash
npm install
npm run build      # build webview + extension
```

Poi in VS Code premi **F5** ("Run Agent Code (Extension)"): si apre un Extension
Development Host con la dashboard Agenti. Comandi disponibili (⇧⌘P):

- `Agent Code: Open Agents Dashboard`
- `Agent Code: Open Design Workspace`
- `Agent Code: New Agent`

Sviluppo con hot rebuild:

```bash
npm run watch      # esbuild + vite in watch
```

## Backend agenti

Di default gira in **mock** (sessioni simulate). Per agenti Claude reali:

```bash
npm install @anthropic-ai/claude-agent-sdk
export ANTHROPIC_API_KEY=...      # oppure CLAUDE_CODE_OAUTH_TOKEN
```

e imposta `agentCode.backend` su `auto` o `claude` nelle settings. Il SDK è
caricato dinamicamente: se manca, si torna automaticamente al mock.

## Impostazioni

| Setting | Default | Descrizione |
|---|---|---|
| `agentCode.openDashboardOnStartup` | `true` | Apre la dashboard all'avvio |
| `agentCode.backend` | `auto` | `auto` \| `mock` \| `claude` |
| `agentCode.previewUrl` | `http://localhost:3000` | URL del dev server nella Design view |

## Struttura

```
src/
  extension.ts              attivazione + comandi
  agents/
    AgentManager.ts         orchestrazione card + eventi
    types.ts                AgentBackend / AgentSession
    backends/
      MockBackend.ts        sessioni simulate
      ClaudeAgentBackend.ts Claude Agent SDK (streaming-input multi-turno)
  panels/
    AgentsDashboardPanel.ts webview Frame 1
    DesignWorkspacePanel.ts webview Frame 2
    html.ts                 HTML + CSP + nonce
  shared/protocol.ts        messaggi tipizzati ext <-> webview
webview/
  views/dashboard/          Agenti (rail, top bar, card)
  views/design/             Preview/Design/Code + chat
  ui/                       Icon, Avatar, Pill
preview/                    harness per screenshot di verifica (fuori dal pacchetto)
```

## Verifica visiva

`preview/dashboard.html` e `preview/design.html` caricano il bundle con stato
mock: utili per confrontare la UI con i Figma in un browser senza lanciare
l'Extension Host.

```bash
python3 -m http.server 8099        # poi apri /preview/dashboard.html
```

## Selezione componenti nella preview

Il pulsante **Seleziona** (modalità Design) usa un *element picker* che evidenzia
l'elemento sotto il cursore (stroke) e cattura `tag` / testo / selettore CSS da
mandare all'agente.

- Se la preview è **same-origin**, il picker viene **iniettato automaticamente**.
- I dev server su `localhost` sono **cross-origin** rispetto al webview, quindi il
  browser non permette di leggerne il DOM. Per abilitare il picker preciso, in
  sviluppo aggiungi alla tua app lo snippet [`media/picker.js`](media/picker.js)
  (es. `<script src="/picker.js"></script>` servito dalla tua app). Senza snippet
  resta il fallback "selezione ad area".

## Persistenza

Agenti e conversazioni sono salvati nel `globalState` di VS Code: sopravvivono a
chiusura tab, reload e riavvio. Gli agenti ripristinati sono **dormienti** (nessun
processo attivo) finché non li riapri/scrivi; alla prima interazione la sessione
viene **ripresa** (`resume` dell'SDK) così Claude continua col contesto pieno.

## Funzionalità

- **Dashboard Agenti** — card di stato (In attesa di ordini / Sta lavorando / Human Request), ordinate per "serve la tua attenzione", video di sfondo, settings, animazioni.
- **Chat = Claude Code reale** — streaming, tool con **diff** inline, **approvazioni**, **AskUserQuestion** (modal), **Plan mode** (ExitPlanMode → approva/continua), `@`-mention dei file, allega **immagini** (drag-drop/paste/picker) e **Figma** (via MCP), mode (Ask/Plan/Edit/Auto), model/thinking/effort.
- **Preview/Design/Code** — preview live, **select component stile Cursor** (hover stroke + componente React + sorgente), device picker, fullscreen reale, Code view con alberatura, splitter trascinabile.
- **Usage reale** — token/costo di sessione + finestre 5h/settimanale + account, nel badge e nel modal.
- **Notifiche OS** quando un agente serve la tua attenzione (a finestra non a fuoco).

## Roadmap

- [x] **Fase 1** — Dashboard + workspace fedeli ai Figma, Claude Agent SDK
- [x] **Fase 2 (UX)** — modali, allegati reali, usage reale, mode/effort/model, device picker, fullscreen, Code view, splitter, video, animazioni
- [x] **Fase 2.1** — picker stile Cursor (componente React + sorgente), Plan mode, diff UI, mention, notifiche OS, Figma MCP, **persistenza + resume**, `.vsix`
- [ ] **Fase 3** — fork sottile di VS Code per la chrome custom (scaffold in [fork/](fork/); la compilazione gira in locale)
- [ ] **Futuro** — picker cross-origin out-of-the-box, mapping `file:line`, compressione video, sync multi-device
