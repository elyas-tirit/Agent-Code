import { useEffect, useRef, useState } from "react";
import type { DesignMode, SelectedComponent } from "@shared/protocol";
import { Icon, IconName } from "../../ui/Icon";
import { mediaUrl } from "../../vscode";

interface PreviewCanvasProps {
  mode: DesignMode;
  /** Real dev-server URL: shown in the URL bar and attached to selections. */
  url: string;
  /** What the iframe loads — the local proxy that injects the picker (falls back
   *  to `url` when the proxy isn't available). */
  proxyUrl?: string;
  /** Bumped by the host to force an iframe reload (e.g. after the URL changes). */
  reloadKey?: number;
  onSetUrl: (url: string) => void;
  onSelect: (component: SelectedComponent) => void;
}

interface Device {
  id: string;
  label: string;
  icon: IconName;
  width: number; // 0 = full width
  category: "desktop" | "tablet" | "mobile";
}

const DEVICES: Device[] = [
  { id: "desktop", label: "Desktop", icon: "monitor", width: 0, category: "desktop" },
  { id: "laptop", label: "Laptop · 1280", icon: "monitor", width: 1280, category: "desktop" },
  { id: "ipad", label: "iPad · 834", icon: "tablet", width: 834, category: "tablet" },
  { id: "ipad-pro", label: "iPad Pro · 1024", icon: "tablet", width: 1024, category: "tablet" },
  { id: "iphone-15", label: "iPhone 15 · 393", icon: "smartphone", width: 393, category: "mobile" },
  { id: "iphone-se", label: "iPhone SE · 375", icon: "smartphone", width: 375, category: "mobile" },
];
const DESKTOP = DEVICES[0];
const DEFAULT_DEVICE = DEVICES.find((d) => d.id === "ipad")!;

