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
  function download(name, data, type = "text/plain") {
    const url = URL.createObjectURL(new Blob([data], { type })), a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  async function readFile(input, max = 12 * 1024 * 1024) {
    const file = input.files?.[0];
    if (!file) throw Error("Selecciona un archivo");
    if (file.size > max) throw Error("Archivo demasiado grande");
    const text = await file.text();
    input.value = "";
    return text;
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
  function hostname(value) {
    if (typeof value !== "string" || value.length > 255)
      throw Error("Dominio no v\xE1lido");
    const host = new URL(
      value.includes("://") ? value : "https://" + value
    ).hostname.toLowerCase();
    if (!/^[a-z0-9.-]+$/.test(host) || host.includes("..") || host.startsWith(".") || host.endsWith(".") || host === "__proto__")
      throw Error("Dominio no v\xE1lido");
    return host;
  }

  // src/ui/dashboard.ts
  var snapshot;
  var titles = {
    overview: "Resumen de protecci\xF3n",
    filters: "Listas y filtros",
    sites: "Sitios y excepciones",
    privacy: "Privacidad y permisos",
    appearance: "Tus preferencias",
    diagnostics: "Diagn\xF3stico del motor"
  };
  document.querySelectorAll("nav button").forEach(
    (button2) => button2.onclick = () => {
      document.querySelectorAll(".page-section").forEach((s) => s.hidden = s.id !== button2.dataset.section);
      document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("selected", b === button2));
      $("page-title").textContent = titles[button2.dataset.section];
      location.hash = button2.dataset.section;
    }
  );
  function button(text, fn) {
    const b = document.createElement("button");
    b.textContent = text;
    b.className = "secondary";
    b.onclick = () => action(fn);
    return b;
  }
  async function save(message = "Configuraci\xF3n guardada. Recarga las p\xE1ginas abiertas si cambiaste protecciones.") {
    status("Aplicando configuraci\xF3n\u2026");
    await send({ type: "settings", settings: snapshot.settings });
    await load();
    status(message);
  }
  function chart() {
    const data = snapshot.stats.days, days = Object.keys(data).sort(), container = $("chart");
    container.replaceChildren();
    if (!snapshot.settings.statistics || !days.length) {
      container.textContent = "Sin actividad guardada";
      return;
    }
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 560 180");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Bloqueos diarios de anuncios y rastreadores");
    const max = Math.max(
      1,
      ...days.map((d) => (data[d].ads ?? 0) + (data[d].trackers ?? 0))
    ), width = 500 / days.length;
    days.forEach((d, i) => {
      let bottom = 145;
      for (const [key, color] of [
        ["ads", "#57c4ff"],
        ["trackers", "#ad9aff"]
      ]) {
        const value = data[d][key] ?? 0, height = value / max * 115, rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", String(30 + i * width));
        rect.setAttribute("y", String(bottom - height));
        rect.setAttribute("width", String(Math.max(2, width - 6)));
        rect.setAttribute("height", String(height));
        rect.setAttribute("rx", "3");
        rect.setAttribute("fill", color);
        const title = document.createElementNS(ns, "title");
        title.textContent = `${d}: ${value} ${key}`;
        rect.append(title);
        svg.append(rect);
        bottom -= height;
      }
    });
    for (const [x, value, anchor] of [
      ["30", days[0], "start"],
      ["530", days.at(-1), "end"]
    ]) {
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", x);
      text.setAttribute("y", "173");
      text.setAttribute("fill", "currentColor");
      text.setAttribute("font-size", "11");
      text.setAttribute("text-anchor", anchor);
      text.textContent = value;
      svg.append(text);
    }
    container.append(svg);
  }
  function renderStats() {
    const s = snapshot.stats, enabled = snapshot.settings.statistics && snapshot.capabilities.feedback;
    const sum = (key) => Object.values(s.days).reduce((n, v) => n + (v[key] ?? 0), 0);
    $("total-ads").textContent = enabled ? number(sum("ads")) : "\u2014";
    $("total-trackers").textContent = enabled ? number(sum("trackers")) : "\u2014";
    $("total-rules").textContent = number(Number(snapshot.report.total ?? 0));
    $("stats-note").textContent = !snapshot.capabilities.feedback ? "Feedback DNR no disponible: no se pueden recopilar m\xE9tricas detalladas." : snapshot.settings.statistics ? "Eventos observados por DNR. D\xEDas en UTC. No incluye elementos ocultos por CSS." : "Activa las estad\xEDsticas opcionales en Privacidad para guardar actividad.";
    chart();
    const top = $("top-domains");
    top.replaceChildren();
    const domains = Object.entries(s.domains).sort((a, b) => b[1] - a[1]).slice(0, 7);
    if (!domains.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "No hay destinos registrados.";
      top.append(p);
    }
    for (const [domain, count] of domains) {
      const row = document.createElement("div");
      row.className = "domain-row";
      const name = document.createElement("span"), n = document.createElement("strong");
      name.textContent = domain;
      n.textContent = number(count);
      row.append(name, n);
      top.append(row);
    }
    const log = $("request-log");
    log.replaceChildren();
    for (const event of [...s.log].reverse()) {
      const tr = document.createElement("tr");
      for (const v of [
        new Date(event.time).toLocaleTimeString("es"),
        event.domain,
        event.category,
        event.type
      ]) {
        const td = document.createElement("td");
        td.textContent = v;
        tr.append(td);
      }
      log.append(tr);
    }
    if (!s.log.length) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = 4;
      td.textContent = "Sin eventos. El registro es opcional y se activa en Privacidad.";
      tr.append(td);
      log.append(tr);
    }
  }
  function renderLists() {
    const container = $("list-manager");
    container.replaceChildren();
    for (const list of snapshot.settings.lists) {
      const row = document.createElement("div");
      row.className = "list-row";
      const head = document.createElement("label");
      head.className = "list-title";
      const name = document.createElement("strong");
      name.textContent = list.name;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = list.enabled;
      input.setAttribute("aria-label", "Activar " + list.name);
      input.onchange = () => action(async () => {
        list.enabled = input.checked;
        await save();
      });
      head.append(name, input);
      const small = document.createElement("small"), stats = snapshot.report.lists?.[list.id];
      small.textContent = stats ? `${number(stats.selected)} seleccionadas \xB7 ${number(stats.omitted)} omitidas por cupo \xB7 ${number(stats.rejected)} no compatibles \xB7 Actualizada: ${stats.updated.slice(0, 10)}` : "Sin reglas activas / pendiente de descarga";
      const source = document.createElement("small");
      source.textContent = list.url + " \xB7 " + list.license;
      const tools = document.createElement("div");
      tools.className = "toolbar";
      tools.append(
        button(
          "Exportar lista",
          async () => download(
            list.id + ".txt",
            await send({ type: "export-list", id: list.id })
          )
        )
      );
      const label = document.createElement("label");
      label.className = "file-button";
      label.textContent = "Importar TXT";
      const file = document.createElement("input");
      file.type = "file";
      file.accept = ".txt";
      file.hidden = true;
      file.onchange = () => action(async () => {
        await send({
          type: "import-list",
          id: list.id,
          text: await readFile(file)
        });
        await load();
        status("Lista importada y aplicada.");
      });
      label.append(file);
      tools.append(label);
      if (![
        "easylist",
        "easyprivacy",
        "spanish",
        "yoyo",
        "adguard",
        "fanboy",
        "malware"
      ].includes(list.id))
        tools.append(
          button("Eliminar", async () => {
            snapshot.settings.lists = snapshot.settings.lists.filter(
              (l) => l.id !== list.id
            );
            await save();
          })
        );
      row.append(head, small, source, tools);
      container.append(row);
    }
  }
  function renderSites() {
    const container = $("site-manager");
    container.replaceChildren();
    for (const [domain, site] of Object.entries(snapshot.settings.sites)) {
      const row = document.createElement("div");
      row.className = "site-row";
      const toolbar = document.createElement("div");
      toolbar.className = "toolbar";
      const name = document.createElement("strong");
      name.textContent = domain;
      toolbar.append(
        name,
        button(site.enabled === false ? "Reactivar" : "Pausar", async () => {
          site.enabled = site.enabled === false;
          await save();
        }),
        button("Eliminar excepci\xF3n", async () => {
          delete snapshot.settings.sites[domain];
          await save();
        })
      );
      const features = document.createElement("div");
      features.className = "site-features";
      for (const key of Object.keys(standard)) {
        const label = document.createElement("label"), input = document.createElement("input");
        input.type = "checkbox";
        input.checked = site[key] ?? snapshot.settings.features[key];
        input.onchange = () => action(async () => {
          site[key] = input.checked;
          site.level = "custom";
          await save();
        });
        label.append(input, document.createTextNode(labels[key][0]));
        features.append(label);
      }
      row.append(toolbar, features);
      container.append(row);
    }
    if (!container.children.length) {
      container.textContent = "No hay excepciones por sitio.";
      container.classList.add("empty");
    } else container.classList.remove("empty");
  }
  async function load() {
    snapshot = await send({ type: "snapshot" });
    theme(snapshot.settings);
    renderStats();
    renderLists();
    renderSites();
    const s = snapshot.settings;
    for (const [id, key] of [
      ["global-enabled", "enabled"],
      ["auto-update", "autoUpdate"],
      ["statistics", "statistics"],
      ["request-log-toggle", "requestLog"],
      ["webrtc", "webrtc"],
      ["third-party-cookies", "thirdPartyCookies"]
    ])
      $(id).checked = s[key];
    $("theme").value = s.theme;
    $("custom-filters").value = s.customFilters;
    featureRows(
      $("privacy-features"),
      s.features,
      Object.keys(standard),
      (key, value) => action(async () => {
        s.features[key] = value;
        await save();
      })
    );
    const warnings = snapshot.report.privacyWarnings ?? [];
    $("privacy-warnings").textContent = warnings.join("\n");
    if (snapshot.report.fatal) status(String(snapshot.report.fatal), true);
  }
  for (const [id, key] of [
    ["global-enabled", "enabled"],
    ["auto-update", "autoUpdate"],
    ["statistics", "statistics"],
    ["request-log-toggle", "requestLog"],
    ["webrtc", "webrtc"],
    ["third-party-cookies", "thirdPartyCookies"]
  ])
    $(id).onchange = () => action(async () => {
      snapshot.settings[key] = $(id).checked;
      await save();
    });
  $("theme").onchange = () => action(async () => {
    snapshot.settings.theme = $("theme").value;
    await save();
  });
  $("save-filters").onclick = () => action(async () => {
    snapshot.settings.customFilters = $("custom-filters").value;
    await save(
      "Filtros guardados. Consulta las reglas rechazadas en Diagn\xF3stico."
    );
  });
  $("export-filters").onclick = () => download(
    "wolfshield-filters.txt",
    $("custom-filters").value
  );
  $("import-filters").onchange = () => action(async () => {
    $("custom-filters").value = await readFile(
      $("import-filters"),
      5e5
    );
    status("Archivo cargado en el editor. Guarda para aplicarlo.");
  });
  $("export-settings").onclick = () => download(
    "wolfshield-settings.json",
    JSON.stringify(snapshot.settings, null, 2),
    "application/json"
  );
  $("import-settings").onchange = () => action(async () => {
    const data = JSON.parse(await readFile($("import-settings"), 1e6));
    await send({ type: "settings", settings: data });
    await load();
    status("Preferencias importadas.");
  });
  $("clear-stats").onclick = () => action(async () => {
    await send({ type: "clear-stats" });
    await load();
    status("Estad\xEDsticas y contadores eliminados.");
  });
  $("update-lists").onclick = () => action(async () => {
    const b = $("update-lists");
    b.disabled = true;
    status("Descargando y validando listas\u2026");
    try {
      const results = await send({ type: "update-lists" });
      await load();
      status(
        Object.entries(results).map(([k, v]) => k + ": " + v).join(" \xB7 ")
      );
    } finally {
      b.disabled = false;
    }
  });
  $("add-list").onsubmit = (e) => {
    e.preventDefault();
    action(async () => {
      const name = $("list-name").value, url = $("list-url").value, category = $("list-category").value, expectedHash = $("list-hash").value;
      snapshot.settings.lists.push({
        id: "user-" + crypto.randomUUID().slice(0, 12),
        name,
        url,
        category,
        enabled: true,
        license: "Aportada por el usuario",
        ...expectedHash ? { expectedHash } : {}
      });
      await save();
      $("add-list").reset();
    });
  };
  $("add-site").onsubmit = (e) => {
    e.preventDefault();
    action(async () => {
      const domain = hostname($("site-domain").value), mode = $("site-mode").value;
      snapshot.settings.sites[domain] = mode === "paused" ? { enabled: false } : {
        ...mode === "aggressive" ? aggressive : standard,
        enabled: true,
        level: mode
      };
      await save();
      $("site-domain").value = "";
    });
  };
  $("diagnose").onclick = () => action(async () => {
    const data = await send({ type: "diagnose" });
    $("diagnostic-output").textContent = JSON.stringify(data, null, 2);
    status("Diagn\xF3stico completado.");
  });
  $("repair").onclick = () => action(async () => {
    await send({ type: "repair" });
    await load();
    status("Configuraci\xF3n reaplicada.");
  });
  action(load);
  if (titles[location.hash.slice(1)])
    document.querySelector(
      'nav button[data-section="' + location.hash.slice(1) + '"]'
    )?.click();
})();
//# sourceMappingURL=dashboard.js.map
