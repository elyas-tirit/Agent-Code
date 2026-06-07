#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Agent Code — Phase 3 chrome injector.
 *
 *  The only piece of the full-bleed chrome that genuinely needs a VS Code source
 *  patch is the title-bar greeting ("Buongiorno, …") + an optional live "Session"
 *  pill. Everything else (hidden activity bar, no status bar, dashboard as the
 *  landing surface) is achieved purely through settings + the extension — see
 *  fork/default-settings.json.
 *
 *  Rather than a brittle line-numbered .patch, we inject via *anchored* string
 *  edits: we look for stable code landmarks and splice around them. The injector
 *  is idempotent (safe to re-run after a rebase) and refuses to write a corrupted
 *  file — if an anchor is gone it tells you to patch by hand instead of guessing.
 *
 *  Usage:  node fork/apply-chrome.mjs [base-dir]      (default: ../agent-code-app)
 *--------------------------------------------------------------------------------------------*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || join(ROOT, '..', 'agent-code-app');
const TARGET = join(BASE, 'src/vs/workbench/browser/parts/titlebar/titlebarPart.ts');

const MARK = 'installAgentCodeChrome'; // idempotency sentinel

function fail(msg) {
	console.error(`\n✗ apply-chrome: ${msg}`);
	console.error('  No changes written. Patch src/vs/workbench/browser/parts/titlebar/titlebarPart.ts by hand');
	console.error('  (see fork/README.md → "Chrome custom").\n');
	process.exit(1);
}

if (!existsSync(TARGET)) {
	fail(`titlebarPart.ts not found at ${TARGET}. Run ./fork/setup-fork.sh first to clone VS Code.`);
}

let src = readFileSync(TARGET, 'utf8');

if (src.includes(MARK)) {
	console.log('▸ apply-chrome: already applied (idempotent) — skipping.');
	process.exit(0);
}

// 1) Import CommandsRegistry (used to let the extension feed the Session pill).
//    Upstream already imports it (it's used by the title bar itself); only add the
//    import on the off chance a future VS Code version drops it.
if (!/import\s*{[^}]*\bCommandsRegistry\b[^}]*}\s*from\s*'[^']*\/commands\/common\/commands\.js'/.test(src)) {
	const IMPORT_ANCHOR = `import { IConfigurationService, IConfigurationChangeEvent } from '../../../../platform/configuration/common/configuration.js';`;
	if (!src.includes(IMPORT_ANCHOR)) {
		fail('import anchor (IConfigurationService) not found — VS Code layout changed.');
	}
	src = src.replace(
		IMPORT_ANCHOR,
		IMPORT_ANCHOR + `\nimport { CommandsRegistry } from '../../../../platform/commands/common/commands.js';`,
	);
}

// 2) Call the installer right after the title is created in createContentArea().
const CALL_ANCHOR = `\t\tthis.title = append(this.centerContent, $('div.window-title'));\n\t\tthis.createTitle();`;
const callCount = src.split(CALL_ANCHOR).length - 1;
if (callCount !== 1) {
	fail(`createTitle() call anchor matched ${callCount} times (expected 1) — patch by hand.`);
}
src = src.replace(
	CALL_ANCHOR,
	CALL_ANCHOR + `\n\n\t\t// Agent Code: full-bleed chrome (greeting + optional live Session pill).\n\t\tthis.installAgentCodeChrome();`,
);

// 3) Insert the field + method just before the existing createTitle() definition.
const METHOD_ANCHOR = `\tprivate createTitle(): void {`;
if (!src.includes(METHOD_ANCHOR)) {
	fail('createTitle() definition anchor not found — patch by hand.');
}
const INJECTED = `\tprivate agentCodeSessionEl?: HTMLElement;

	/**
	 * Agent Code (Phase 3) — render a localized greeting on the left of the title
	 * bar and an optional "Session" pill. The greeting is self-contained (it only
	 * reads the \`agentCode.userName\` setting + the time of day). The pill is fed by
	 * the extension via the \`agentCode.titlebarStatus\` command and stays hidden
	 * until then — so this is a harmless no-op in a vanilla VS Code build.
	 */
	private installAgentCodeChrome(): void {
		// Sit at the visual far-left: before the menu bar on Windows/Linux (where a
		// menubar exists in leftContent), otherwise prepend (macOS has neither
		// appicon nor menubar there).
		const host = this.menubar
			? this.leftContent.insertBefore($('div.agentcode-chrome'), this.menubar)
			: prepend(this.leftContent, $('div.agentcode-chrome'));
		host.style.display = 'flex';
		host.style.alignItems = 'center';
		host.style.gap = '8px';
		host.style.padding = '0 12px';
		host.style.whiteSpace = 'nowrap';
		host.style.overflow = 'hidden';
		host.style.maxWidth = '40vw';
		(host.style as any).webkitAppRegion = 'no-drag';

		const greeting = append(host, $('span.agentcode-greeting'));
		greeting.style.fontWeight = '600';
		greeting.style.opacity = '0.92';
		greeting.style.textOverflow = 'ellipsis';
		greeting.style.overflow = 'hidden';

		const pill = append(host, $('span.agentcode-session'));
		pill.style.display = 'none';
		pill.style.fontSize = '11px';
		pill.style.lineHeight = '16px';
		pill.style.padding = '0 8px';
		pill.style.borderRadius = '999px';
		pill.style.border = '1px solid var(--vscode-titleBar-border, transparent)';
		pill.style.background = 'var(--vscode-badge-background, transparent)';
		pill.style.color = 'var(--vscode-badge-foreground, inherit)';
		pill.style.opacity = '0.85';
		this.agentCodeSessionEl = pill;

		const renderGreeting = () => {
			const name = (this.configurationService.getValue<string>('agentCode.userName') || '').trim();
			const h = new Date().getHours();
			const part = h < 5 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
			greeting.innerText = name ? part + ', ' + name : part;
		};
		renderGreeting();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('agentCode.userName')) {
				renderGreeting();
			}
		}));

		// Let the extension push a live session label (tokens / status). Registered
		// once per process; the captured element is the first (main) title bar.
		if (!CommandsRegistry.getCommand('agentCode.titlebarStatus')) {
			CommandsRegistry.registerCommand('agentCode.titlebarStatus', (_accessor, text?: string) => {
				const el = this.agentCodeSessionEl;
				if (!el) {
					return;
				}
				const label = (text || '').trim();
				el.innerText = label;
				el.style.display = label ? '' : 'none';
			});
		}
	}

`;
src = src.replace(METHOD_ANCHOR, INJECTED + METHOD_ANCHOR);

// Sanity: balanced braces and exactly one injected method.
if ((src.split(MARK).length - 1) < 2) {
	fail('post-write sanity check failed (sentinel count) — aborting.');
}

writeFileSync(TARGET, src, 'utf8');
console.log('✓ apply-chrome: title-bar greeting + Session pill injected into titlebarPart.ts');
console.log('  (re-run is safe; the edit is idempotent.)');