type BgKind = "white" | "dark" | "checker";
const BG: Record<BgKind, string> = {
  white: "#ffffff",
  dark: "#0e0e0e",
  checker:
    "repeating-conic-gradient(#cfcfcf 0% 25%, #ffffff 0% 50%) 50% / 22px 22px",
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Element picker injected into the previewed page (same-origin). Mirrors
// media/picker.js (which devs can add manually for cross-origin servers).
const PICKER_SRC = `(function(){if(window.__acPicker)return;window.__acPicker=true;var on=false,box=null,cur=null;function eb(){if(box)return box;box=document.createElement('div');box.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #70fff3;background:rgba(112,255,243,.12);border-radius:4px;box-shadow:0 0 0 1px rgba(0,0,0,.4),0 0 18px rgba(112,255,243,.5);transition:left .05s,top .05s,width .05s,height .05s;display:none';var l=document.createElement('div');l.style.cssText='position:absolute;top:-22px;left:-2px;background:#0b0b0b;color:#70fff3;font:11px/1.5 ui-monospace,monospace;padding:1px 6px;border-radius:5px;white-space:nowrap';box.appendChild(l);box.__l=l;(document.body||document.documentElement).appendChild(box);return box;}
function sel(el){var p=[],n=el;for(var d=0;n&&n.nodeType===1&&d<4;d++){var s=n.tagName.toLowerCase();if(n.id){s+='#'+n.id;p.unshift(s);break;}var c=(n.className&&n.className.toString().trim())||'';if(c)s+='.'+c.split(/\\s+/).slice(0,2).join('.');var pa=n.parentElement;if(pa){var sb=Array.prototype.filter.call(pa.children,function(x){return x.tagName===n.tagName;});if(sb.length>1)s+=':nth-of-type('+(sb.indexOf(n)+1)+')';}p.unshift(s);n=n.parentElement;}return p.join(' > ');}
function mv(e){if(!on)return;var el=document.elementFromPoint(e.clientX,e.clientY);if(!el||el===box||el===cur)return;cur=el;var r=el.getBoundingClientRect(),b=eb();b.style.display='block';b.style.left=r.left+'px';b.style.top=r.top+'px';b.style.width=r.width+'px';b.style.height=r.height+'px';b.__l.textContent='<'+el.tagName.toLowerCase()+'>'+(el.id?'#'+el.id:'')+(el.textContent?'  "'+el.textContent.trim().slice(0,24)+'"':'');}
function ck(e){if(!on)return;e.preventDefault();e.stopPropagation();var el=cur||document.elementFromPoint(e.clientX,e.clientY);if(!el)return;parent.postMessage({source:'ac-picker',type:'ac-picked',info:{tag:el.tagName.toLowerCase(),id:el.id||'',cls:(el.className&&el.className.toString())||'',text:(el.innerText||el.textContent||'').trim().slice(0,160),selector:sel(el)}},'*');dis();}
function en(){on=true;document.addEventListener('mousemove',mv,true);document.addEventListener('click',ck,true);if(document.body)document.body.style.cursor='crosshair';}
function dis(){on=false;document.removeEventListener('mousemove',mv,true);document.removeEventListener('click',ck,true);cur=null;if(box)box.style.display='none';if(document.body)document.body.style.cursor='';}
function rdy(){parent.postMessage({source:'ac-picker',type:'ac-picker-ready'},'*');}
window.addEventListener('message',function(e){var d=e.data||{};if(d.source!=='ac-host')return;if(d.type==='ac-pick')(d.on?en:dis)();else if(d.type==='ac-ping')rdy();});
rdy();})();`;

function ToolbarButton({
  icon,
  title,
  active,
  onClick,
}: {
  icon: IconName;
  title: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex size-8 items-center justify-center rounded-lg transition-colors ${
        active ? "bg-[#4067e8] text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon name={icon} size={17} />
    </button>
  );
}

export function PreviewCanvas({ mode, url, proxyUrl, reloadKey, onSetUrl, onSelect }: PreviewCanvasProps) {
  const iframeSrc = proxyUrl || url;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [draftUrl, setDraftUrl] = useState(url);
  const [device, setDevice] = useState<Device>(DESKTOP);
  const [lastDevice, setLastDevice] = useState<Device>(DEFAULT_DEVICE);
  const [deviceMenu, setDeviceMenu] = useState(false);
  const [settingsMenu, setSettingsMenu] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pickerReady, setPickerReady] = useState(false);

  // selection
  const [selecting, setSelecting] = useState(false);
  const [hover, setHover] = useState<Rect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [pendingRect, setPendingRect] = useState<Rect | null>(null);
  const [label, setLabel] = useState("");

  // preview settings
  const [bg, setBg] = useState<BgKind>("white");
  const [zoom, setZoom] = useState(100);
  const [grid, setGrid] = useState(false);

  useEffect(() => setDraftUrl(url), [url]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Element picker: receive ready + picked-element messages from the iframe.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== "ac-picker") return;
      if (d.type === "ac-picker-ready") setPickerReady(true);
      else if (d.type === "ac-picked" && d.info) {
        const info = d.info;
        const head = info.component ? `<${info.component}>` : `<${info.tag}>`;
        const label =
          head +
          (info.text ? ` "${String(info.text).slice(0, 40)}"` : "") +
          (!info.component && info.id ? ` #${info.id}` : "");
        onSelect({
          label,
          url,
          device: device.label,
          tag: info.tag,
          text: info.text,
          selector: info.selector,
          component: info.component || undefined,
          source: info.sourceLoc || undefined,
          file: info.sourceFile || undefined,
          line: info.sourceLine || undefined,
        });
        setSelecting(false);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [url, device.label, onSelect]);

  // Toggle the in-page picker as the Seleziona mode changes.
  useEffect(() => {
    if (!pickerReady) return;
    iframeRef.current?.contentWindow?.postMessage({ source: "ac-host", type: "ac-pick", on: selecting }, "*");
  }, [selecting, pickerReady]);

  // Load the full picker (with React-fiber component detection) from media/;
  // fall back to the inlined minimal picker if the fetch fails.
  const pickerSrc = useRef("");
  useEffect(() => {
    fetch(mediaUrl("picker.js"))
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => {
        pickerSrc.current = t;
      })
      .catch(() => {});
  }, []);

  const onIframeLoad = () => {
    setPickerReady(false);
    try {
      // Same-origin fallback injection (no-op cross-origin — the proxy injects there).
      const doc = iframeRef.current?.contentDocument;
      if (doc && doc.body) {
        const s = doc.createElement("script");
        s.textContent = pickerSrc.current || PICKER_SRC;
        doc.body.appendChild(s);
      }
    } catch {
      /* cross-origin: the preview proxy injects the picker server-side */
    }
    // The proxy-injected picker runs before this load event (which reset
    // pickerReady), so ping it to re-confirm readiness. postMessage works
    // cross-origin; the picker replies with ac-picker-ready.
    iframeRef.current?.contentWindow?.postMessage({ source: "ac-host", type: "ac-ping" }, "*");
  };

  const refresh = () => {
    // Reload through the proxy (iframeSrc), not the raw url — otherwise the
    // picker injection is lost and React re-navigates back to the proxy (flash).
    if (iframeRef.current) iframeRef.current.src = iframeSrc;
  };

  // Two-state toggle: desktop ↔ the chosen device (default iPad). The hover
  // menu picks which device the toggle switches to.
  const toggleDevice = () => setDevice(device.category === "desktop" ? lastDevice : DESKTOP);
  const pickDevice = (d: Device) => {
    setDevice(d);
    if (d.category !== "desktop") setLastDevice(d);
    setDeviceMenu(false);
  };

  const toggleFullscreen = () => {
    const el = canvasRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  // --- selection geometry -----------------------------------------------------
  const stageRect = () => stageRef.current?.getBoundingClientRect();
  const toLocal = (e: React.MouseEvent): { x: number; y: number } | null => {
    const r = stageRect();
    if (!r) return null;
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onOverlayMove = (e: React.MouseEvent) => {
    const p = toLocal(e);
    const r = stageRect();
    if (!p || !r) return;
    if (dragStart) {
      setHover({
        x: Math.min(dragStart.x, p.x),
        y: Math.min(dragStart.y, p.y),
        w: Math.abs(p.x - dragStart.x),
        h: Math.abs(p.y - dragStart.y),
      });
    } else {
      // Reticle around the cursor — the affordance that shows what you'll grab.
      const s = 120;
      setHover({ x: p.x - s / 2, y: p.y - s / 2, w: s, h: s });
    }
  };

  const onOverlayDown = (e: React.MouseEvent) => {
    const p = toLocal(e);
    if (p) setDragStart(p);
  };

  const onOverlayUp = (e: React.MouseEvent) => {
    const p = toLocal(e);
    const r = stageRect();
    if (!p || !r) return;
    const start = dragStart ?? { x: p.x - 60, y: p.y - 60 };
    const rect: Rect = {
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.max(Math.abs(p.x - start.x), 80),
      h: Math.max(Math.abs(p.y - start.y), 40),
    };
    setPendingRect(rect);
    setDragStart(null);
  };

  const confirmSelection = () => {
    const r = stageRect();
    if (!pendingRect || !r) return;
    const norm = {
      x: pendingRect.x / r.width,
      y: pendingRect.y / r.height,
      w: pendingRect.w / r.width,
      h: pendingRect.h / r.height,
    };
    onSelect({
      label: label.trim() || `Area su ${device.label}`,
      url,
      device: device.label,
      rect: norm,
    });
    setSelecting(false);
    setPendingRect(null);
    setHover(null);
    setLabel("");
  };

  const cancelSelection = () => {
    setSelecting(false);
    setPendingRect(null);
    setHover(null);
    setDragStart(null);
    setLabel("");
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <ToolbarButton icon="refresh" title="Ricarica" onClick={refresh} />
        <form
          className="flex min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            onSetUrl(draftUrl);
          }}
        >
          <input
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            className="w-full rounded-md bg-black/30 px-3 py-1.5 text-[13px] text-white/80 outline-none ring-1 ring-transparent transition-shadow focus:ring-[#4067e8]/50 placeholder:text-white/30"
            placeholder="http://localhost:3000"
          />
        </form>

        {mode === "design" && (
          <button
            onClick={() => (selecting ? cancelSelection() : setSelecting(true))}
            title="Seleziona un'area da spiegare all'agente"
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] transition-colors ${
              selecting ? "bg-[#70fff3] text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon name="cursor" size={15} />
            Seleziona
          </button>
        )}

        <div className="mx-1 h-5 w-px bg-white/10" />

        {/* Device picker — click cycles, hover reveals presets */}
        <div
          className="relative"
          onMouseEnter={() => setDeviceMenu(true)}
          onMouseLeave={() => setDeviceMenu(false)}
        >
          <button
            onClick={toggleDevice}
            title={device.category === "desktop" ? `Passa a ${lastDevice.label}` : "Torna a Desktop"}
            className={`flex h-8 items-center gap-1 rounded-lg px-2 transition-colors ${
              device.category !== "desktop" ? "bg-[#4067e8]/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon name={device.icon} size={17} />
            <Icon name="chevron-down" size={12} className="text-white/40" />
          </button>
          {deviceMenu && (
            <div className="ac-pop absolute right-0 top-9 z-50 w-[220px] rounded-xl border border-white/10 bg-[#1b1b1b] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
              <div className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-white/35">Scegli dispositivo</div>
              {DEVICES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => pickDevice(d)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors ${
                    device.id === d.id ? "bg-[#4067e8]/20 text-white" : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  <Icon name={d.icon} size={15} className="text-white/55" />
                  <span className="flex-1">{d.label}</span>
                  {device.id === d.id && <Icon name="check" size={14} className="text-[#70fff3]" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Preview settings (replaces Play) */}
        <div className="relative">
          <ToolbarButton icon="sliders" title="Impostazioni preview" active={settingsMenu} onClick={() => setSettingsMenu((s) => !s)} />
          {settingsMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSettingsMenu(false)} />
              <div className="ac-pop absolute right-0 top-9 z-50 w-[240px] rounded-xl border border-white/10 bg-[#1b1b1b] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
                <div className="mb-2 text-[11px] uppercase tracking-wide text-white/35">Sfondo</div>
                <div className="mb-3 flex gap-1.5">
                  {(["white", "dark", "checker"] as BgKind[]).map((b) => (
                    <button
                      key={b}
                      onClick={() => setBg(b)}
                      className={`h-7 flex-1 rounded-md text-[11px] capitalize ring-1 transition ${bg === b ? "ring-[#70fff3]" : "ring-white/10"}`}
                      style={{ background: b === "checker" ? BG.checker : BG[b], color: b === "white" ? "#333" : "#fff" }}
                    >
                      {b === "white" ? "Bianco" : b === "dark" ? "Scuro" : "Trasp."}
                    </button>
                  ))}
                </div>
                <div className="mb-2 flex items-center justify-between text-[12px] text-white/70">
                  <span>Zoom</span>
                  <span className="text-white/45">{zoom}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={150}
                  step={5}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="mb-3 w-full accent-[#4067e8]"
                />
                <button
                  onClick={() => setGrid((g) => !g)}
                  className="flex w-full items-center justify-between rounded-md px-1 py-1 text-[12.5px] text-white/80 hover:bg-white/5"
                >
                  Griglia
                  <span className={`h-4 w-7 rounded-full p-0.5 transition-colors ${grid ? "bg-[#4067e8]" : "bg-white/15"}`}>
                    <span className={`block size-3 rounded-full bg-white transition-transform ${grid ? "translate-x-3" : ""}`} />
                  </span>
                </button>
              </div>
            </>
          )}
        </div>

        <ToolbarButton icon={fullscreen ? "minimize" : "maximize"} title="Schermo intero" onClick={toggleFullscreen} />
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative flex min-h-0 flex-1 items-stretch justify-center overflow-hidden rounded-xl"
        style={{ background: bg === "checker" ? BG.checker : BG[bg] }}
      >
        <div
          ref={stageRef}
          className="relative h-full overflow-hidden bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)] transition-[width] duration-300"
          style={{
            width: device.width ? Math.min(device.width, 100000) : "100%",
            maxWidth: "100%",
            transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
            transformOrigin: "top center",
          }}
        >
          <iframe
            key={reloadKey ?? 0}
            ref={iframeRef}
            src={iframeSrc}
            title="preview"
            onLoad={onIframeLoad}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />

          {/* Picker active (in-page element highlighting handled inside the iframe) */}
          {selecting && pickerReady && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-[12px] text-white">
              Passa sopra un elemento e cliccalo per spiegarlo all'agente
            </div>
          )}

          {grid && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(64,103,232,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(64,103,232,0.18) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />
          )}

          {/* Selection overlay — area fallback when no in-page picker is available */}
          {selecting && !pickerReady && (
            <div
              className="absolute inset-0 cursor-crosshair bg-[#4067e8]/[0.06]"
              onMouseMove={onOverlayMove}
              onMouseDown={onOverlayDown}
              onMouseUp={onOverlayUp}
            >
              <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-[12px] text-white">
                Trascina per selezionare un'area · oppure clicca un punto
              </div>
              {hover && !pendingRect && (
                <div
                  className="pointer-events-none absolute rounded-md border-2 border-[#70fff3] bg-[#70fff3]/10 transition-[left,top] duration-75"
                  style={{ left: hover.x, top: hover.y, width: hover.w, height: hover.h }}
                />
              )}
              {pendingRect && (
                <>
                  <div
                    className="pointer-events-none absolute rounded-md border-2 border-[#70fff3] bg-[#70fff3]/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                    style={{ left: pendingRect.x, top: pendingRect.y, width: pendingRect.w, height: pendingRect.h }}
                  />
                  <div
                    className="ac-pop absolute z-10 w-[260px] rounded-xl border border-white/10 bg-[#1b1b1b] p-2.5 shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
                    style={{
                      left: Math.min(pendingRect.x, (stageRect()?.width ?? 300) - 270),
                      top: pendingRect.y + pendingRect.h + 8,
                    }}
                  >
                    <div className="mb-1.5 text-[12px] text-white/70">Cosa hai selezionato?</div>
                    <input
                      autoFocus
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && confirmSelection()}
                      placeholder='es. "il bottone Accedi", "la hero"…'
                      className="mb-2 w-full rounded-md bg-black/40 px-2.5 py-1.5 text-[13px] text-white outline-none ring-1 ring-white/10 focus:ring-[#70fff3]/60"
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={confirmSelection}
                        className="flex-1 rounded-md bg-gradient-to-r from-[#4067e8] to-[#70fff3] py-1.5 text-[12.5px] font-medium text-black"
                      >
                        Allega alla chat
                      </button>
                      <button onClick={cancelSelection} className="rounded-md bg-white/10 px-3 py-1.5 text-[12.5px] text-white/80 hover:bg-white/15">
                        Annulla
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
