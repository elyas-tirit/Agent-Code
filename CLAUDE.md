# Agent Code — guida per Claude (handoff di progetto)

> Questo file viene letto automaticamente a inizio sessione. Riassume cos'è il
> progetto, com'è fatto, cosa è già pronto, i limiti noti e i prossimi passi.
> Lingua di lavoro con l'utente (Elyas): **italiano**. Codice/identificatori in inglese.

## Cos'è

**Agent Code** è una "mod" di VS Code, ad uso **personale** di Elyas, pensata per
designer: rende VS Code più semplice mantenendo (quasi) tutte le sue funzioni.
Due superfici, fedeli a due frame Figma:

1. **Dashboard "Agenti"** — i multi-agent di Claude Code visti come card (stato, azioni).
2. **Workspace "Preview / Design / Code"** — preview live + chat con l'agente + select-component stile Cursor.

Scelta architetturale: **extension-first**. Tutta la logica vive in un'estensione
VS Code; il *fork* di VS Code (Fase 3) è solo per la chrome custom e riuserà la
stessa estensione. Gli "agenti" e la chat **sono Claude Code reale** via
**Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) che pilota il binario
`claude` loggato dell'utente → usa l'**abbonamento** (Claude Team), nessun costo extra.

- Repo da pushare (non ancora fatto): https://github.com/elyas-tirit/Agent-Code
- Upstream VS Code: https://github.com/microsoft/vscode
- Figma: file `dcmKzsxDx5Pu7nGo8jSfLc` ("Veliu-APP"). Frame: dashboard `697-2250`, toggle Design `697-2455`, stati card `697-2284`(idle/blu) `697-2298`(approval/giallo) `697-2330`(working), composer `697-2535/2558/2580/2603/2630/2653`.

## Stack

- **Extension host**: TypeScript, bundle con **esbuild** → `dist/extension.js` (`vscode` + SDK esterni; SDK importato dinamicamente).
- **Webview UI**: **React 18 + Vite + Tailwind v4** → `dist/webview/` (filenames fissi `webview.js`/`webview.css`). Font: Host Grotesk (UI) + DM Sans (chat).
- **Media**: `media/` (bg-loop.mp4, robot.png, picker.js) copiato in `dist/webview/media` da esbuild.

## Come si lancia / builda

```bash
npm install
npm run build          # webview + extension
# poi F5 in VS Code → Extension Development Host
npm run watch          # sviluppo (rebuild esbuild + vite)
npm run typecheck      # tsc x2 (ext + webview)
npm run package        # → agent-code.vsix (installazione stabile; include l'SDK; ~110MB)
```
- **F5** apre la dashboard. Comandi (⇧⌘P): `Agent Code: Open Agents Dashboard / Open Design Workspace / New Agent / Immersive Mode` (⌘⌥I = Zen full-screen, ponte verso il fork).
- **Verifica visiva headless** (no F5): `python3 -m http.server 8099` poi Chrome `--headless --screenshot` su `preview/dashboard.html` o `preview/design.html` (supportano query `?mode= &status= &designMode= &noPct=1 &q=1 &plan=1`).

## Backend / permessi (importante)

- Default `agentCode.backend: "auto"` → usa **Claude reale** se l'SDK è installato (lo è), altrimenti **MockBackend** (sessioni simulate, per demo/screenshot).
- `claude` CLI auto-rilevato (`/opt/homebrew/bin/claude`…). Auth = login dell'utente (Keychain/OAuth) → **abbonamento**. **NON impostare `ANTHROPIC_API_KEY`** (farebbe pagare a consumo).
- **Full access** (`agentCode.fullAccess: true`): `sandbox:{enabled:false}` + `allowDangerouslySkipPermissions:true` + `additionalDirectories:[home]`. È il fix del blocco ZodError su npm/node/vite (era il sandbox).
- **Default mode** `bypassPermissions` ("Auto", nessuna conferma). Le mode (pill nel composer): **Ask**(default/ambra) · **Plan**(verde) · **Edit Auto**(acceptEdits/viola) · **Auto**(bypass/ciano). Il colore di bordo/send/pill segue la mode.

Settings (`agentCode.*`): `openDashboardOnStartup, backend, claudePath, userName, fullAccess, defaultMode, effort, model, previewUrl, figmaMcpUrl`.

