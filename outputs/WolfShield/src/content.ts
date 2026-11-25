(() => {
  let style: HTMLStyleElement | null = null,
    request = 0;
  async function refresh() {
    const current = ++request;
    try {
      const reply = await chrome.runtime.sendMessage({
        type: "content-config",
      });
      if (!reply.ok || current !== request) return;
      style?.remove();
      style = null;
      if (!reply.data.enabled || !reply.data.selectors.length) return;
      const valid = (reply.data.selectors as string[]).filter((s) =>
        CSS.supports("selector(" + s + ")"),
      );
      style = document.createElement("style");
      style.dataset.wolfshield = "cosmetic";
      // Each rule independently parsed so an invalid selector cannot invalidate its neighbors.
      style.textContent = valid
        .map((s) => s + "{display:none!important;}")
        .join("\n");
      if (document.documentElement) document.documentElement.append(style);
      else {
        const observer = new MutationObserver(() => {
          if (document.documentElement) {
            observer.disconnect();
            if (style) document.documentElement.append(style);
          }
        });
        observer.observe(document, { childList: true });
      }
    } catch {
      /* Extension may be reloaded while this document stays open. */
    }
  }
  function startPicker() {
    if (document.querySelector("wolfshield-picker")) return;
    const host = document.createElement("wolfshield-picker"),
      shadow = host.attachShadow({ mode: "closed" });
    host.style.cssText =
      "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    const panel = document.createElement("div");
    panel.style.cssText =
      "position:fixed;bottom:24px;left:24px;max-width:520px;padding:18px;border:1px solid #248fc5;background:#101722;color:white;border-radius:12px;font:14px system-ui;pointer-events:auto;box-shadow:0 8px 40px #0008";
    const text = document.createElement("p");
    text.textContent = "Selecciona un elemento. Esc para cancelar.";
    const code = document.createElement("input");
    code.setAttribute("aria-label", "Selector CSS");
    code.style.cssText =
      "width:100%;box-sizing:border-box;padding:8px;margin:8px 0;color:#111;background:white";
    const save = document.createElement("button");
    save.textContent = "Bloquear elemento";
    save.disabled = true;
    const cancel = document.createElement("button");
    cancel.textContent = "Cancelar";
    panel.append(text, code, save, cancel);
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;border:2px solid #56c6ff;background:#248fc533;pointer-events:none";
    shadow.append(box, panel);
    document.documentElement.append(host);
    let selected: Element | null = null,
      locked = false;
    function selector(el: Element) {
      if (el.id) return "#" + CSS.escape(el.id);
      const parts: string[] = [];
      let current: Element | null = el;
      for (
        let i = 0;
        current && current !== document.documentElement && i < 8;
        i++, current = current.parentElement
      ) {
        const parent: Element | null = current.parentElement;
        const nth = parent
          ? Array.from(parent.children).indexOf(current) + 1
          : 1;
        parts.unshift(
          current.tagName.toLowerCase() + ":nth-child(" + nth + ")",
        );
      }
      return parts.join(" > ");
    }
    const move = (e: MouseEvent) => {
      if (locked || e.composedPath().includes(host)) return;
      const el = e.target as Element;
      if (!el || el === document.body || el === document.documentElement)
        return;
      selected = el;
      const r = el.getBoundingClientRect();
      Object.assign(box.style, {
        top: r.top + "px",
        left: r.left + "px",
        width: r.width + "px",
        height: r.height + "px",
      });
    };
    const click = (e: MouseEvent) => {
      if (e.composedPath().includes(host) || !selected) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      locked = true;
      code.value = selector(selected);
      save.disabled = false;
      text.textContent =
        "Revisa el selector y confirma. Se guardará solo para este dominio.";
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    function stop() {
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
      host.remove();
    }
    cancel.onclick = stop;
    save.onclick = async () => {
      try {
        if (!code.value || !CSS.supports("selector(" + code.value + ")"))
          throw Error("Selector CSS inválido");
        save.disabled = true;
        const r = await chrome.runtime.sendMessage({
          type: "picker-save",
          selector: code.value,
        });
        if (!r.ok) throw Error(r.error);
        stop();
        refresh();
      } catch (e) {
        text.textContent = String(e);
        save.disabled = false;
      }
    };
    document.addEventListener("mousemove", move, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
  }
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "refresh") refresh();
    if (message.type === "picker") startPicker();
  });
  refresh();
})();
