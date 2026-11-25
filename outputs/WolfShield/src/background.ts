import {
  defaults,
  effective,
  hostname,
  validateSettings,
} from "./core/config.ts";
import type { CachedList, Features, Settings, Stats } from "./core/types.ts";
import { cosmeticFor, safeSelector } from "./filtering/compiler.ts";
import { makePlan } from "./filtering/network.ts";
import { fetchList, getCache, putCache, verified } from "./lists/store.ts";
import { applyBrowserPrivacy, registerProtections } from "./privacy/browser.ts";
import { emptyStats, prune, record } from "./statistics/store.ts";
let settings: Settings = defaults(),
  cache = new Map<string, CachedList>(),
  plan = makePlan(settings, cache),
  report: Record<string, unknown> = {},
  feedback = false;
let stats: Stats = { days: {}, domains: {}, log: [] },
  counts: Record<number, Record<string, number>> = {},
  statsTimer: ReturnType<typeof setTimeout> | undefined;
let queue = Promise.resolve();
const cosmeticCache = new Map<
  string,
  { enabled: boolean | undefined; selectors: string[] }
>();
const ruleLimit = () =>
  Math.min(
    28000,
    (
      chrome.declarativeNetRequest as unknown as {
        MAX_NUMBER_OF_DYNAMIC_RULES?: number;
      }
    ).MAX_NUMBER_OF_DYNAMIC_RULES ?? 5000,
  );
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn);
  queue = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}
const error = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ready = (async () => {
  await chrome.storage.local.setAccessLevel?.({
    accessLevel: "TRUSTED_CONTEXTS" as never,
  });
  const data = await chrome.storage.local.get([
    "settings",
    "stats",
    "report",
    "engineVersion",
  ]);
  if (data.settings) settings = validateSettings(data.settings);
  if (data.stats) {
    stats = prune(data.stats);
    await chrome.storage.local.set({ stats });
  }
  if (data.report) report = data.report;
  counts = (await chrome.storage.session.get("counts")).counts ?? {};
  const packaged: Record<string, { hash: string }> = await (
    await fetch(chrome.runtime.getURL("lists/index.json"))
  ).json();
  for (const list of settings.lists) {
    let data = await getCache(list.id);
    if (!data && packaged[list.id]) {
      const text = await (
        await fetch(chrome.runtime.getURL("lists/" + list.id + ".txt"))
      ).text();
      data = await verified(text, {
        ...list,
        expectedHash: packaged[list.id].hash,
      });
      await putCache(list.id, data);
    }
    if (data) cache.set(list.id, data);
  }
  plan = makePlan(settings, cache, ruleLimit());
  try {
    await chrome.declarativeNetRequest.getMatchedRules({
      minTimeStamp: Date.now(),
    });
    feedback = true;
  } catch {
    feedback = false;
  }
  if (data.engineVersion !== chrome.runtime.getManifest().version)
    await apply(settings);
  await chrome.declarativeNetRequest.setExtensionActionOptions?.({
    displayActionCountAsBadgeText: true,
  });
  await chrome.alarms.create("wolf-update", { periodInMinutes: 1440 });
})().catch(async (e) => {
  report = { ...report, fatal: error(e) };
  await chrome.storage.local.set({ report });
  throw e;
});

async function apply(next: Settings, force = false) {
  const nextPlan = makePlan(next, cache, ruleLimit());
  const previous = settings,
    previousPlan = plan;
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const networkChanged =
    force ||
    existing.length !== nextPlan.rules.length ||
    JSON.stringify(previousPlan.rules) !== JSON.stringify(nextPlan.rules);
  try {
    if (networkChanged)
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existing.map((r) => r.id),
        addRules: nextPlan.rules,
      });
    await registerProtections(next);
  } catch (e) {
    if (networkChanged) {
      const installed = await chrome.declarativeNetRequest.getDynamicRules();
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: installed.map((r) => r.id),
        addRules: existing,
      });
    }
    await registerProtections(previous).catch(() => {});
    plan = previousPlan;
    throw e;
  }
  settings = next;
  plan = nextPlan;
  cosmeticCache.clear();
  report = {
    ...nextPlan.report,
    privacyWarnings: await applyBrowserPrivacy(next),
    applied: new Date().toISOString(),
  };
  if (!settings.statistics) {
    stats.days = {};
    stats.domains = {};
    delete stats.domainDays;
  }
  if (!settings.requestLog) stats.log = [];
  await chrome.storage.local.set({
    settings,
    report,
    stats,
    engineVersion: chrome.runtime.getManifest().version,
  });
  for (const tab of await chrome.tabs.query({}))
    if (tab.id)
      chrome.tabs.sendMessage(tab.id, { type: "refresh" }).catch(() => {});
}