## Architettura / file chiave

- `src/shared/protocol.ts` — **contratto tipizzato** webview↔host (HostMessage/ClientMessage + tutti i tipi: AgentCard, ChatMessage, ToolCall+diff, PermissionRequest, QuestionRequest, PlanRequest, UsageInfo+windows+account, Attachment, SelectedComponent, DesignState, AppSettings…). **Punto di partenza per capire i flussi.**
- `src/agents/AgentManager.ts` — **store canonico**: card per `agentId` STABILE (≠ SDK session.id), `transcripts`, `sdkSessionIds`, `tokens`; dormant/restore/`getOrWakeSession` (resume), `appendUserMessage`, persistenza (`onPersist`/`flush`), `onAttention` (notifiche OS), usage aggregata.
- `src/agents/transcript.ts` — reducer host (applyAgentEvent/addUserMessage) per accumulare la conversazione.
- `src/agents/backends/ClaudeAgentBackend.ts` — sessione reale: streaming input, `canUseTool` che intercetta permission + **AskUserQuestion** + **ExitPlanMode**, `setMode/setModel/setThinking/interrupt`, `accountInfo()`, `resume`, cattura `session_id`, usage da `rate_limit_event`/`result`, **suppressReplay** (vedi gotcha), `openReq` replay ai listener tardivi.
- `src/agents/backends/MockBackend.ts` — simula lo stesso flusso (per demo/test/screenshot).
- `src/panels/{AgentsDashboardPanel,DesignWorkspacePanel}.ts` — i due webview panel; `html.ts` (CSP+nonce+media URI); `shared.ts` (settings, code-tree/file, attachments, mimeForExt).
- `src/extension.ts` — attivazione, comandi, `getManager` (memoizza la **promise**), restore da `globalState`, notifiche OS (solo a finestra non a fuoco), serializer (riapre la dashboard al reload), `deactivate` flush.
- `webview/` — `App.tsx`, `vscode.ts` (post/onHostMessage/mediaUrl/bootstrap), `ui/{Icon,Avatar,Pill,Modal,SettingsModal,UsageModal}`, `views/dashboard/{AgentsDashboard,AgentCard,NewAgentCard,TopBar}`, `views/design/{DesignWorkspace,PreviewCanvas,ChatPanel,Composer,ApprovalModal,QuestionModal,PlanModal,CodeView}`.
- `media/picker.js` — element picker stile Cursor (iniettato nell'iframe; hover stroke + componente React + sorgente).
- `fork/` — Fase 3: `setup-fork.sh` (clone+branding+embed+chrome), `product.overlay.json` (branding + `configurationDefaults` full-bleed), `apply-chrome.mjs` (injector idempotente ancorato della titlebar greeting+Session), README.
- `scripts/usage-probe.mjs` — diagnostica usage reale dell'SDK.

## Cosa è FATTO ✅

- Dashboard fedele al Figma: card di stato (idle blu "In attesa di ordini" / working neutro / **"Human Request"** giallo per approvazioni/domande/piani), ordinate "serve la tua attenzione" in alto, "Avvia nuovo agente" come prima card, video di sfondo (~6% color-dodge), settings in alto a sx, avatar robot, animazioni.
- Chat = Claude Code reale: streaming, **tool con diff** inline (Edit/Write/MultiEdit), **modal di approvazione** (1/2/3), **AskUserQuestion** (QuestionModal), **Plan mode** (PlanModal → Approva/Continua), **@-mention** file, allega **immagini** (drag-drop/paste/picker → content block base64), **Figma** (via MCP), mode/model/thinking/effort, **stop** (send→quadrato), interrupt.
- Preview/Design/Code: preview live + **select component stile Cursor**, device picker (2 stati + preset), fullscreen reale, settings preview, **Code view** (alberatura + viewer), splitter trascinabile, Preview mode = full-screen.
- **Usage reale**: token+costo di sessione + finestre 5h/settimanale + account (`accountInfo`) nel badge e nel UsageModal.
- **Notifiche OS** quando un agente serve attenzione (a finestra non a fuoco).
- **Persistenza**: agenti+conversazioni in `globalState` ("agentCode.agents"); riaprendo vedi la cronologia; al primo nuovo messaggio la sessione **riprende** (`resume` SDK) con contesto pieno. Reload-safe (serializer dashboard).
- `.vsix` pacchettizzabile, LICENSE (MIT).

## Limiti noti / COSA MANCA ❗ (vedi anche "Next step")

1. **Fase 3 fork**: scaffold + branding + **patch della chrome scritta e auto-applicata** (`fork/apply-chrome.mjs` inietta greeting+Session in `titlebarPart.ts`; rail/landing/status = `configurationDefaults` in `product.json`, niente patch al sorgente). L'injector è **verificato sul sorgente reale VS Code 1.96.0** (ancorato + idempotente) ma **non ancora compilato dentro VS Code**: resta da fare in locale il clone multi-GB + `npm install` pesante + `./scripts/code.sh`. È la parte che separa "estensione" da "app full-bleed tipo Cursor".
2. **Select cross-origin**: il picker funziona same-origin o con `media/picker.js` aggiunto all'app; su `localhost` out-of-the-box no (limite browser). Mapping `file:line` solo via fiber `_debugSource` (dev-only).
3. **Usage %**: l'SDK **non espone `utilization`** per account Team (solo token+stato+reset). Il % del plugin Claude verrebbe da un endpoint claude.ai non documentato.
4. **Code view** = viewer read-only, non editor né refresh live legato alle modifiche dell'agente.
5. **Figma MCP**: cablato (SSE `127.0.0.1:3845`), richiede "Dev Mode MCP server" attivo in Figma; round-trip non verificato dal vivo.
6. **Edge minori**: aprire un agente *live* nell'esatto ms in cui streamma può perdere qualche delta (recuperato al reopen); `setMode` su agente dormiente risveglia un processo.
7. **Hardening**: zero test automatici; `globalState` può gonfiarsi con conversazioni lunghe (valutare file in `globalStorage`); onboarding/primo avvio cade in mock silenziosamente se manca SDK/login.
8. **Cosmetico**: non committato/pushato; niente icona estensione; video 22MB da comprimere.
9. **Tab agente non riaperti** al reload (solo la dashboard; li riapri da lì).

## Next step (ordine consigliato)

1. **Commit + push** su `github.com/elyas-tirit/Agent-Code` (mai fatto — mettere al sicuro il lavoro). Branch + commit, poi push.
2. **Fase 3 fork**: `./fork/setup-fork.sh` in locale (clona VS Code, applica branding, imbarca il `.vsix`), poi scrivere le 2-3 patch minime della chrome (file indicati in `fork/README.md`). È il salto ad app vera.
3. **Rifinire il .vsix**: comprimere `media/bg-loop.mp4`, aggiungere icona estensione.
4. **Picker cross-origin out-of-the-box** (auto-serve `picker.js` / proxy same-origin) + mapping al sorgente → select davvero "Cursor".
5. Hardening: spostare la persistenza su file, segnalare lo stato mock/login, test minimi.

## Gotcha / lezioni apprese (NON ripetere gli errori)

- **`rate_limit_event` NON ha `utilization`** per Team → la "Session %" reale non è ottenibile dall'SDK; il badge mostra i **token** quando manca la %. Non re-inseguirla nel rate_limit_event.
- **resume** ri-emette la history: il backend usa **`suppressReplay`** (attivo quando `opts.resume`, spento al primo `queueUser`) per non duplicare il transcript. Se tocchi il resume, mantieni questa soppressione.
- `agentId` deve restare **stabile** (≠ session.id che cambia col resume).
- `AgentSession.onEvent` ritorna un **disposer**: i pannelli DEVONO staccarlo nel dispose (altrimenti post su webview morto/leak).
- Spawn coalescing: `getOrWakeSession`/`ensureSession`/`getManager` memoizzano la **promise** (mai spawnare due volte lo stesso agente).
- Bash tool: un `cd` nelle sotto-cartelle persiste tra chiamate → usa path assoluti o torna a root, altrimenti `npm run` fallisce ("Missing script").
- Le verifiche grosse (audit/review) si fanno con **workflow multi-agente** (l'utente è in ultracode); hanno trovato bug reali due volte — usali prima di dichiarare "fatto".
- L'utente vuole **pareri decisi** e ritmo da vibe-coding; build+typecheck devono restare verdi a ogni step.
