// Local, opt-in compatibility adapter. Does not alter access-control or paywall APIs.
(() => {
  const w = window as unknown as Record<string, unknown>;
  if (w.canRunAds === undefined)
    Object.defineProperty(w, "canRunAds", {
      value: true,
      writable: true,
      configurable: true,
    });
  const callbacks: Function[] = [];
  const adapter = {
    onDetected() {
      return adapter;
    },
    onNotDetected(fn: Function) {
      if (typeof fn === "function") callbacks.push(fn);
      return adapter;
    },
    check() {
      for (const fn of callbacks.splice(0)) queueMicrotask(() => fn());
      return adapter;
    },
    setOption() {
      return adapter;
    },
    on(detected: boolean, fn: Function) {
      return detected ? adapter.onDetected() : adapter.onNotDetected(fn);
    },
  };
  if (w.blockAdBlock === undefined) w.blockAdBlock = adapter;
  if (w.fuckAdBlock === undefined) w.fuckAdBlock = adapter;
  // Preserve only empty, explicit detector baits. Never reveal substantive ad content.
  const preserveBaits = () => {
    for (const node of Array.from(
      document.querySelectorAll<HTMLElement>(
        ".adsbox,#adblock-test,[data-adblock-test]",
      ),
    ).slice(0, 100)) {
      if (node.childElementCount || node.textContent?.trim()) continue;
      const r = node.getBoundingClientRect();
      if (r.width * r.height > 4) continue;
      for (const [key, value] of Object.entries({
        display: "block",
        width: "1px",
        height: "1px",
        position: "absolute",
        left: "-10000px",
        visibility: "visible",
      }))
        node.style.setProperty(key, value, "important");
    }
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", preserveBaits, {
      once: true,
    });
  else preserveBaits();
})();
