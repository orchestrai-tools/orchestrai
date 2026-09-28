// Agent driver injected into every browser tab before page scripts run.
//
// The host calls `__wfAgent(call)` with `evaluateJavaScript` to outline the
// page, click, type and read the console messages kept since load; it checks
// the page's origin natively before every call. The entry point is frozen and
// non-configurable and the builtins it relies on are captured here, before any
// page script, so a page cannot swap them out from under it.
(function () {
  if (window.__wfAgent) return;

  const MAX_CONSOLE = 200;
  const MAX_LINES = 600;
  const MAX_CHARS = 24000;
  const TEXT_CAP = 160;
  const NAME_CAP = 80;

  const stringify = JSON.stringify;
  const now = Date.now;
  const inputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  const textareaValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  const dispatch = EventTarget.prototype.dispatchEvent;
  const Pointer = typeof PointerEvent === "function" ? PointerEvent : MouseEvent;

  // ── console ──
  const logs = [];
  function format(arg) {
    if (typeof arg === "string") return arg;
    if (arg instanceof Error) return arg.stack || String(arg);
    try {
      const text = stringify(arg);
      return text === undefined ? String(arg) : text;
    } catch {
      return String(arg);
    }
  }
  function record(level, args) {
    const text = Array.prototype.map.call(args, format).join(" ");
    logs.push({ level, text: text.slice(0, 1000), time: now() });
    if (logs.length > MAX_CONSOLE) logs.shift();
  }
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    const original = console[level];
    if (typeof original !== "function") continue;
    console[level] = function (...args) {
      try {
        record(level, args);
      } catch {
        // A message that cannot be recorded still reaches the real console.
      }
      return original.apply(this, args);
    };
  }
  window.addEventListener(
    "error",
    (e) => {
      if (e instanceof ErrorEvent) {
        const where = e.filename ? ` (${e.filename}:${e.lineno})` : "";
        record("error", [`Uncaught ${e.message}${where}`]);
      } else if (e.target && e.target !== window) {
        const t = e.target;
        record("error", [`Failed to load ${t.tagName.toLowerCase()} ${t.src || t.href || ""}`]);
      }
    },
    true,
  );
  window.addEventListener("unhandledrejection", (e) => {
    record("error", ["Unhandled promise rejection:", e.reason]);
  });

  // ── refs ──
  // A WeakMap tags elements without touching the DOM, so the same element
  // keeps its ref across snapshots until the page drops it.
  const refs = new Map();
  const ids = new WeakMap();
  let nextRef = 1;
  function refFor(el) {
    let id = ids.get(el);
    if (!id) {
      id = `e${nextRef++}`;
      ids.set(el, id);
      refs.set(id, new WeakRef(el));
    }
    return id;
  }
  function lookup(ref) {
    const el = refs.get(ref)?.deref();
    return el && el.isConnected ? el : null;
  }

  // ── outline ──
  function clean(text, cap) {
    const flat = (text || "").replace(/\s+/g, " ").trim();
    return flat.length > cap ? `${flat.slice(0, cap)}…` : flat;
  }
  function quote(text) {
    return stringify(text);
  }
  function styleOf(el) {
    const view = el.ownerDocument.defaultView || window;
    return view.getComputedStyle(el);
  }
  function hidden(el) {
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return true;
    const style = styleOf(el);
    return style.display === "none" || style.visibility === "hidden";
  }
  function hasBox(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }
  function labelText(el) {
    const doc = el.ownerDocument;
    const aria = el.getAttribute("aria-label");
    if (aria) return aria;
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const text = by
        .split(/\s+/)
        .map((id) => doc.getElementById(id)?.textContent || "")
        .join(" ");
      if (text.trim()) return text;
    }
    if (el.labels && el.labels.length) {
      return Array.from(el.labels, (l) => l.textContent).join(" ");
    }
    return "";
  }
  function nameOf(el) {
    const label = labelText(el);
    if (label.trim()) return clean(label, NAME_CAP);
    const tag = el.tagName;
    if (tag === "INPUT" && ["submit", "button", "reset"].includes(el.type)) {
      return clean(el.value, NAME_CAP);
    }
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      return clean(el.placeholder || el.title || el.name || "", NAME_CAP);
    }
    if (tag === "IMG") return clean(el.alt, NAME_CAP);
    const text = el.innerText !== undefined ? el.innerText : el.textContent;
    return clean(text || el.title || "", NAME_CAP);
  }

  const TEXT_INPUTS = new Set([
    "text",
    "search",
    "email",
    "url",
    "tel",
    "password",
    "number",
    "date",
    "datetime-local",
    "time",
    "month",
    "week",
    "",
  ]);
  const ROLES = new Set([
    "button",
    "link",
    "checkbox",
    "radio",
    "switch",
    "tab",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "combobox",
    "textbox",
    "searchbox",
    "slider",
    "treeitem",
  ]);
  const GROUPS = { FORM: "form", NAV: "navigation", DIALOG: "dialog", MAIN: "main" };
  const BLOCK = /^(block|flex|grid|list-item|table|table-row|table-cell|flow-root)$/;

  // The line for an element an agent can act on, or null for everything else.
  function control(el) {
    const tag = el.tagName;
    const role = el.getAttribute("role");
    if (tag === "A" && el.hasAttribute("href")) {
      return `link ${quote(nameOf(el))} [${refFor(el)}] → ${el.getAttribute("href")}`;
    }
    if (tag === "BUTTON" || (tag === "INPUT" && ["submit", "button", "reset"].includes(el.type))) {
      return `button ${quote(nameOf(el))} [${refFor(el)}]${el.disabled ? " disabled" : ""}`;
    }
    if (tag === "INPUT" && (el.type === "checkbox" || el.type === "radio")) {
      return `${el.type} ${quote(nameOf(el))} [${refFor(el)}] ${el.checked ? "checked" : "unchecked"}`;
    }
    if (tag === "INPUT" && TEXT_INPUTS.has(el.type)) {
      const value = el.type === "password" ? (el.value ? "(set)" : "(empty)") : quote(clean(el.value, TEXT_CAP));
      return `textbox ${quote(nameOf(el))} [${refFor(el)}] ${el.type || "text"} value=${value}`;
    }
    if (tag === "INPUT" && el.type !== "hidden") {
      return `input ${quote(nameOf(el))} [${refFor(el)}] ${el.type}`;
    }
    if (tag === "TEXTAREA") {
      return `textbox ${quote(nameOf(el))} [${refFor(el)}] multiline value=${quote(clean(el.value, TEXT_CAP))}`;
    }
    if (tag === "SELECT") {
      const options = Array.from(el.options, (o) => clean(o.label || o.text, 40)).slice(0, 12);
      const chosen = el.selectedOptions[0];
      return `select ${quote(nameOf(el))} [${refFor(el)}] value=${quote(chosen ? clean(chosen.label || chosen.text, 40) : "")} options: ${options.join(" | ")}`;
    }
    if (tag === "SUMMARY") return `button ${quote(nameOf(el))} [${refFor(el)}] (disclosure)`;
    if (role && ROLES.has(role)) {
      const state = el.getAttribute("aria-checked") || el.getAttribute("aria-selected");
      return `${role} ${quote(nameOf(el))} [${refFor(el)}]${state ? ` ${role === "tab" || role === "option" ? "selected" : "checked"}=${state}` : ""}`;
    }
    if (el.isContentEditable && !el.parentElement?.isContentEditable) {
      return `textbox ${quote(nameOf(el))} [${refFor(el)}] editable`;
    }
    if (el.hasAttribute("onclick") || (el.tabIndex >= 0 && el.hasAttribute("tabindex"))) {
      return `clickable ${quote(nameOf(el))} [${refFor(el)}]`;
    }
    return null;
  }

  function snapshot() {
    const lines = [];
    let chars = 0;
    let truncated = false;
    let pending = "";
    const push = (depth, line) => {
      if (truncated) return;
      const text = "  ".repeat(Math.min(depth, 8)) + line;
      if (lines.length >= MAX_LINES || chars + text.length > MAX_CHARS) {
        truncated = true;
        return;
      }
      lines.push(text);
      chars += text.length + 1;
    };
    const flush = (depth) => {
      const text = clean(pending, TEXT_CAP);
      pending = "";
      if (text) push(depth, `text ${quote(text)}`);
    };

    function children(node) {
      if (node.shadowRoot) return node.shadowRoot.childNodes;
      if (node.tagName === "SLOT") return node.assignedNodes({ flatten: true });
      if (node.tagName === "IFRAME") {
        try {
          const body = node.contentDocument?.body;
          return body ? [body] : [];
        } catch {
          return [];
        }
      }
      return node.childNodes;
    }

    function walk(node, depth) {
      if (truncated) return;
      if (node.nodeType === Node.TEXT_NODE) {
        pending += ` ${node.data}`;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        for (const child of Array.from(children(node))) walk(child, depth);
        return;
      }
      const el = node;
      const tag = el.tagName;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "HEAD"].includes(tag.toUpperCase())) return;
      if (hidden(el)) return;
      const line = control(el);
      if (line) {
        flush(depth);
        if (hasBox(el)) push(depth, line);
        if (tag !== "SELECT" && tag !== "TEXTAREA" && tag !== "INPUT" && !el.isContentEditable) {
          // A control's own text is its name; only nested controls are listed.
          const before = pending;
          for (const child of Array.from(children(el))) walk(child, depth + 1);
          pending = before;
        }
        return;
      }
      if (/^H[1-6]$/.test(tag)) {
        flush(depth);
        push(depth, `heading ${quote(nameOf(el))} (${tag.toLowerCase()})`);
        return;
      }
      if (tag === "IMG") {
        const alt = clean(el.alt, NAME_CAP);
        if (alt) {
          flush(depth);
          push(depth, `img ${quote(alt)}`);
        }
        return;
      }
      if (tag === "IFRAME" && !el.contentDocument) {
        flush(depth);
        push(depth, `iframe (another site, not readable) ${el.src || ""}`);
        return;
      }
      const group = GROUPS[tag] || (el.getAttribute("role") === "dialog" ? "dialog" : null);
      let inner = depth;
      if (group) {
        flush(depth);
        const name = labelText(el).trim();
        push(depth, `${group}${name ? ` ${quote(clean(name, NAME_CAP))}` : ""}:`);
        inner = depth + 1;
      }
      const block = group || BLOCK.test(styleOf(el).display);
      if (block) flush(depth);
      for (const child of Array.from(children(el))) walk(child, inner);
      if (block) flush(inner);
    }

    const root = document.body || document.documentElement;
    if (root) walk(root, 0);
    flush(0);
    return { tree: lines.join("\n"), truncated };
  }

  // ── acting ──
  function missing(ref) {
    return { error: `No element ${ref} on the page any more; take a new browser_snapshot.` };
  }
  function describe(el) {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  }
  function fire(el, Kind, type, init) {
    return dispatch.call(el, new Kind(type, init));
  }

  function click(ref) {
    const el = lookup(ref);
    if (!el) return missing(ref);
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const doc = el.ownerDocument;
    let note = "";
    const hit = typeof doc.elementFromPoint === "function" ? doc.elementFromPoint(x, y) : null;
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
      note = `${ref} is covered by ${describe(hit)} at its centre; the events went to ${ref} itself.`;
    }
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
    };
    const pointer = { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true };
    fire(el, Pointer, "pointerover", pointer);
    fire(el, MouseEvent, "mouseover", base);
    fire(el, Pointer, "pointermove", pointer);
    fire(el, MouseEvent, "mousemove", base);
    fire(el, Pointer, "pointerdown", { ...pointer, buttons: 1 });
    // A prevented mousedown keeps focus where it was, as in a real click.
    const focus = fire(el, MouseEvent, "mousedown", { ...base, buttons: 1, detail: 1 });
    if (focus && typeof el.focus === "function") el.focus({ preventScroll: true });
    fire(el, Pointer, "pointerup", pointer);
    fire(el, MouseEvent, "mouseup", { ...base, detail: 1 });
    // A synthetic click still runs activation: links follow, boxes toggle,
    // submit buttons submit.
    fire(el, MouseEvent, "click", { ...base, detail: 1 });
    const anchor = el.closest && el.closest("a[target=_blank]");
    if (anchor) {
      note += `${note ? " " : ""}The link opens a new window, which the in-app browser does not do; open ${anchor.href} with browser_navigate instead.`;
    }
    return { note };
  }

  // `keyCode` is not settable through KeyboardEventInit everywhere, and older
  // handlers still read it.
  function key(el, type) {
    const event = new KeyboardEvent(type, {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    Object.defineProperty(event, "keyCode", { get: () => 13 });
    Object.defineProperty(event, "which", { get: () => 13 });
    return dispatch.call(el, event);
  }

  function pressEnter(el) {
    const proceed = key(el, "keydown");
    key(el, "keypress");
    key(el, "keyup");
    // Enter in a single-line field submits its form; a synthetic key does not.
    if (proceed && el.tagName === "INPUT" && el.form) {
      if (typeof el.form.requestSubmit === "function") el.form.requestSubmit();
      else el.form.submit();
    }
  }

  function type(ref, text, submit) {
    const el = lookup(ref);
    if (!el) return missing(ref);
    el.scrollIntoView({ block: "center", inline: "center" });
    if (typeof el.focus === "function") el.focus({ preventScroll: true });
    const tag = el.tagName;
    if (tag === "SELECT") {
      const wanted = text.trim().toLowerCase();
      const option = Array.from(el.options).find(
        (o) => o.value.toLowerCase() === wanted || (o.label || o.text).trim().toLowerCase() === wanted,
      );
      if (!option) {
        return { error: `${ref} has no option ${quote(text)}; its options are listed in browser_snapshot.` };
      }
      option.selected = true;
    } else if (tag === "INPUT" && (el.type === "checkbox" || el.type === "radio")) {
      return { error: `${ref} is a ${el.type}; use browser_click to toggle it.` };
    } else if (tag === "INPUT" || tag === "TEXTAREA") {
      // Frameworks track the value through the prototype setter; assigning
      // `el.value` directly would be invisible to a React onChange.
      (tag === "INPUT" ? inputValue : textareaValue).call(el, text);
    } else if (el.isContentEditable) {
      const selection = el.ownerDocument.getSelection();
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      if (!el.ownerDocument.execCommand("insertText", false, text)) el.textContent = text;
    } else {
      return { error: `${ref} is not a text field; use browser_click on it instead.` };
    }
    if (!el.isContentEditable) {
      fire(el, InputEvent, "input", { bubbles: true, composed: true, inputType: "insertText", data: text });
      fire(el, Event, "change", { bubbles: true });
    }
    if (submit) pressEnter(el);
    return { note: "" };
  }

  function run(call) {
    let out;
    try {
      switch (call && call.action) {
        case "snapshot":
          out = snapshot();
          break;
        case "click":
          out = click(call.ref);
          break;
        case "type":
          out = type(call.ref, String(call.text ?? ""), Boolean(call.submit));
          break;
        case "console":
          out = { messages: logs.slice() };
          break;
        default:
          out = { error: `unknown browser action ${call && call.action}` };
      }
    } catch (e) {
      out = { error: `The page script failed: ${e && e.message ? e.message : String(e)}` };
    }
    out.url = location.href;
    out.title = document.title;
    return stringify(out);
  }

  Object.defineProperty(window, "__wfAgent", {
    value: Object.freeze(run),
    writable: false,
    configurable: false,
    enumerable: false,
  });
})();
