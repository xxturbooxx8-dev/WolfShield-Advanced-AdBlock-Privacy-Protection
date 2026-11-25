"use strict";
(() => {
  // src/privacy/main.ts
  (() => {
    const deny = () => {
      throw new DOMException(
        "Readback disabled by WolfShield strict privacy",
        "SecurityError"
      );
    };
    const replace = (p, key, fn) => {
      if (p && key in p) {
        const d = Object.getOwnPropertyDescriptor(p, key);
        if (d?.configurable) Object.defineProperty(p, key, { ...d, value: fn });
      }
    };
    replace(HTMLCanvasElement.prototype, "toDataURL", deny);
    replace(HTMLCanvasElement.prototype, "toBlob", deny);
    replace(CanvasRenderingContext2D.prototype, "getImageData", deny);
    if (typeof OffscreenCanvas !== "undefined")
      replace(
        OffscreenCanvas.prototype,
        "convertToBlob",
        () => Promise.reject(new DOMException("Readback disabled", "SecurityError"))
      );
    for (const cls of [
      globalThis.WebGLRenderingContext,
      globalThis.WebGL2RenderingContext
    ])
      if (cls) {
        const original = cls.prototype.getParameter;
        replace(
          cls.prototype,
          "getParameter",
          function(p) {
            if (p === 37445 || p === 37446) return deny();
            return original.call(this, p);
          }
        );
        replace(cls.prototype, "readPixels", deny);
      }
    if (typeof OfflineAudioContext !== "undefined")
      replace(
        OfflineAudioContext.prototype,
        "startRendering",
        () => Promise.reject(
          new DOMException("Offline audio readback disabled", "SecurityError")
        )
      );
  })();
})();
//# sourceMappingURL=privacy-main.js.map
