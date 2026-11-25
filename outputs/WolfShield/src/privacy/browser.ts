import { effective } from "../core/config.ts";
import type { Features, Settings } from "../core/types.ts";
export async function applyBrowserPrivacy(s: Settings): Promise<string[]> {
  const errors: string[] = [];
  const setting = async (
    api: chrome.types.ChromeSetting | undefined,
    enabled: boolean,
    value: unknown,
    label: string,
  ) => {
    if (!api) {
      if (enabled) errors.push(label + ": API no disponible");
      return;
    }
    try {
      const state = await (api.get({}) as unknown as Promise<{
        levelOfControl: string;
      }>);
      if (enabled) {
        if (
          ![
            "controllable_by_this_extension",
            "controlled_by_this_extension",
          ].includes(state.levelOfControl)
        )
          throw Error("Controlada por el navegador u otra extensión");
        await api.set({ value });
      } else if (state.levelOfControl === "controlled_by_this_extension")
        await api.clear({});
    } catch (e) {
      errors.push(label + ": " + String(e));
    }
  };
  await setting(
    chrome.privacy?.network?.webRTCIPHandlingPolicy,
    s.webrtc,
    "disable_non_proxied_udp",
    "WebRTC",
  );
  await setting(
    chrome.privacy?.websites?.thirdPartyCookiesAllowed,
    s.thirdPartyCookies,
    false,
    "Cookies de terceros",
  );
  for (const feature of ["popups", "notifications"] as const) {
    const api = chrome.contentSettings?.[feature];
    if (!api) {
      if (s.features[feature] || Object.values(s.sites).some((v) => v[feature]))
        errors.push(feature + ": API no disponible");
      continue;
    }
    try {
      await api.clear({ scope: "regular" });
      if (s.enabled && s.features[feature])
        await api.set({
          primaryPattern: "<all_urls>",
          setting: "block",
          scope: "regular",
        });
      for (const domain of Object.keys(s.sites)) {
        const site = effective(s, domain);
        // An allow rule is only needed to override our own global block.
        const pattern =
          "*://" +
          (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(domain) || domain === "localhost"
            ? ""
            : "*.") +
          domain +
          "/*";
        if (site.enabled && site[feature])
          await api.set({
            primaryPattern: pattern,
            setting: "block",
            scope: "regular",
          });
        else if (s.enabled && s.features[feature])
          errors.push(
            `${domain}: ${feature} es global; el bloqueo del navegador sigue activo`,
          );
      }
    } catch (e) {
      errors.push(feature + ": " + String(e));
    }
  }
  return errors;
}
export async function registerProtections(s: Settings): Promise<void> {
  const registrations: chrome.scripting.RegisteredContentScript[] = [];
  for (const feature of ["fingerprint", "compat"] as (keyof Features)[]) {
    const off = Object.keys(s.sites)
      .filter((d) => {
        const v = effective(s, d);
        return !v.enabled || !v[feature];
      })
      .map((d) => "*://*." + d + "/*");
    const on = Object.keys(s.sites)
      .filter((d) => {
        const v = effective(s, d);
        return v.enabled && v[feature];
      })
      .map((d) => "*://*." + d + "/*");
    const matches = s.features[feature] ? ["http://*/*", "https://*/*"] : on;
    if (s.enabled && matches.length)
      registrations.push({
        id: "wolf-" + feature,
        matches,
        excludeMatches: off,
        js: [feature === "fingerprint" ? "privacy-main.js" : "compat-main.js"],
        runAt: "document_start",
        world: "MAIN" as chrome.scripting.ExecutionWorld,
        allFrames: false,
        persistAcrossSessions: true,
      });
  }
  const old = await chrome.scripting.getRegisteredContentScripts();
  const normalize = (list: chrome.scripting.RegisteredContentScript[]) =>
    JSON.stringify(
      list
        .filter((x) => x.id.startsWith("wolf-"))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((x) => [
          x.id,
          [...(x.matches ?? [])].sort(),
          [...(x.excludeMatches ?? [])].sort(),
          x.js,
          x.runAt,
          x.world,
          x.allFrames ?? false,
          x.persistAcrossSessions ?? true,
        ]),
    );
  if (normalize(old) === normalize(registrations)) return;
  const ids = old.filter((x) => x.id.startsWith("wolf-")).map((x) => x.id);
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
  if (registrations.length)
    await chrome.scripting.registerContentScripts(registrations);
}
