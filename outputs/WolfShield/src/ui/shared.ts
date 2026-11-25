import type { Features, Settings, Snapshot } from "../core/types.ts";
export const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
export async function send<T = any>(message: unknown): Promise<T> {
  const r = await chrome.runtime.sendMessage(message);
  if (!r?.ok) throw Error(r?.error ?? "El motor no responde");
  return r.data;
}
export function status(text: string, failed = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", failed);
}
export async function action(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    status(e instanceof Error ? e.message : String(e), true);
  }
}
export function theme(s: Settings) {
  document.body.dataset.theme = s.theme;
}
export const labels: Record<keyof Features, [string, string]> = {
  ads: [
    "Bloqueo de anuncios",
    "Solicitudes de las listas de publicidad activas.",
  ],
  trackers: [
    "Protección contra rastreadores",
    "Incluye píxeles y rastreadores sociales presentes en las listas.",
  ],
  malware: [
    "Dominios maliciosos",
    "Lista de amenazas; no sustituye Safe Browsing.",
  ],
  cosmetic: [
    "Filtrado cosmético",
    "Oculta elementos y sus espacios, incluidos los añadidos dinámicamente.",
  ],
  cleanup: [
    "Limpieza de URLs",
    "Elimina parámetros conocidos en navegaciones.",
  ],
  https: ["Forzar HTTPS", "Puede impedir abrir sitios que no soporten HTTPS."],
  thirdPartyScripts: [
    "Bloquear scripts de terceros",
    "Protección agresiva: puede romper inicios de sesión, pagos y vídeos.",
  ],
  fingerprint: [
    "Fingerprinting estricto · experimental",
    "Bloquea lectura Canvas, WebGL y audio offline en el marco principal. Detectable, no cubre todos los contextos.",
  ],
  compat: [
    "Compatibilidad anti-AdBlock · experimental",
    "Adaptador local para canRunAds y BlockAdBlock. Solo actívalo en sitios problemáticos.",
  ],
  popups: [
    "Bloquear ventanas emergentes",
    "Mediante permisos de contenido del navegador; disponible en Chromium.",
  ],
  notifications: [
    "Bloquear notificaciones",
    "Impide solicitudes de permiso; disponible en Chromium.",
  ],
  cookies: [
    "Ocultar avisos de cookies",
    "Requiere activar Fanboy’s Annoyances. Ocultar no equivale a rechazar consentimiento.",
  ],
};
export function featureRows(
  container: HTMLElement,
  values: Partial<Features>,
  keys: (keyof Features)[],
  onChange: (key: keyof Features, value: boolean) => void,
  descriptions = true,
) {
  container.replaceChildren();
  for (const key of keys) {
    const row = document.createElement("label");
    row.className = "feature";
    const icon = document.createElement("span");
    icon.className = "feature-icon";
    icon.textContent = "◇";
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
export function download(name: string, data: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readFile(
  input: HTMLInputElement,
  max = 12 * 1024 * 1024,
) {
  const file = input.files?.[0];
  if (!file) throw Error("Selecciona un archivo");
  if (file.size > max) throw Error("Archivo demasiado grande");
  const text = await file.text();
  input.value = "";
  return text;
}
export const number = (v: number) => v.toLocaleString("es");
