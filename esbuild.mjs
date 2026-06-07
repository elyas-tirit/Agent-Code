import esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");

// Copy media assets (robot avatar, background video) into the webview bundle dir
// so the webview can reference them via asWebviewUri. Runs after vite (which
// empties dist/webview), so do it here on every (re)build.
function copyMedia() {
  if (!existsSync("media")) return;
  mkdirSync("dist/webview/media", { recursive: true });
  cpSync("media", "dist/webview/media", { recursive: true });
  console.log("[esbuild] media copied to dist/webview/media");
}

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node18",
  // vscode is provided by the runtime; the SDK is loaded dynamically and kept external.
  external: ["vscode", "@anthropic-ai/claude-agent-sdk"],
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const mediaPlugin = {
    name: "copy-media",
    setup(build) {
      build.onEnd(() => copyMedia());
    },
  };
  const ctx = await esbuild.context({ ...options, plugins: [mediaPlugin] });
  await ctx.watch();
  console.log("[esbuild] watching extension...");
} else {
  await esbuild.build(options);
  copyMedia();
  console.log("[esbuild] extension built.");
}
