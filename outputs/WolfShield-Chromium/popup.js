"use strict";
(() => {
  // src/ui/shared.ts
  var $ = (id) => document.getElementById(id);
  async function send(message) {
    const r = await chrome.runtime.sendMessage(message);
    if (!r?.ok) throw Error(r?.error ?? "El motor no responde");
    return r.data;
  }
  function status(text, failed = false) {
    $("status").textContent = text;
    $("status").classList.toggle("error", failed);
  }
  async function action(fn) {
    try {
      await fn();
    } catch (e) {
      status(e instanceof Error ? e.message : String(e), true);
    }
  }
  function theme(s) {
    document.body.dataset.theme = s.theme;
  }
  var labels = {
    ads: [
      "Bloqueo de anuncios",
      "Solicitudes de las listas de publicidad activas."
    ],
    trackers: [
      "Protecci\xF3n contra rastreadores",
      "Incluye p\xEDxeles y rastreadores sociales presentes en las listas."
    ],
    malware: [
      "Dominios maliciosos",
      "Lista de amenazas; no sustituye Safe Browsing."
    ],
    cosmetic: [
      "Filtrado cosm\xE9tico",
      "Oculta elementos y sus espacios, incluidos los a\xF1adidos din\xE1micamente."
    ],
    cleanup: [
      "Limpieza de URLs",
      "Elimina par\xE1metros conocidos en navegaciones."
    ],
    https: ["Forzar HTTPS", "Puede impedir abrir sitios que no soporten HTTPS."],
    thirdPartyScripts: [
      "Bloquear scripts de terceros",
      "Protecci\xF3n agresiva: puede romper inicios de sesi\xF3n, pagos y v\xEDdeos."
    ],
    fingerprint: [
      "Fingerprinting estricto \xB7 experimental",
      "Bloquea lectura Canvas, WebGL y audio offline en el marco principal. Detectable, no cubre todos los contextos."
    ],
    compat: [
      "Compatibilidad anti-AdBlock \xB7 experimental",
      "Adaptador local para canRunAds y BlockAdBlock. Solo act\xEDvalo en sitios problem\xE1ticos."
    ],
    popups: [
      "Bloquear ventanas emergentes",
      "Mediante permisos de contenido del navegador; disponible en Chromium."
    ],
    notifications: [
      "Bloquear notificaciones",
      "Impide solicitudes de permiso; disponible en Chromium."
    ],
    cookies: [
      "Ocultar avisos de cookies",
      "Requiere activar Fanboy\u2019s Annoyances. Ocultar no equivale a rechazar consentimiento."
    ]
  };
  function featureRows(container, values, keys, onChange, descriptions = true) {
    container.replaceChildren();
    for (const key of keys) {
      const row = document.createElement("label");
      row.className = "feature";
      const icon = document.createElement("span");
      icon.className = "feature-icon";
      icon.textContent = "\u25C7";
      const copy = document.createElement("span");
      copy.className = "feature-copy";
      copy.textContent = labels[key][0];
      if (descriptions) {
        const small = document.createElement("small");
        small.textContent = labels[key][1];
        copy.append(small);
      }
      const wrap = document.createElement("span");
      wrap.className = "switch";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!values[key];
      input.dataset.feature = key;
      input.setAttribute("aria-label", labels[key][0]);
      input.onchange = () => onChange(key, input.checked);
      wrap.append(input, document.createElement("span"));
      row.append(icon, copy, wrap);
      container.append(row);
    }
  }
  var number = (v) => v.toLocaleString("es");

  // src/core/config.ts
  var standard = {
    ads: true,
    trackers: true,
    malware: true,
    cosmetic: true,
    cleanup: true,
    https: false,
    thirdPartyScripts: false,
    fingerprint: false,
    compat: false,
    popups: false,
    notifications: false,
    cookies: false
  };
  var aggressive = {
    ...standard,
    thirdPartyScripts: true,
    popups: true,
    notifications: true,
    cookies: true
  };
  function domainMatches(host2, domain) {
    return host2 === domain || host2.endsWith("." + domain);
  }

  // src/ui/popup.ts
  var snapshot;
  var tab;
  var host = "";
  var siteKey = () => Object.keys(snapshot.settings.sites).find((d) => domainMatches(host, d)) ?? host;
  async function render() {
    snapshot = await send({ type: "snapshot", host, tabId: tab?.id });
    theme(snapshot.settings);
    $("host").textContent = host || "P\xE1gina del navegador";
    const site = snapshot.site;
    $("protection-label").textContent = host ? site.enabled ? "Protecci\xF3n activa" : "Protecci\xF3n pausada" : "Sin acceso a esta p\xE1gina";
    $("site-enabled").checked = !!site?.enabled;
    $("site-enabled").disabled = !host;
    $("ads").textContent = snapshot.counts ? number(snapshot.counts.ads ?? 0) : "\u2014";
    $("trackers").textContent = snapshot.counts ? number(snapshot.counts.trackers ?? 0) : "\u2014";
    $("metric-note").textContent = snapshot.capabilities.feedback ? "Bloqueos de red observados desde la \xFAltima carga de esta pesta\xF1a." : "Desglose no disponible en esta instalaci\xF3n. El icono muestra el contador nativo si el navegador lo admite.";
    $("level").value = site?.level ?? "standard";
    $("level").disabled = !host;
    featureRows(
      $("quick-features"),
      site ?? snapshot.settings.features,
      ["ads", "trackers", "fingerprint", "compat", "cleanup", "malware"],
      (key, value) => action(async () => {
        const keyHost = siteKey();
        snapshot.settings.sites[keyHost] = {
          ...snapshot.settings.sites[keyHost],
          [key]: value,
          level: "custom"
        };
        await save();
      }),
      false
    );
    if (!host)
      document.querySelectorAll(".features input").forEach((x) => x.disabled = true);
    $("picker").disabled = !host;
    $("reload").disabled = !host;
    if (snapshot.report.fatal) status(String(snapshot.report.fatal), true);
  }
  async function save() {
    await send({ type: "settings", settings: snapshot.settings });
    await render();
    status("Guardado. Recarga para aplicar cambios de scripts.");
  }
  for (const id of ["dashboard", "open-dashboard"])
    $(id).onclick = () => chrome.runtime.openOptionsPage();
  $("site-enabled").onchange = () => action(async () => {
    const keyHost = siteKey();
    snapshot.settings.sites[keyHost] = {
      ...snapshot.settings.sites[keyHost],
      enabled: $("site-enabled").checked
    };
    await save();
  });
  $("level").onchange = () => action(async () => {
    const level = $("level").value, keyHost = siteKey();
    snapshot.settings.sites[keyHost] = {
      ...snapshot.settings.sites[keyHost],
      ...level === "standard" ? standard : level === "aggressive" ? aggressive : {},
      level
    };
    await save();
  });
  $("picker").onclick = () => action(async () => {
    await send({ type: "picker", tabId: tab.id });
    window.close();
  });
  $("reload").onclick = () => action(async () => {
    await chrome.tabs.reload(tab.id);
    window.close();
  });
  action(async () => {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && /^https?:/.test(tab.url)) host = new URL(tab.url).hostname;
    await render();
  });
})();
//# sourceMappingURL=popup.js.map
