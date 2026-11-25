import type { Features, Settings, Subscription, Site } from "./types.ts";
export const catalog: Subscription[] = [
  {
    id: "easylist",
    name: "EasyList",
    url: "https://easylist.to/easylist/easylist.txt",
    category: "ads",
    enabled: true,
    license: "GPL-3.0-or-later",
  },
  {
    id: "easyprivacy",
    name: "EasyPrivacy",
    url: "https://easylist.to/easylist/easyprivacy.txt",
    category: "trackers",
    enabled: true,
    license: "GPL-3.0-or-later",
  },
  {
    id: "spanish",
    name: "EasyList Spanish",
    url: "https://easylist-downloads.adblockplus.org/easylistspanish.txt",
    category: "ads",
    enabled: true,
    license: "GPL-3.0-or-later",
  },
  {
    id: "yoyo",
    name: "Peter Lowe’s List",
    url: "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&mimetype=plaintext",
    category: "trackers",
    enabled: false,
    license: "https://pgl.yoyo.org/as/policy.php",
  },
  {
    id: "adguard",
    name: "AdGuard Base",
    url: "https://filters.adtidy.org/extension/ublock/filters/2.txt",
    category: "ads",
    enabled: false,
    license: "GPL-3.0-only",
  },
  {
    id: "fanboy",
    name: "Fanboy’s Annoyances (incluye avisos de cookies)",
    url: "https://easylist.to/easylist/fanboy-annoyance.txt",
    category: "annoyances",
    enabled: false,
    license: "GPL-3.0-or-later",
  },
  {
    id: "malware",
    name: "HaGeZi Threat Intelligence Mini",
    url: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/tif.mini.txt",
    category: "malware",
    enabled: true,
    license: "GPL-3.0-only",
  },
];
export const standard: Features = {
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
  cookies: false,
};
export const aggressive: Features = {
  ...standard,
  thirdPartyScripts: true,
  popups: true,
  notifications: true,
  cookies: true,
};
export const defaults = (): Settings => ({
  version: 1,
  enabled: true,
  features: { ...standard },
  sites: {},
  theme: "dark",
  customFilters: "",
  lists: structuredClone(catalog),
  autoUpdate: true,
  statistics: false,
  requestLog: false,
  webrtc: false,
  thirdPartyCookies: false,
});
export function hostname(value: string): string {
  if (typeof value !== "string" || value.length > 255)
    throw Error("Dominio no válido");
  const host = new URL(
    value.includes("://") ? value : "https://" + value,
  ).hostname.toLowerCase();
  if (
    !/^[a-z0-9.-]+$/.test(host) ||
    host.includes("..") ||
    host.startsWith(".") ||
    host.endsWith(".") ||
    host === "__proto__"
  )
    throw Error("Dominio no válido");
  return host;
}
export function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}
export function effective(s: Settings, host: string): Features & Site {
  const out: Features & Site = {
    ...s.features,
    enabled: s.enabled,
    level: "standard",
  };
  // Parent first, most specific override last.
  for (const domain of Object.keys(s.sites)
    .filter((d) => domainMatches(host, d))
    .sort((a, b) => a.length - b.length))
    Object.assign(out, s.sites[domain]);
  out.enabled = s.enabled && out.enabled !== false;
  if (out.level !== "custom")
    out.level = (Object.keys(standard) as (keyof Features)[]).every(
      (k) => out[k] === standard[k],
    )
      ? "standard"
      : (Object.keys(aggressive) as (keyof Features)[]).every(
            (k) => out[k] === aggressive[k],
          )
        ? "aggressive"
        : "custom";
  return out;
}
export function validateSettings(input: unknown): Settings {
  if (!input || typeof input !== "object")
    throw Error("Configuración no válida");
  const v = input as Settings,
    out = defaults();
  if (v.version !== 1) throw Error("Versión de preferencias no compatible");
  for (const key of [
    "enabled",
    "autoUpdate",
    "statistics",
    "requestLog",
    "webrtc",
    "thirdPartyCookies",
  ] as const) {
    if (typeof v[key] !== "boolean")
      throw Error("Preferencia no válida: " + key);
    out[key] = v[key];
  }
  if (!["dark", "light", "auto"].includes(v.theme))
    throw Error("Tema no válido");
  out.theme = v.theme;
  if (typeof v.customFilters !== "string" || v.customFilters.length > 500000)
    throw Error("Filtros: máximo 500 KB");
  out.customFilters = v.customFilters;
  if (!v.features || !v.sites || Array.isArray(v.sites))
    throw Error("Faltan protecciones");
  for (const key of Object.keys(standard) as (keyof Features)[]) {
    if (typeof v.features[key] !== "boolean")
      throw Error("Protección no válida");
    out.features[key] = v.features[key];
  }
  if (Object.keys(v.sites).length > 200) throw Error("Máximo 200 sitios");
  for (const [domain, site] of Object.entries(v.sites)) {
    if (hostname(domain) !== domain || !site || typeof site !== "object")
      throw Error("Excepción no válida");
    const clean: Site = {};
    for (const key of [...Object.keys(standard), "enabled"] as (
      | keyof Features
      | "enabled"
    )[])
      if (key in site) {
        if (typeof site[key] !== "boolean")
          throw Error("Valor por sitio no válido");
        clean[key] = site[key];
      }
    if (site.level) {
      if (!["standard", "aggressive", "custom"].includes(site.level))
        throw Error("Nivel no válido");
      clean.level = site.level;
    }
    out.sites[domain] = clean;
  }
  const domains = Object.keys(out.sites);
  if (
    domains.some((d, i) =>
      domains.some((other, j) => i !== j && domainMatches(d, other)),
    )
  )
    throw Error(
      "Los sitios no pueden solaparse: una entrada ya incluye sus subdominios. Edita la entrada existente.",
    );
  if (!Array.isArray(v.lists) || v.lists.length > 15)
    throw Error("Máximo 15 listas");
  const ids = new Set<string>();
  out.lists = v.lists.map((l) => {
    if (
      !l ||
      typeof l.id !== "string" ||
      !/^[a-z0-9_-]{1,60}$/.test(l.id) ||
      ids.has(l.id)
    )
      throw Error("ID de lista no válido o duplicado");
    ids.add(l.id);
    const url = new URL(l.url);
    if (url.protocol !== "https:" || url.username || url.password)
      throw Error("Las listas requieren HTTPS sin credenciales");
    if (
      typeof l.enabled !== "boolean" ||
      !["ads", "trackers", "malware", "annoyances", "custom"].includes(
        l.category,
      )
    )
      throw Error("Lista no válida");
    if (l.expectedHash && !/^[a-f0-9]{64}$/i.test(l.expectedHash))
      throw Error("SHA-256 no válido");
    return {
      id: l.id,
      name: String(l.name).slice(0, 100),
      url: url.href,
      category: l.category,
      enabled: l.enabled,
      license: String(l.license || "Aportada por el usuario").slice(0, 300),
      ...(l.expectedHash ? { expectedHash: l.expectedHash.toLowerCase() } : {}),
    };
  });
  return out;
}
