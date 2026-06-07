// Agent Code — element picker (Cursor-style). Runs INSIDE the previewed page.
// Auto-injected when same-origin; for cross-origin dev servers add
//   <script src="/picker.js"></script>  to your app in development.
// Hover highlights the element + its React component; click sends the element,
// its text, CSS selector AND the React component name + source (file:line) to
// the host so Claude knows exactly what you mean.
(function () {
  if (window.__acPicker) return;
  window.__acPicker = true;
  var on = false, box = null, cur = null;

  function ensureBox() {
    if (box) return box;
    box = document.createElement("div");
    box.style.cssText =
      "position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #70fff3;" +
      "background:rgba(112,255,243,0.12);border-radius:4px;box-shadow:0 0 0 1px rgba(0,0,0,0.4),0 0 18px rgba(112,255,243,0.5);" +
      "transition:left .05s,top .05s,width .05s,height .05s;display:none";
    var lab = document.createElement("div");
    lab.style.cssText =
      "position:absolute;top:-23px;left:-2px;background:#0b0b0b;color:#70fff3;" +
      "font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;padding:1px 7px;border-radius:6px;white-space:nowrap";
    box.appendChild(lab);
    box.__lab = lab;
    (document.body || document.documentElement).appendChild(box);
    return box;
  }

  function selectorFor(el) {
    var parts = [], n = el;
    for (var d = 0; n && n.nodeType === 1 && d < 4; d++) {
      var s = n.tagName.toLowerCase();
      if (n.id) { s += "#" + n.id; parts.unshift(s); break; }
      var c = (n.className && n.className.toString().trim()) || "";
      if (c) s += "." + c.split(/\s+/).slice(0, 2).join(".");
      var p = n.parentElement;
      if (p) {
        var sb = Array.prototype.filter.call(p.children, function (x) { return x.tagName === n.tagName; });
        if (sb.length > 1) s += ":nth-of-type(" + (sb.indexOf(n) + 1) + ")";
      }
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(" > ");
  }

  // Walk the React fiber to find the nearest component name + source file:line.
  function fiberInfo(el) {
    try {
      var key = Object.keys(el).find(function (k) {
        return k.indexOf("__reactFiber$") === 0 || k.indexOf("__reactInternalInstance$") === 0;
      });
      var fiber = key ? el[key] : null;
      var name = "", source = "", hops = 0;
      while (fiber && hops < 30) {
        var t = fiber.type;
        if (t && (typeof t === "function" || typeof t === "object")) {
          var nm = t.displayName || t.name || (t.render && (t.render.displayName || t.render.name));
          if (nm && !name && nm[0] === nm[0].toUpperCase()) name = nm;
        }
        var ds = fiber._debugSource;
        if (ds && ds.fileName && !source) {
          source = ds.fileName.split("/").slice(-2).join("/") + ":" + ds.lineNumber;
        }
        if (name && source) break;
        fiber = fiber.return;
        hops++;
      }
      return { component: name, source: source };
    } catch (e) {
      return { component: "", source: "" };
    }
  }

  function move(e) {
    if (!on) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === box || el === cur) return;
    cur = el;
    var r = el.getBoundingClientRect(), b = ensureBox(), fi = fiberInfo(el);
    b.style.display = "block";
    b.style.left = r.left + "px";
    b.style.top = r.top + "px";
    b.style.width = r.width + "px";
    b.style.height = r.height + "px";
    b.__lab.textContent = fi.component
      ? "<" + fi.component + ">" + (fi.source ? "  " + fi.source : "")
      : "<" + el.tagName.toLowerCase() + ">" + (el.id ? "#" + el.id : "");
  }

  function click(e) {
    if (!on) return;
    e.preventDefault();
    e.stopPropagation();
    var el = cur || document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    var fi = fiberInfo(el);
    parent.postMessage(
      {
        source: "ac-picker",
        type: "ac-picked",
        info: {
          tag: el.tagName.toLowerCase(),
          id: el.id || "",
          cls: (el.className && el.className.toString()) || "",
          text: (el.innerText || el.textContent || "").trim().slice(0, 160),
          selector: selectorFor(el),
          component: fi.component,
          sourceLoc: fi.source,
        },
      },
      "*",
    );
    disable();
  }

  function enable() {
    on = true;
    document.addEventListener("mousemove", move, true);
    document.addEventListener("click", click, true);
    if (document.body) document.body.style.cursor = "crosshair";
  }
  function disable() {
    on = false;
    document.removeEventListener("mousemove", move, true);
    document.removeEventListener("click", click, true);
    cur = null;
    if (box) box.style.display = "none";
    if (document.body) document.body.style.cursor = "";
  }

  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.source !== "ac-host") return;
    if (d.type === "ac-pick") (d.on ? enable : disable)();
  });

  parent.postMessage({ source: "ac-picker", type: "ac-picker-ready" }, "*");
})();
