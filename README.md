<div align="center">

# Agent Code

**A designer-friendly VS Code mod: a multi-agent dashboard and a Preview / Design / Code
workspace, powered by real Claude Code.**

Free &amp; open source · MIT · English / Italiano

</div>

Agent Code turns VS Code into a calmer, designer-first surface without taking any of its
power away — because it *lives inside* VS Code. The agents and the chat are **real Claude
Code** (via the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)),
driving your existing logged-in `claude` CLI, so it reuses your Claude subscription with
no extra API key.

> Two surfaces, one extension:
> - **Agents dashboard** — your Claude Code multi-agents as status cards.
> - **Preview / Design / Code workspace** — a live preview, a chat with the agent, a
>   Cursor-style component picker, and a green-accented mini-IDE that can hand selected
>   code straight to the AI.

## Features

- **Real Claude Code chat** — streaming with **Markdown** rendering, inline **diffs** for
  edits, **approval** prompts, **AskUserQuestion** modals, **Plan mode**, `@`-mention of
  workspace files, image attachments (drag-drop / paste) and **Figma** (via MCP).
- **Live preview + Cursor-style picker** — hover-highlight any element and send its React
  component + source `file:line` to the agent. Works **cross-origin out of the box** via a
  tiny local reverse proxy (no snippet to add to your app).
- **Per-component AI panel** — pick a component to open a focused prompt panel (Edit /
  Prompt / Builder) that references the element's classes and source.
- **Mini-IDE Code view** — file tree, multi-tab editor, syntax highlighting, and
  **select code → ask the AI**: drag a line range and attach the exact snippet to chat.
- **Movable, minimizable modals** — drag approval/question/plan panels aside, minimize and
  reopen them, all without blocking the preview.
- **Real usage** — session tokens/cost, 5-hour & weekly windows, and account info.
- **OS notifications** when an agent needs you (only while the window isn't focused).
- **Persistence + resume** — agents and conversations survive reloads/restarts; reopening
  resumes the Claude session with full context.
- **English / Italian** — `auto` follows your VS Code language; switch any time in Settings.

## Requirements

- **VS Code** 1.96+ (or Cursor / VSCodium).
- For **real agents**: [Claude Code](https://docs.claude.com/claude-code) installed and
  logged in (a Claude subscription). Without it, Agent Code runs in a **simulated demo
  mode** so you can explore the UI — it tells you clearly when it does.

> No `ANTHROPIC_API_KEY` needed — Agent Code drives your logged-in `claude` CLI, so it uses
> your subscription, not pay-as-you-go billing.

## Install

**From a packaged build (`.vsix`):**

```bash
code --install-extension agent-code.vsix
# or in VS Code: Cmd/Ctrl+Shift+P → "Install from VSIX"
```

Then reload VS Code — the Agents dashboard opens on startup. See [INSTALL.md](INSTALL.md)
for a step-by-step guide (and a one-command `scripts/install.sh`).

**From source:**

```bash
npm install
npm run build        # builds the webview + the extension
# then press F5 in VS Code → "Run Agent Code (Extension)"
npm run package      # → agent-code.vsix
```

Dev loop: `npm run watch` (esbuild + Vite in watch) · checks: `npm run typecheck`,
`npm test`.

## Commands

`Cmd/Ctrl+Shift+P`:

- **Agent Code: Open Agents Dashboard**
- **Agent Code: Open Design Workspace**
- **Agent Code: New Agent**
- **Agent Code: Immersive Mode** (⌘⌥I / Ctrl+Alt+I — Zen full-screen)

## Settings (`agentCode.*`)

| Setting | Default | Description |
|---|---|---|
| `language` | `auto` | UI language: `auto` (VS Code locale) · `en` · `it` |
| `openDashboardOnStartup` | `true` | Open the Agents dashboard on startup |
| `backend` | `auto` | `auto` (real Claude if available, else mock) · `mock` · `claude` |
| `defaultMode` | `bypassPermissions` | Permission mode new agents start in |
| `model` / `effort` | — | Default model / reasoning effort for new agents |
| `previewUrl` | `http://localhost:3000` | Dev-server URL shown in the Design preview |
| `figmaMcpUrl` | `http://127.0.0.1:3845/sse` | Figma Dev-Mode MCP server (attach Figma frames) |
| `fullAccess` | `true` | Max capability (no sandbox, reach your home dir) — turn off to lock down |

## Architecture

**Extension-first.** All the logic lives in a self-contained VS Code extension; an
optional [thin fork of VS Code](fork/) (for custom chrome) reuses the same extension.

```
src/
  extension.ts            activation, commands, persistence, language
  i18n.ts                 host-side t("en","it")
  agents/                 AgentManager + AgentBackend (Claude SDK / Mock)
  panels/                 the two webview panels + CSP html
  preview/PreviewProxy.ts local reverse proxy that injects the picker cross-origin
  shared/protocol.ts      typed messages between host and webview
webview/                  React 18 + Vite + Tailwind v4 UI
  i18n.ts                 webview-side t("en","it")
  views/dashboard/        the Agents dashboard
  views/design/           Preview / Design / Code + chat
preview/                  headless screenshot harnesses (not shipped)
```

- **Host**: TypeScript bundled with esbuild → `dist/extension.js`.
- **Webview**: React + Vite + Tailwind → `dist/webview/`.

## Contributing

Issues and PRs welcome. Keep `npm run typecheck`, `npm run build`, and `npm test` green.
UI strings are inline-translated with `t("English", "Italiano")` — add both languages when
you add copy. See [CLAUDE.md](CLAUDE.md) for an architecture-oriented overview.

## License

[MIT](LICENSE) © Elyas Tirit
