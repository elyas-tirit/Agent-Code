# Agent Code — installazione (per chi prova in anteprima)

**Agent Code** è una mod di VS Code per designer: una dashboard di agenti Claude Code
visti come card + un workspace Preview/Design/Code con chat e "seleziona componente"
stile Cursor. Si installa come **estensione** dentro il tuo VS Code (o Cursor/VSCodium).

## Cosa ti serve

1. **VS Code** (o Cursor / VSCodium) già installato. → https://code.visualstudio.com
2. **Per gli agenti VERI**: **Claude Code** installato e loggato (serve un abbonamento Claude).
   ```bash
   npm install -g @anthropic-ai/claude-code   # installa la CLI `claude`
   claude                                      # avvia e fai il login una volta
   ```
   Senza Claude Code l'app parte lo stesso in **modalità demo (simulata)**: vedi l'interfaccia
   e finti agenti, ma le risposte non sono reali. Te lo segnala chiaramente in alto.

## Installazione (modo facile, macOS/Linux)

Apri il Terminale nella cartella che hai ricevuto ed esegui:

```bash
./install.sh
```

Trova da solo VS Code/Cursor e installa l'estensione. Poi **riavvia VS Code**.

## Installazione (manuale, qualsiasi OS)

1. Apri VS Code.
2. `Cmd/Ctrl + Shift + P` → digita **"Install from VSIX"** → invio.
3. Scegli il file **`agent-code.vsix`**.
4. **Riavvia VS Code** (o `Developer: Reload Window`).

## Come si usa

- Dopo il riavvio la **dashboard Agenti si apre da sola**. Se non lo fa:
  `Cmd/Ctrl + Shift + P` → **"Agent Code: Open Agents Dashboard"**.
- "Avvia nuovo agente" crea una conversazione; il workspace Design ha la **preview live**
  con il dev server (imposta l'URL, default `http://localhost:3000`) e il pulsante
  **Seleziona** per indicare un componente all'agente.

## Disinstallare

VS Code → pannello Estensioni → cerca **Agent Code** → ingranaggio → **Uninstall**.

---

*Nota: l'estensione è ~70MB perché include l'SDK di Claude. È firmata come publisher
`veliu` ma non pubblicata sul Marketplace — è normale che VS Code chieda conferma per un
VSIX locale.*
