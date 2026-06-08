# Agent Code — install guide (for testers)

**Agent Code** is a designer-friendly VS Code mod: a dashboard of Claude Code agents as
cards + a Preview/Design/Code workspace with a chat and a Cursor-style "select component"
tool. It installs as an **extension** inside your VS Code (or Cursor / VSCodium).

## What you need

1. **VS Code** (or Cursor / VSCodium) installed → https://code.visualstudio.com
2. **For REAL agents**: [Claude Code](https://docs.claude.com/claude-code) installed and
   logged in (a Claude subscription).
   ```bash
   npm install -g @anthropic-ai/claude-code   # installs the `claude` CLI
   claude                                      # run it once and log in
   ```
   Without Claude Code the app still starts in **demo mode (simulated)**: you see the UI
   and fake agents, but the answers aren't real. It tells you so clearly at the top.

## Install (easy way, macOS / Linux)

Open a terminal in the folder you received and run:

```bash
./install.sh
```

It finds VS Code / Cursor on its own and installs the extension. Then **restart VS Code**.

## Install (manual, any OS)

1. Open VS Code.
2. `Cmd/Ctrl + Shift + P` → type **"Install from VSIX"** → Enter.
3. Choose the **`agent-code.vsix`** file.
4. **Restart VS Code** (or run `Developer: Reload Window`).

## Using it

- After restarting, the **Agents dashboard opens automatically**. If it doesn't:
  `Cmd/Ctrl + Shift + P` → **"Agent Code: Open Agents Dashboard"**.
- "New agent" starts a conversation; the Design workspace has a **live preview** of your
  dev server (set the URL, default `http://localhost:3000`) and a **Select** button to
  point the agent at a component.
- Language follows your VS Code locale by default — switch English/Italian in Settings.

## Uninstall

VS Code → Extensions panel → search **Agent Code** → gear icon → **Uninstall**.

---

*Note: the extension is ~70MB because it bundles the Claude SDK. It isn't published on the
Marketplace, so VS Code asks you to confirm installing a local VSIX — that's expected.*