async function updateLists() {
  const results: Record<string, string> = {},
    old = new Map(cache),
    pending = new Map<string, CachedList>();
  for (const list of settings.lists.filter((l) => l.enabled))
    try {
      const data = await fetchList(list);
      pending.set(list.id, data);
      cache.set(list.id, data);
      results[list.id] = "Actualizada · " + data.hash.slice(0, 12);
    } catch (e) {
      results[list.id] = error(e);
    }
  try {
    await apply(settings);
    for (const [id, data] of pending) await putCache(id, data);
  } catch (e) {
    cache = old;
    throw e;
  }
  report.updates = results;
  await chrome.storage.local.set({ report });
  return results;
}

function contentConfig(host: string, topHost: string) {
  const key = host + "|" + topHost;
  if (cosmeticCache.has(key)) return cosmeticCache.get(key)!;
  const site = effective(settings, topHost),
    selectors: string[] = [];
  if (site.enabled && site.cosmetic) {
    const all = [...plan.cosmetic];
    for (const list of settings.lists.filter((l) => l.enabled)) {
      const active =
        list.category === "annoyances"
          ? site.cookies
          : list.category === "trackers"
            ? site.trackers
            : list.category === "malware"
              ? site.malware
              : site.ads;
      if (active) all.push(...(cache.get(list.id)?.compiled.cosmetic ?? []));
    }
    selectors.push(...cosmeticFor(all, host));
  }
  const result = { enabled: site.enabled, selectors };
  if (cosmeticCache.size >= 128)
    cosmeticCache.delete(cosmeticCache.keys().next().value!);
  cosmeticCache.set(key, result);
  return result;
}
async function snapshot(host?: string, tabId?: number) {
  prune(stats);
  return {
    settings,
    report,
    stats,
    capabilities: {
      feedback,
      contentSettings: !!chrome.contentSettings,
      privacy: !!chrome.privacy,
    },
    host,
    site: host ? effective(settings, host) : undefined,
    counts:
      tabId === undefined
        ? undefined
        : feedback
          ? (counts[tabId] ?? {})
          : undefined,
  };
}
const picker = new Map<number, { host: string; expires: number }>();
async function handle(message: any, sender: chrome.runtime.MessageSender) {
  await ready;
  const ui =
    sender.id === chrome.runtime.id &&
    !!sender.url &&
    [
      chrome.runtime.getURL("popup.html"),
      chrome.runtime.getURL("dashboard.html"),
    ].some((url) => sender.url!.split("#")[0].split("?")[0] === url);
  if (message?.type === "content-config" && sender.tab && sender.url) {
    return contentConfig(
      new URL(sender.url).hostname,
      new URL(sender.tab.url ?? sender.url).hostname,
    );
  }
  if (message?.type === "picker-save" && sender.tab?.id && sender.url) {
    const token = picker.get(sender.tab.id);
    if (
      !token ||
      token.expires < Date.now() ||
      token.host !== new URL(sender.url).hostname ||
      sender.frameId !== 0
    )
      throw Error("Selector no autorizado");
    if (typeof message.selector !== "string" || !safeSelector(message.selector))
      throw Error("Selector inválido");
    picker.delete(sender.tab.id);
    await apply({
      ...settings,
      customFilters:
        settings.customFilters + "\n" + token.host + "##" + message.selector,
    });
    return true;
  }
  if (!ui) throw Error("Operación reservada a la interfaz de la extensión");
  switch (message.type) {
    case "snapshot":
      return snapshot(message.host, message.tabId);
    case "settings": {
      const next = validateSettings(message.settings);
      for (const list of next.lists.filter(
        (l) => l.enabled && !cache.has(l.id),
      )) {
        const data = await fetchList(list);
        cache.set(list.id, data);
        await putCache(list.id, data);
      }
      await apply(next);
      return snapshot();
    }
    case "update-lists":
      return updateLists();
    case "import-list": {
      const list = settings.lists.find((l) => l.id === message.id);
      if (!list) throw Error("Lista desconocida");
      if (typeof message.text !== "string")
        throw Error("Texto de lista inválido");
      const data = await verified(message.text, list),
        old = cache.get(list.id);
      cache.set(list.id, data);
      try {
        await apply(settings);
        await putCache(list.id, data);
      } catch (e) {
        if (old) cache.set(list.id, old);
        else cache.delete(list.id);
        throw e;
      }
      return true;
    }
    case "export-list": {
      const data = cache.get(message.id);
      if (!data) throw Error("Lista aún no descargada");
      return data.text;
    }
    case "clear-stats":
      stats = emptyStats();
      counts = {};
      await chrome.storage.local.set({ stats });
      await chrome.storage.session.set({ counts });
      return true;
    case "picker": {
      const tab = await chrome.tabs.get(message.tabId);
      if (!tab.url || !/^https?:/.test(tab.url))
        throw Error("Abre un sitio web para seleccionar un elemento");
      picker.set(message.tabId, {
        host: new URL(tab.url).hostname,
        expires: Date.now() + 120000,
      });
      await chrome.tabs.sendMessage(
        message.tabId,
        { type: "picker" },
        { frameId: 0 },
      );
      return true;
    }
    case "diagnose": {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      const scripts = await chrome.scripting.getRegisteredContentScripts();
      return {
        version: chrome.runtime.getManifest().version,
        rules: rules.length,
        expected: plan.rules.length,
        consistent:
          JSON.stringify(rules.map((r) => r.id).sort((a, b) => a - b)) ===
          JSON.stringify(plan.rules.map((r) => r.id).sort((a, b) => a - b)),
        scripts: scripts.map((s) => s.id),
        feedback,
        report,
      };
    }
    case "repair":
      await apply(settings, true);
      return true;
    default:
      throw Error("Mensaje no admitido");
  }
}
chrome.runtime.onMessage.addListener((m, s, reply) => {
  serial(() => handle(m, s)).then(
    (data) => reply({ ok: true, data }),
    (e) => reply({ ok: false, error: error(e) }),
  );
  return true;
});
chrome.runtime.onInstalled.addListener(() => {
  ready.then(() => serial(() => apply(settings))).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  ready.then(() => serial(() => apply(settings))).catch(() => {});
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "wolf-update")
    ready
      .then(async () => {
        prune(stats);
        await chrome.storage.local.set({ stats });
        if (settings.autoUpdate) return serial(updateLists);
      })
      .catch((e) => {
        report.updateError = error(e);
        chrome.storage.local.set({ report });
      });
});
chrome.tabs.onRemoved.addListener((id) => {
  delete counts[id];
  picker.delete(id);
  chrome.storage.session.set({ counts }).catch(() => {});
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status === "loading") {
    delete counts[id];
    chrome.storage.session.set({ counts }).catch(() => {});
  }
});
try {
  chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener((info) => {
    ready
      .then(() => {
        const meta = plan.meta[info.rule.ruleId];
        if (!meta || meta.action !== "block") return;
        const tab = info.request.tabId,
          category = meta.category;
        if (tab >= 0) {
          counts[tab] ??= {};
          counts[tab][category] = (counts[tab][category] ?? 0) + 1;
        }
        const domain = new URL(info.request.url).hostname;
        record(stats, settings, domain, category, info.request.type);
        if (!statsTimer)
          statsTimer = setTimeout(() => {
            statsTimer = undefined;
            chrome.storage.session.set({ counts });
            chrome.storage.local.set({ stats });
          }, 1000);
      })
      .catch(() => {});
  });
} catch {
  feedback = false;
}
