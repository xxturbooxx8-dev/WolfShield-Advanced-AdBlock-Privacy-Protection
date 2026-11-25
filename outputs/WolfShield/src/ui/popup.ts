import {
  $,
  action,
  featureRows,
  send,
  status,
  theme,
  number,
} from "./shared.ts";
import { aggressive, standard, domainMatches } from "../core/config.ts";
import type { Features, Snapshot } from "../core/types.ts";
let snapshot: Snapshot,
  tab: chrome.tabs.Tab,
  host = "";
const siteKey = () =>
  Object.keys(snapshot.settings.sites).find((d) => domainMatches(host, d)) ??
  host;
async function render() {
  snapshot = await send({ type: "snapshot", host, tabId: tab?.id });
  theme(snapshot.settings);
  $("host").textContent = host || "Página del navegador";
  const site = snapshot.site!;
  $("protection-label").textContent = host
    ? site.enabled
      ? "Protección activa"
      : "Protección pausada"
    : "Sin acceso a esta página";
  $<HTMLInputElement>("site-enabled").checked = !!site?.enabled;
  $<HTMLInputElement>("site-enabled").disabled = !host;
  $("ads").textContent = snapshot.counts
    ? number(snapshot.counts.ads ?? 0)
    : "—";
  $("trackers").textContent = snapshot.counts
    ? number(snapshot.counts.trackers ?? 0)
    : "—";
  $("metric-note").textContent = snapshot.capabilities.feedback
    ? "Bloqueos de red observados desde la última carga de esta pestaña."
    : "Desglose no disponible en esta instalación. El icono muestra el contador nativo si el navegador lo admite.";
  $<HTMLSelectElement>("level").value = site?.level ?? "standard";
  $<HTMLSelectElement>("level").disabled = !host;
  featureRows(
    $("quick-features"),
    site ?? snapshot.settings.features,
    ["ads", "trackers", "fingerprint", "compat", "cleanup", "malware"],
    (key, value) =>
      action(async () => {
        const keyHost = siteKey();
        snapshot.settings.sites[keyHost] = {
          ...snapshot.settings.sites[keyHost],
          [key]: value,
          level: "custom",
        };
        await save();
      }),
    false,
  );
  if (!host)
    document
      .querySelectorAll<HTMLInputElement>(".features input")
      .forEach((x) => (x.disabled = true));
  $<HTMLButtonElement>("picker").disabled = !host;
  $<HTMLButtonElement>("reload").disabled = !host;
  if (snapshot.report.fatal) status(String(snapshot.report.fatal), true);
}
async function save() {
  await send({ type: "settings", settings: snapshot.settings });
  await render();
  status("Guardado. Recarga para aplicar cambios de scripts.");
}
for (const id of ["dashboard", "open-dashboard"])
  $(id).onclick = () => chrome.runtime.openOptionsPage();
$("site-enabled").onchange = () =>
  action(async () => {
    const keyHost = siteKey();
    snapshot.settings.sites[keyHost] = {
      ...snapshot.settings.sites[keyHost],
      enabled: $<HTMLInputElement>("site-enabled").checked,
    };
    await save();
  });
$("level").onchange = () =>
  action(async () => {
    const level = $<HTMLSelectElement>("level").value as
        | "standard"
        | "aggressive"
        | "custom",
      keyHost = siteKey();
    snapshot.settings.sites[keyHost] = {
      ...snapshot.settings.sites[keyHost],
      ...(level === "standard"
        ? standard
        : level === "aggressive"
          ? aggressive
          : {}),
      level,
    };
    await save();
  });
$("picker").onclick = () =>
  action(async () => {
    await send({ type: "picker", tabId: tab.id });
    window.close();
  });
$("reload").onclick = () =>
  action(async () => {
    await chrome.tabs.reload(tab.id!);
    window.close();
  });
action(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url && /^https?:/.test(tab.url)) host = new URL(tab.url).hostname;
  await render();
});
