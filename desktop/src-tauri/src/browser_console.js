// Console capture injected into every browser tab before page scripts run,
// just ahead of `browser_agent.js`, which reads it for `browser_console`.
//
// Keeps the newest messages and uncaught errors since the document loaded.
// `__wfConsole()` returns a copy; it is frozen and non-configurable so a page
// cannot replace it.
(function () {
  if (window.__wfConsole) return;

  const MAX_CONSOLE = 200;
  const stringify = JSON.stringify;
  const now = Date.now;

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


  Object.defineProperty(window, "__wfConsole", {
    value: Object.freeze(() => logs.slice()),
    writable: false,
    configurable: false,
    enumerable: false,
  });
})();
