import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// The webview is a single-page React app bundled into dist/webview with stable
// filenames so the extension can reference webview.js / webview.css directly.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  build: {
    outDir: "dist/webview",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "webview/main.tsx"),
      output: {
        entryFileNames: "webview.js",
        chunkFileNames: "webview-[name].js",
        assetFileNames: "webview.[ext]",
      },
    },
  },
});
