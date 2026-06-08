import type { ClientMessage, HostMessage, WebviewView } from "@shared/protocol";

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  interface Window {
    __AGENT_CODE__?: { view: WebviewView; state: unknown; media?: string; lang?: "en" | "it" };
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

const api: VsCodeApi | undefined = window.acquireVsCodeApi?.();

export const bootstrap = window.__AGENT_CODE__ ?? {
  view: "dashboard" as WebviewView,
  state: undefined,
  media: "",
};

/** Initial UI language resolved by the host ("en" | "it"). */
export const LANG: "en" | "it" = bootstrap.lang === "it" ? "it" : "en";

/** Base webview URI of dist/webview/media (robot avatar, bg video, …). */
export const MEDIA = (bootstrap.media ?? "").replace(/\/$/, "");
export const mediaUrl = (file: string): string => (MEDIA ? `${MEDIA}/${file}` : file);

export function post(message: ClientMessage): void {
  api?.postMessage(message);
}

export function onHostMessage(cb: (message: HostMessage) => void): () => void {
  const handler = (event: MessageEvent) => cb(event.data as HostMessage);
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
