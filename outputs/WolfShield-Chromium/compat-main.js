"use strict";
(() => {
  // src/scriptlets/compat.ts
  (() => {
    const w = window;
    if (w.canRunAds === void 0)
      Object.defineProperty(w, "canRunAds", {
        value: true,
        writable: true,
        configurable: true
      });
    const callbacks = [];
    const adapter = {
      onDetected() {
        return adapter;
      },
      onNotDetected(fn) {
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
      on(detected, fn) {
        return detected ? adapter.onDetected() : adapter.onNotDetected(fn);
      }
    };
    if (w.blockAdBlock === void 0) w.blockAdBlock = adapter;
    if (w.fuckAdBlock === void 0) w.fuckAdBlock = adapter;
    const preserveBaits = () => {
      for (const node of Array.from(
        document.querySelectorAll(
          ".adsbox,#adblock-test,[data-adblock-test]"
        )
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
          visibility: "visible"
        }))
          node.style.setProperty(key, value, "important");
      }
    };
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", preserveBaits, {
        once: true
      });
    else preserveBaits();
  })();
})();
//# sourceMappingURL=compat-main.js.map
