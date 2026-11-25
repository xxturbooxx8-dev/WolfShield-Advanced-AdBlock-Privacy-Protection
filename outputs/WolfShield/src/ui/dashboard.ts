import {
  $,
  action,
  download,
  featureRows,
  labels,
  number,
  readFile,
  send,
  status,
  theme,
} from "./shared.ts";
import { aggressive, standard, hostname } from "../core/config.ts";
import type { Features, Settings, Snapshot } from "../core/types.ts";
let snapshot: Snapshot;
const titles: Record<string, string> = {
  overview: "Resumen de protección",
  filters: "Listas y filtros",
  sites: "Sitios y excepciones",
  privacy: "Privacidad y permisos",
  appearance: "Tus preferencias",
  diagnostics: "Diagnóstico del motor",
};
document.querySelectorAll<HTMLButtonElement>("nav button").forEach(
  (button) =>
    (button.onclick = () => {
      document
        .querySelectorAll<HTMLElement>(".page-section")
        .forEach((s) => (s.hidden = s.id !== button.dataset.section));
      document
        .querySelectorAll("nav button")
        .forEach((b) => b.classList.toggle("selected", b === button));
      $("page-title").textContent = titles[button.dataset.section!];
      location.hash = button.dataset.section!;
    }),
);
function button(text: string, fn: () => Promise<void>) {
  const b = document.createElement("button");
  b.textContent = text;
  b.className = "secondary";
  b.onclick = () => action(fn);
  return b;
}
async function save(
  message = "Configuración guardada. Recarga las páginas abiertas si cambiaste protecciones.",
) {
  status("Aplicando configuración…");
  await send({ type: "settings", settings: snapshot.settings });
  await load();
  status(message);
}
function chart() {
  const data = snapshot.stats.days,
    days = Object.keys(data).sort(),
    container = $("chart");
  container.replaceChildren();
  if (!snapshot.settings.statistics || !days.length) {
    container.textContent = "Sin actividad guardada";
    return;
  }
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 560 180");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Bloqueos diarios de anuncios y rastreadores");
  const max = Math.max(
      1,
      ...days.map((d) => (data[d].ads ?? 0) + (data[d].trackers ?? 0)),
    ),
    width = 500 / days.length;
  days.forEach((d, i) => {
    let bottom = 145;
    for (const [key, color] of [
      ["ads", "#57c4ff"],
      ["trackers", "#ad9aff"],
    ]) {
      const value = data[d][key] ?? 0,
        height = (value / max) * 115,
        rect = document.createElementNS(ns, "rect");
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
    ["530", days.at(-1)!, "end"],
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
  const s = snapshot.stats,
    enabled = snapshot.settings.statistics && snapshot.capabilities.feedback;
  const sum = (key: string) =>
    Object.values(s.days).reduce((n, v) => n + (v[key] ?? 0), 0);
  $("total-ads").textContent = enabled ? number(sum("ads")) : "—";
  $("total-trackers").textContent = enabled ? number(sum("trackers")) : "—";
  $("total-rules").textContent = number(Number(snapshot.report.total ?? 0));
  $("stats-note").textContent = !snapshot.capabilities.feedback
    ? "Feedback DNR no disponible: no se pueden recopilar métricas detalladas."
    : snapshot.settings.statistics
      ? "Eventos observados por DNR. Días en UTC. No incluye elementos ocultos por CSS."
      : "Activa las estadísticas opcionales en Privacidad para guardar actividad.";
  chart();
  const top = $("top-domains");
  top.replaceChildren();
  const domains = Object.entries(s.domains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);
  if (!domains.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No hay destinos registrados.";
    top.append(p);
  }
  for (const [domain, count] of domains) {
    const row = document.createElement("div");
    row.className = "domain-row";
    const name = document.createElement("span"),
      n = document.createElement("strong");
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
      event.type,
    ]) {
      const td = document.createElement("td");
      td.textContent = v;
      tr.append(td);
    }
    log.append(tr);
  }
  if (!s.log.length) {
    const tr = document.createElement("tr"),
      td = document.createElement("td");
    td.colSpan = 4;
    td.textContent =
      "Sin eventos. El registro es opcional y se activa en Privacidad.";
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
    input.onchange = () =>
      action(async () => {
        list.enabled = input.checked;
        await save();
      });
    head.append(name, input);
    const small = document.createElement("small"),
      stats = (snapshot.report.lists as any)?.[list.id];
    small.textContent = stats
      ? `${number(stats.selected)} seleccionadas · ${number(stats.omitted)} omitidas por cupo · ${number(stats.rejected)} no compatibles · Actualizada: ${stats.updated.slice(0, 10)}`
      : "Sin reglas activas / pendiente de descarga";
    const source = document.createElement("small");
    source.textContent = list.url + " · " + list.license;
    const tools = document.createElement("div");
    tools.className = "toolbar";
    tools.append(
      button("Exportar lista", async () =>
        download(
          list.id + ".txt",
          await send({ type: "export-list", id: list.id }),
        ),
      ),
    );
    const label = document.createElement("label");
    label.className = "file-button";
    label.textContent = "Importar TXT";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = ".txt";
    file.hidden = true;
    file.onchange = () =>
      action(async () => {
        await send({
          type: "import-list",
          id: list.id,
          text: await readFile(file),
        });
        await load();
        status("Lista importada y aplicada.");
      });
    label.append(file);
    tools.append(label);
    if (
      ![
        "easylist",
        "easyprivacy",
        "spanish",
        "yoyo",
        "adguard",
        "fanboy",
        "malware",
      ].includes(list.id)
    )
      tools.append(
        button("Eliminar", async () => {
          snapshot.settings.lists = snapshot.settings.lists.filter(
            (l) => l.id !== list.id,
          );
          await save();
        }),
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
      button("Eliminar excepción", async () => {
        delete snapshot.settings.sites[domain];
        await save();
      }),
    );
    const features = document.createElement("div");
    features.className = "site-features";
    for (const key of Object.keys(standard) as (keyof Features)[]) {
      const label = document.createElement("label"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.checked = site[key] ?? snapshot.settings.features[key];
      input.onchange = () =>
        action(async () => {
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
  snapshot = await send<Snapshot>({ type: "snapshot" });
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
    ["third-party-cookies", "thirdPartyCookies"],
  ] as const)
    $<HTMLInputElement>(id).checked = s[key];
  $<HTMLSelectElement>("theme").value = s.theme;
  $<HTMLTextAreaElement>("custom-filters").value = s.customFilters;
  featureRows(
    $("privacy-features"),
    s.features,
    Object.keys(standard) as (keyof Features)[],
    (key, value) =>
      action(async () => {
        s.features[key] = value;
        await save();
      }),
  );
  const warnings = (snapshot.report.privacyWarnings as string[]) ?? [];
  $("privacy-warnings").textContent = warnings.join("\n");
  if (snapshot.report.fatal) status(String(snapshot.report.fatal), true);
}
for (const [id, key] of [
  ["global-enabled", "enabled"],
  ["auto-update", "autoUpdate"],
  ["statistics", "statistics"],
  ["request-log-toggle", "requestLog"],
  ["webrtc", "webrtc"],
  ["third-party-cookies", "thirdPartyCookies"],
] as const)
  $(id).onchange = () =>
    action(async () => {
      snapshot.settings[key] = $<HTMLInputElement>(id).checked;
      await save();
    });
$("theme").onchange = () =>
  action(async () => {
    snapshot.settings.theme = $<HTMLSelectElement>("theme")
      .value as Settings["theme"];
    await save();
  });
$("save-filters").onclick = () =>
  action(async () => {
    snapshot.settings.customFilters =
      $<HTMLTextAreaElement>("custom-filters").value;
    await save(
      "Filtros guardados. Consulta las reglas rechazadas en Diagnóstico.",
    );
  });
$("export-filters").onclick = () =>
  download(
    "wolfshield-filters.txt",
    $<HTMLTextAreaElement>("custom-filters").value,
  );
$("import-filters").onchange = () =>
  action(async () => {
    $<HTMLTextAreaElement>("custom-filters").value = await readFile(
      $("import-filters"),
      500000,
    );
    status("Archivo cargado en el editor. Guarda para aplicarlo.");
  });
$("export-settings").onclick = () =>
  download(
    "wolfshield-settings.json",
    JSON.stringify(snapshot.settings, null, 2),
    "application/json",
  );
$("import-settings").onchange = () =>
  action(async () => {
    const data = JSON.parse(await readFile($("import-settings"), 1000000));
    await send({ type: "settings", settings: data });
    await load();
    status("Preferencias importadas.");
  });
$("clear-stats").onclick = () =>
  action(async () => {
    await send({ type: "clear-stats" });
    await load();
    status("Estadísticas y contadores eliminados.");
  });
$("update-lists").onclick = () =>
  action(async () => {
    const b = $<HTMLButtonElement>("update-lists");
    b.disabled = true;
    status("Descargando y validando listas…");
    try {
      const results = await send({ type: "update-lists" });
      await load();
      status(
        Object.entries(results)
          .map(([k, v]) => k + ": " + v)
          .join(" · "),
      );
    } finally {
      b.disabled = false;
    }
  });
$("add-list").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    const name = $<HTMLInputElement>("list-name").value,
      url = $<HTMLInputElement>("list-url").value,
      category = $<HTMLSelectElement>("list-category").value as any,
      expectedHash = $<HTMLInputElement>("list-hash").value;
    snapshot.settings.lists.push({
      id: "user-" + crypto.randomUUID().slice(0, 12),
      name,
      url,
      category,
      enabled: true,
      license: "Aportada por el usuario",
      ...(expectedHash ? { expectedHash } : {}),
    });
    await save();
    $<HTMLFormElement>("add-list").reset();
  });
};
$("add-site").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    const domain = hostname($<HTMLInputElement>("site-domain").value),
      mode = $<HTMLSelectElement>("site-mode").value;
    snapshot.settings.sites[domain] =
      mode === "paused"
        ? { enabled: false }
        : {
            ...(mode === "aggressive" ? aggressive : standard),
            enabled: true,
            level: mode as "standard" | "aggressive",
          };
    await save();
    $<HTMLInputElement>("site-domain").value = "";
  });
};
$("diagnose").onclick = () =>
  action(async () => {
    const data = await send({ type: "diagnose" });
    $("diagnostic-output").textContent = JSON.stringify(data, null, 2);
    status("Diagnóstico completado.");
  });
$("repair").onclick = () =>
  action(async () => {
    await send({ type: "repair" });
    await load();
    status("Configuración reaplicada.");
  });
action(load);
if (titles[location.hash.slice(1)])
  document
    .querySelector<HTMLButtonElement>(
      'nav button[data-section="' + location.hash.slice(1) + '"]',
    )
    ?.click();
