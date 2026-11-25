"use strict";
(() => {
  // src/core/config.ts
  var catalog = [
    {
      id: "easylist",
      name: "EasyList",
      url: "https://easylist.to/easylist/easylist.txt",
      category: "ads",
      enabled: true,
      license: "GPL-3.0-or-later"
    },
    {
      id: "easyprivacy",
      name: "EasyPrivacy",
      url: "https://easylist.to/easylist/easyprivacy.txt",
      category: "trackers",
      enabled: true,
      license: "GPL-3.0-or-later"
    },
    {
      id: "spanish",
      name: "EasyList Spanish",
      url: "https://easylist-downloads.adblockplus.org/easylistspanish.txt",
      category: "ads",
      enabled: true,
      license: "GPL-3.0-or-later"
    },
    {
      id: "yoyo",
      name: "Peter Lowe\u2019s List",
      url: "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&mimetype=plaintext",
      category: "trackers",
      enabled: false,
      license: "https://pgl.yoyo.org/as/policy.php"
    },
    {
      id: "adguard",
      name: "AdGuard Base",
      url: "https://filters.adtidy.org/extension/ublock/filters/2.txt",
      category: "ads",
      enabled: false,
      license: "GPL-3.0-only"
    },
    {
      id: "fanboy",
      name: "Fanboy\u2019s Annoyances (incluye avisos de cookies)",
      url: "https://easylist.to/easylist/fanboy-annoyance.txt",
      category: "annoyances",
      enabled: false,
      license: "GPL-3.0-or-later"
    },
    {
      id: "malware",
      name: "HaGeZi Threat Intelligence Mini",
      url: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/tif.mini.txt",
      category: "malware",
      enabled: true,
      license: "GPL-3.0-only"
    }
  ];
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
  var defaults = () => ({
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
    thirdPartyCookies: false
  });
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
  function domainMatches(host, domain) {
    return host === domain || host.endsWith("." + domain);
  }
  function effective(s, host) {
    const out = {
      ...s.features,
      enabled: s.enabled,
      level: "standard"
    };
    for (const domain of Object.keys(s.sites).filter((d) => domainMatches(host, d)).sort((a, b) => a.length - b.length))
      Object.assign(out, s.sites[domain]);
    out.enabled = s.enabled && out.enabled !== false;
    if (out.level !== "custom")
      out.level = Object.keys(standard).every(
        (k) => out[k] === standard[k]
      ) ? "standard" : Object.keys(aggressive).every(
        (k) => out[k] === aggressive[k]
      ) ? "aggressive" : "custom";
    return out;
  }
  function validateSettings(input) {
    if (!input || typeof input !== "object")
      throw Error("Configuraci\xF3n no v\xE1lida");
    const v = input, out = defaults();
    if (v.version !== 1) throw Error("Versi\xF3n de preferencias no compatible");
    for (const key of [
      "enabled",
      "autoUpdate",
      "statistics",
      "requestLog",
      "webrtc",
      "thirdPartyCookies"
    ]) {
      if (typeof v[key] !== "boolean")
        throw Error("Preferencia no v\xE1lida: " + key);
      out[key] = v[key];
    }
    if (!["dark", "light", "auto"].includes(v.theme))
      throw Error("Tema no v\xE1lido");
    out.theme = v.theme;
    if (typeof v.customFilters !== "string" || v.customFilters.length > 5e5)
      throw Error("Filtros: m\xE1ximo 500 KB");
    out.customFilters = v.customFilters;
    if (!v.features || !v.sites || Array.isArray(v.sites))
      throw Error("Faltan protecciones");
    for (const key of Object.keys(standard)) {
      if (typeof v.features[key] !== "boolean")
        throw Error("Protecci\xF3n no v\xE1lida");
      out.features[key] = v.features[key];
    }
    if (Object.keys(v.sites).length > 200) throw Error("M\xE1ximo 200 sitios");
    for (const [domain, site] of Object.entries(v.sites)) {
      if (hostname(domain) !== domain || !site || typeof site !== "object")
        throw Error("Excepci\xF3n no v\xE1lida");
      const clean = {};
      for (const key of [...Object.keys(standard), "enabled"])
        if (key in site) {
          if (typeof site[key] !== "boolean")
            throw Error("Valor por sitio no v\xE1lido");
          clean[key] = site[key];
        }
      if (site.level) {
        if (!["standard", "aggressive", "custom"].includes(site.level))
          throw Error("Nivel no v\xE1lido");
        clean.level = site.level;
      }
      out.sites[domain] = clean;
    }
    const domains = Object.keys(out.sites);
    if (domains.some(
      (d, i) => domains.some((other, j) => i !== j && domainMatches(d, other))
    ))
      throw Error(
        "Los sitios no pueden solaparse: una entrada ya incluye sus subdominios. Edita la entrada existente."
      );
    if (!Array.isArray(v.lists) || v.lists.length > 15)
      throw Error("M\xE1ximo 15 listas");
    const ids = /* @__PURE__ */ new Set();
    out.lists = v.lists.map((l) => {
      if (!l || typeof l.id !== "string" || !/^[a-z0-9_-]{1,60}$/.test(l.id) || ids.has(l.id))
        throw Error("ID de lista no v\xE1lido o duplicado");
      ids.add(l.id);
      const url = new URL(l.url);
      if (url.protocol !== "https:" || url.username || url.password)
        throw Error("Las listas requieren HTTPS sin credenciales");
      if (typeof l.enabled !== "boolean" || !["ads", "trackers", "malware", "annoyances", "custom"].includes(
        l.category
      ))
        throw Error("Lista no v\xE1lida");
      if (l.expectedHash && !/^[a-f0-9]{64}$/i.test(l.expectedHash))
        throw Error("SHA-256 no v\xE1lido");
      return {
        id: l.id,
        name: String(l.name).slice(0, 100),
        url: url.href,
        category: l.category,
        enabled: l.enabled,
        license: String(l.license || "Aportada por el usuario").slice(0, 300),
        ...l.expectedHash ? { expectedHash: l.expectedHash.toLowerCase() } : {}
      };
    });
    return out;
  }

  // src/filtering/compiler.ts
  var types = {
    script: "script",
    image: "image",
    stylesheet: "stylesheet",
    font: "font",
    media: "media",
    object: "object",
    xmlhttprequest: "xmlhttprequest",
    xhr: "xmlhttprequest",
    subdocument: "sub_frame",
    document: "main_frame",
    ping: "ping",
    websocket: "websocket",
    other: "other"
  };
  var resources = [
    "script",
    "image",
    "stylesheet",
    "font",
    "media",
    "object",
    "xmlhttprequest",
    "sub_frame",
    "ping",
    "websocket",
    "other"
  ];
  var domainOK = (s) => /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(s) && !s.includes("..");
  function safeSelector(s) {
    return !!s && s.length <= 1e3 && !/[{}\r\n\x00]/.test(s) && !/\/\*|\*\/|@|:has-text\(|:contains\(|:matches-css\(|:xpath\(|:remove\(|:style\(|:upward\(|:watch-attr\(|:others\(|:matches-path\(|:min-text-length\(|:matches-attr\(|:matches-prop\(|:not\s*\(\s*\)/i.test(
      s
    );
  }
  function compile(text, malware = false, localRedirects = false) {
    const result = {
      rules: [],
      cosmetic: [],
      rejected: 0,
      duplicates: 0,
      examples: []
    }, seen = /* @__PURE__ */ new Set();
    const reject = (line) => {
      result.rejected++;
      if (result.examples.length < 8) result.examples.push(line.slice(0, 180));
    };
    for (let line of text.split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith("!") || line.startsWith("[") || line.startsWith("# "))
        continue;
      if (seen.has(line)) {
        result.duplicates++;
        continue;
      }
      seen.add(line);
      if (line.includes("#@#") || line.includes("##")) {
        const exception2 = line.includes("#@#"), separator = exception2 ? "#@#" : "##", index = line.indexOf(separator), selector = line.slice(index + separator.length), prefix = line.slice(0, index);
        if (!safeSelector(selector) || selector.startsWith("+js(")) {
          reject(line);
          continue;
        }
        const domains = prefix ? prefix.split(",") : [];
        if (domains.some((d) => !domainOK(d.replace(/^~/, "")))) {
          reject(line);
          continue;
        }
        result.cosmetic.push({
          domains: domains.filter((d) => !d.startsWith("~")),
          excluded: domains.filter((d) => d.startsWith("~")).map((d) => d.slice(1)),
          selector,
          exception: exception2
        });
        continue;
      }
      if (line.startsWith("#")) continue;
      if (/#\$#|#%#|#\?#|#@\$#|#@\?#/.test(line)) {
        reject(line);
        continue;
      }
      const hostLine = line.replace(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+/, "").replace(/\s+#.*$/, "");
      if (domainOK(hostLine) && hostLine.includes("."))
        line = "||" + hostLine + "^";
      let exception = line.startsWith("@@");
      if (exception) line = line.slice(2);
      const dollar = line.lastIndexOf("$"), pattern = dollar < 0 ? line : line.slice(0, dollar), options = dollar < 0 ? [] : line.slice(dollar + 1).split(",");
      if (!pattern || pattern.length > 1e3 || /^\/.*\/$/.test(pattern) || /\s|[^\x20-\x7e]/.test(pattern)) {
        reject(line);
        continue;
      }
      const condition = {
        urlFilter: pattern
      };
      let included = [], excluded = [], invalid = false, important = false, noop = false;
      for (const option of options) {
        const neg = option.startsWith("~"), name = neg ? option.slice(1) : option;
        if (types[name]) (neg ? excluded : included).push(types[name]);
        else if (name === "third-party" || name === "3p")
          condition.domainType = neg ? "firstParty" : "thirdParty";
        else if (name === "first-party" || name === "1p")
          condition.domainType = neg ? "thirdParty" : "firstParty";
        else if (option === "match-case")
          condition.isUrlFilterCaseSensitive = true;
        else if (option === "important") important = true;
        else if (option === "redirect=noop.js" && localRedirects && !exception)
          noop = true;
        else if (option.startsWith("domain=")) {
          const domains = option.slice(7).split("|");
          if (domains.some((d) => !domainOK(d.replace(/^~/, "")))) {
            invalid = true;
            break;
          }
          const yes = domains.filter((d) => !d.startsWith("~")), no = domains.filter((d) => d.startsWith("~")).map((d) => d.slice(1));
          if (yes.length) condition.initiatorDomains = yes;
          if (no.length) condition.excludedInitiatorDomains = no;
        } else {
          invalid = true;
          break;
        }
      }
      if (invalid) {
        reject(line);
        continue;
      }
      if (included.length)
        condition.resourceTypes = [...new Set(included)].filter(
          (t) => !excluded.includes(t)
        );
      else
        condition.resourceTypes = (malware ? [
          ...resources,
          "main_frame"
        ] : resources).filter((t) => !excluded.includes(t));
      if (!condition.resourceTypes.length) {
        reject(line);
        continue;
      }
      if (noop && (condition.resourceTypes.length !== 1 || condition.resourceTypes[0] !== "script")) {
        reject(line);
        continue;
      }
      result.rules.push({
        priority: important ? exception ? 50 : 40 : exception ? 30 : 10,
        action: noop ? {
          type: "redirect",
          redirect: { extensionPath: "/resources/noop.js" }
        } : { type: exception ? "allow" : "block" },
        condition
      });
    }
    return result;
  }
  function cosmeticFor(rules, host, limit = 2e3) {
    const match = (d) => host === d || host.endsWith("." + d);
    const applies = (r) => (!r.domains.length || r.domains.some(match)) && !r.excluded.some(match);
    const exceptions = new Set(
      rules.filter((r) => r.exception && applies(r)).map((r) => r.selector)
    );
    const specific = rules.filter(
      (r) => !r.exception && r.domains.length && applies(r)
    );
    const generic = rules.filter((r) => !r.exception && !r.domains.length && applies(r)).slice(0, 500);
    return [
      ...new Set(
        [...specific, ...generic].map((r) => r.selector).filter((s) => !exceptions.has(s))
      )
    ].slice(0, limit);
  }

  // src/filtering/network.ts
  var TRACKING_PARAMS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "utm_source_platform",
    "utm_creative_format",
    "utm_marketing_tactic",
    "fbclid",
    "gclid",
    "dclid",
    "msclkid",
    "mc_cid",
    "mc_eid",
    "igshid"
  ];
  function compactRules(rules) {
    const result = [], groups = /* @__PURE__ */ new Map();
    for (const rule of rules) {
      const match = rule.condition.urlFilter?.match(/^\|\|([a-z0-9.-]+)\^$/i);
      if (!match || rule.condition.requestDomains || rule.condition.isUrlFilterCaseSensitive) {
        result.push(rule);
        continue;
      }
      const base = structuredClone(rule);
      delete base.condition.urlFilter;
      const key = JSON.stringify(base);
      if (!groups.has(key)) groups.set(key, { base, domains: [] });
      groups.get(key).domains.push(match[1]);
    }
    const grouped = [];
    for (const { base, domains } of groups.values()) {
      const unique = [...new Set(domains)];
      for (let i = 0; i < unique.length; i += 500)
        grouped.push({
          ...base,
          condition: {
            ...base.condition,
            requestDomains: unique.slice(i, i + 500)
          }
        });
    }
    return [...grouped, ...result];
  }
  function intersect(a, b) {
    return [
      ...new Set(
        a.flatMap(
          (x) => b.flatMap(
            (y) => domainMatches(x, y) ? [x] : domainMatches(y, x) ? [y] : []
          )
        )
      )
    ];
  }
  function scope(condition, s, feature) {
    const c = structuredClone(condition), off = [], on = [];
    for (const domain of Object.keys(s.sites)) {
      const site = effective(s, domain);
      (site.enabled && site[feature] ? on : off).push(domain);
    }
    if (!s.features[feature]) {
      if (!on.length) return null;
      const include = c.initiatorDomains ? intersect(c.initiatorDomains, on) : on;
      if (!include.length) return null;
      c.initiatorDomains = include;
    }
    if (off.length)
      c.excludedInitiatorDomains = [
        .../* @__PURE__ */ new Set([...c.excludedInitiatorDomains ?? [], ...off])
      ];
    return c;
  }
  function scopeDestination(condition, s, feature) {
    const c = structuredClone(condition), off = [], on = [];
    for (const domain of Object.keys(s.sites)) {
      const site = effective(s, domain);
      (site.enabled && site[feature] ? on : off).push(domain);
    }
    if (!s.features[feature]) {
      if (!on.length) return null;
      const include = c.requestDomains ? intersect(c.requestDomains, on) : on;
      if (!include.length) return null;
      c.requestDomains = include;
    }
    if (off.length)
      c.excludedRequestDomains = [
        .../* @__PURE__ */ new Set([...c.excludedRequestDomains ?? [], ...off])
      ];
    return c;
  }
  function makePlan(s, cache2, maxRules = 28e3) {
    const out = {
      rules: [],
      cosmetic: [],
      meta: {},
      report: { lists: {}, rejected: 0, omitted: 0 }
    }, seen = /* @__PURE__ */ new Set();
    let id = 1;
    const add = (r, category) => {
      const key = JSON.stringify(r);
      if (seen.has(key)) return;
      seen.add(key);
      out.rules.push({ ...r, id });
      out.meta[id++] = { category, action: r.action.type };
    };
    if (!s.enabled) return out;
    const entries = s.lists.filter((l) => l.enabled && cache2.has(l.id)).map((l) => ({
      list: l,
      data: cache2.get(l.id),
      rules: compactRules(cache2.get(l.id).compiled.rules),
      budget: 0
    }));
    const custom = compile(s.customFilters, false, true);
    let remaining = maxRules - 2e3;
    while (remaining > 0) {
      const hungry = entries.filter((e) => e.budget < e.rules.length);
      if (!hungry.length) break;
      const share = Math.max(1, Math.floor(remaining / hungry.length));
      for (const entry of hungry) {
        const extra = Math.min(
          share,
          entry.rules.length - entry.budget,
          remaining
        );
        entry.budget += extra;
        remaining -= extra;
      }
    }
    const select = (rules, budget) => {
      const allows = rules.filter((r) => r.action.type === "allow");
      if (allows.length > budget)
        throw Error(
          "Demasiadas excepciones: no se aplicar\xE1 bloqueo sin sus excepciones"
        );
      return [
        ...allows,
        ...rules.filter((r) => r.action.type !== "allow").slice(0, budget - allows.length)
      ];
    };
    if (custom.rules.length > 1200)
      throw Error("M\xE1ximo 1200 reglas de red personalizadas");
    for (const { list, data, rules, budget } of entries) {
      const feature = list.category === "malware" ? "malware" : list.category === "trackers" ? "trackers" : list.category === "annoyances" ? "cookies" : "ads";
      const chosen = select(rules, budget);
      let active = 0;
      for (const r of chosen) {
        if (r.condition.resourceTypes?.includes("main_frame")) {
          const main = scopeDestination(
            { ...r.condition, resourceTypes: ["main_frame"] },
            s,
            feature
          );
          if (main) {
            add({ ...r, condition: main }, list.category);
            active++;
          }
          const other = r.condition.resourceTypes.filter(
            (t) => t !== "main_frame"
          );
          if (other.length) {
            const sub = scope(
              { ...r.condition, resourceTypes: other },
              s,
              feature
            );
            if (sub) {
              add({ ...r, condition: sub }, list.category);
              active++;
            }
          }
        } else {
          const condition = scope(r.condition, s, feature);
          if (condition) {
            add({ ...r, condition }, list.category);
            active++;
          }
        }
      }
      const listReport = {
        parsed: data.compiled.sourceRules ?? data.compiled.rules.length,
        compacted: rules.length,
        selected: active,
        omitted: rules.length - chosen.length,
        rejected: data.compiled.rejected,
        duplicates: data.compiled.duplicates,
        cosmetic: data.compiled.cosmetic.length,
        hash: data.hash,
        updated: data.updated,
        examples: data.compiled.examples
      };
      out.report.lists[list.id] = listReport;
      out.report.rejected = Number(out.report.rejected) + data.compiled.rejected;
      out.report.omitted = Number(out.report.omitted) + listReport.omitted;
    }
    for (const r of custom.rules)
      add(
        {
          ...r,
          priority: (r.action.type === "allow" ? 300 : 200) + (r.priority ?? 1)
        },
        "custom"
      );
    out.cosmetic = custom.cosmetic;
    out.report.custom = {
      network: custom.rules.length,
      cosmetic: custom.cosmetic.length,
      rejected: custom.rejected,
      examples: custom.examples
    };
    for (const param of TRACKING_PARAMS) {
      const clean = scopeDestination(
        {
          regexFilter: "[?&]" + param + "=",
          resourceTypes: ["main_frame", "sub_frame"]
        },
        s,
        "cleanup"
      );
      if (clean)
        add(
          {
            priority: 50,
            action: {
              type: "redirect",
              redirect: {
                transform: { queryTransform: { removeParams: TRACKING_PARAMS } }
              }
            },
            condition: clean
          },
          "cleanup"
        );
    }
    const https = scopeDestination(
      {
        urlFilter: "|http:",
        excludedRequestDomains: ["localhost", "127.0.0.1"],
        resourceTypes: ["main_frame"]
      },
      s,
      "https"
    );
    if (https)
      add(
        {
          priority: 40,
          action: { type: "upgradeScheme" },
          condition: https
        },
        "https"
      );
    const scripts = scope(
      {
        urlFilter: "*",
        domainType: "thirdParty",
        resourceTypes: ["script"]
      },
      s,
      "thirdPartyScripts"
    );
    if (scripts)
      add(
        { priority: 100, action: { type: "block" }, condition: scripts },
        "scripts"
      );
    for (const [domain, site] of Object.entries(s.sites))
      if (site.enabled === false) {
        add(
          {
            priority: 1e5,
            action: { type: "allowAllRequests" },
            condition: {
              requestDomains: [domain],
              resourceTypes: ["main_frame", "sub_frame"]
            }
          },
          "exception"
        );
        add(
          {
            priority: 1e5,
            action: { type: "allow" },
            condition: { initiatorDomains: [domain] }
          },
          "exception"
        );
      }
    out.report.total = out.rules.length;
    out.report.budget = maxRules;
    if (out.rules.length > maxRules) throw Error("L\xEDmite de reglas excedido");
    return out;
  }

  // src/lists/store.ts
  var MAX_BYTES = 12 * 1024 * 1024;
  async function digest(text) {
    const data = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text)
    );
    return Array.from(
      new Uint8Array(data),
      (b) => b.toString(16).padStart(2, "0")
    ).join("");
  }
  var database;
  function db() {
    return database ??= new Promise((resolve, reject) => {
      const r = indexedDB.open("wolfshield-lists", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("lists");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function getCache(id) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const r = d.transaction("lists").objectStore("lists").get(id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function putCache(id, value) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction("lists", "readwrite");
      tx.objectStore("lists").put(value, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function verified(text, list) {
    if (new TextEncoder().encode(text).length > MAX_BYTES || text.trim().length < 10 || /^\s*<!doctype|^\s*<html/i.test(text))
      throw Error("Respuesta de lista inv\xE1lida o demasiado grande");
    const hash = await digest(text);
    if (list.expectedHash && hash !== list.expectedHash)
      throw Error("La integridad SHA-256 no coincide");
    const compiled = compile(text, list.category === "malware");
    if (!compiled.rules.length && !compiled.cosmetic.length)
      throw Error("La lista no contiene filtros compatibles");
    compiled.sourceRules = compiled.rules.length;
    compiled.rules = compactRules(compiled.rules);
    return { text, hash, compiled, updated: (/* @__PURE__ */ new Date()).toISOString() };
  }
  async function fetchList(list) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3e4);
    try {
      const res = await fetch(list.url, {
        signal: controller.signal,
        credentials: "omit",
        cache: "no-cache",
        referrerPolicy: "no-referrer"
      });
      if (!res.ok || !res.url.startsWith("https:"))
        throw Error("Descarga fallida: HTTP " + res.status);
      if (Number(res.headers.get("content-length")) > MAX_BYTES)
        throw Error("Lista demasiado grande");
      const reader = res.body.getReader(), chunks = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_BYTES) {
          await reader.cancel();
          throw Error("M\xE1ximo 12 MB por lista");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return await verified(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        list
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // src/privacy/browser.ts
  async function applyBrowserPrivacy(s) {
    const errors = [];
    const setting = async (api, enabled, value, label) => {
      if (!api) {
        if (enabled) errors.push(label + ": API no disponible");
        return;
      }
      try {
        const state = await api.get({});
        if (enabled) {
          if (![
            "controllable_by_this_extension",
            "controlled_by_this_extension"
          ].includes(state.levelOfControl))
            throw Error("Controlada por el navegador u otra extensi\xF3n");
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
      "WebRTC"
    );
    await setting(
      chrome.privacy?.websites?.thirdPartyCookiesAllowed,
      s.thirdPartyCookies,
      false,
      "Cookies de terceros"
    );
    for (const feature of ["popups", "notifications"]) {
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
            scope: "regular"
          });
        for (const domain of Object.keys(s.sites)) {
          const site = effective(s, domain);
          const pattern = "*://" + (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(domain) || domain === "localhost" ? "" : "*.") + domain + "/*";
          if (site.enabled && site[feature])
            await api.set({
              primaryPattern: pattern,
              setting: "block",
              scope: "regular"
            });
          else if (s.enabled && s.features[feature])
            errors.push(
              `${domain}: ${feature} es global; el bloqueo del navegador sigue activo`
            );
        }
      } catch (e) {
        errors.push(feature + ": " + String(e));
      }
    }
    return errors;
  }
  async function registerProtections(s) {
    const registrations = [];
    for (const feature of ["fingerprint", "compat"]) {
      const off = Object.keys(s.sites).filter((d) => {
        const v = effective(s, d);
        return !v.enabled || !v[feature];
      }).map((d) => "*://*." + d + "/*");
      const on = Object.keys(s.sites).filter((d) => {
        const v = effective(s, d);
        return v.enabled && v[feature];
      }).map((d) => "*://*." + d + "/*");
      const matches = s.features[feature] ? ["http://*/*", "https://*/*"] : on;
      if (s.enabled && matches.length)
        registrations.push({
          id: "wolf-" + feature,
          matches,
          excludeMatches: off,
          js: [feature === "fingerprint" ? "privacy-main.js" : "compat-main.js"],
          runAt: "document_start",
          world: "MAIN",
          allFrames: false,
          persistAcrossSessions: true
        });
    }
    const old = await chrome.scripting.getRegisteredContentScripts();
    const normalize = (list) => JSON.stringify(
      list.filter((x) => x.id.startsWith("wolf-")).sort((a, b) => a.id.localeCompare(b.id)).map((x) => [
        x.id,
        [...x.matches ?? []].sort(),
        [...x.excludeMatches ?? []].sort(),
        x.js,
        x.runAt,
        x.world,
        x.allFrames ?? false,
        x.persistAcrossSessions ?? true
      ])
    );
    if (normalize(old) === normalize(registrations)) return;
    const ids = old.filter((x) => x.id.startsWith("wolf-")).map((x) => x.id);
    if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
    if (registrations.length)
      await chrome.scripting.registerContentScripts(registrations);
  }

  // src/statistics/store.ts
  var emptyStats = () => ({ days: {}, domains: {}, log: [] });
  function prune(stats2, now = Date.now()) {
    const cutoff = new Date(now - 29 * 864e5).toISOString().slice(0, 10);
    for (const date of Object.keys(stats2.days))
      if (date < cutoff) delete stats2.days[date];
    for (const date of Object.keys(stats2.domainDays ?? {}))
      if (date < cutoff) delete stats2.domainDays[date];
    const totals = {};
    for (const values of Object.values(stats2.domainDays ?? {}))
      for (const [domain, count] of Object.entries(values))
        totals[domain] = (totals[domain] ?? 0) + count;
    stats2.domains = Object.fromEntries(
      Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 200)
    );
    return stats2;
  }
  function record(stats2, settings2, domain, category, type, now = Date.now()) {
    if (settings2.statistics) {
      const day = new Date(now).toISOString().slice(0, 10);
      stats2.days[day] ??= {};
      stats2.days[day][category] = (stats2.days[day][category] ?? 0) + 1;
      if (category === "trackers") {
        stats2.domainDays ??= {};
        stats2.domainDays[day] ??= {};
        const d = stats2.domainDays[day];
        d[domain] = (d[domain] ?? 0) + 1;
        stats2.domainDays[day] = Object.fromEntries(
          Object.entries(d).sort((a, b) => b[1] - a[1]).slice(0, 200)
        );
      }
      prune(stats2, now);
    }
    if (settings2.requestLog) {
      stats2.log.push({ time: now, domain, category, type });
      stats2.log = stats2.log.slice(-200);
    }
  }

  // src/background.ts
  var settings = defaults();
  var cache = /* @__PURE__ */ new Map();
  var plan = makePlan(settings, cache);
  var report = {};
  var feedback = false;
  var stats = { days: {}, domains: {}, log: [] };
  var counts = {};
  var statsTimer;
  var queue = Promise.resolve();
  var cosmeticCache = /* @__PURE__ */ new Map();
  var ruleLimit = () => Math.min(
    28e3,
    chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES ?? 5e3
  );
  function serial(fn) {
    const p = queue.then(fn);
    queue = p.then(
      () => void 0,
      () => void 0
    );
    return p;
  }
  var error = (e) => e instanceof Error ? e.message : String(e);
  var ready = (async () => {
    await chrome.storage.local.setAccessLevel?.({
      accessLevel: "TRUSTED_CONTEXTS"
    });
    const data = await chrome.storage.local.get([
      "settings",
      "stats",
      "report",
      "engineVersion"
    ]);
    if (data.settings) settings = validateSettings(data.settings);
    if (data.stats) {
      stats = prune(data.stats);
      await chrome.storage.local.set({ stats });
    }
    if (data.report) report = data.report;
    counts = (await chrome.storage.session.get("counts")).counts ?? {};
    const packaged = await (await fetch(chrome.runtime.getURL("lists/index.json"))).json();
    for (const list of settings.lists) {
      let data2 = await getCache(list.id);
      if (!data2 && packaged[list.id]) {
        const text = await (await fetch(chrome.runtime.getURL("lists/" + list.id + ".txt"))).text();
        data2 = await verified(text, {
          ...list,
          expectedHash: packaged[list.id].hash
        });
        await putCache(list.id, data2);
      }
      if (data2) cache.set(list.id, data2);
    }
    plan = makePlan(settings, cache, ruleLimit());
    try {
      await chrome.declarativeNetRequest.getMatchedRules({
        minTimeStamp: Date.now()
      });
      feedback = true;
    } catch {
      feedback = false;
    }
    if (data.engineVersion !== chrome.runtime.getManifest().version)
      await apply(settings);
    await chrome.declarativeNetRequest.setExtensionActionOptions?.({
      displayActionCountAsBadgeText: true
    });
    await chrome.alarms.create("wolf-update", { periodInMinutes: 1440 });
  })().catch(async (e) => {
    report = { ...report, fatal: error(e) };
    await chrome.storage.local.set({ report });
    throw e;
  });
  async function apply(next, force = false) {
    const nextPlan = makePlan(next, cache, ruleLimit());
    const previous = settings, previousPlan = plan;
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const networkChanged = force || existing.length !== nextPlan.rules.length || JSON.stringify(previousPlan.rules) !== JSON.stringify(nextPlan.rules);
    try {
      if (networkChanged)
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existing.map((r) => r.id),
          addRules: nextPlan.rules
        });
      await registerProtections(next);
    } catch (e) {
      if (networkChanged) {
        const installed = await chrome.declarativeNetRequest.getDynamicRules();
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: installed.map((r) => r.id),
          addRules: existing
        });
      }
      await registerProtections(previous).catch(() => {
      });
      plan = previousPlan;
      throw e;
    }
    settings = next;
    plan = nextPlan;
    cosmeticCache.clear();
    report = {
      ...nextPlan.report,
      privacyWarnings: await applyBrowserPrivacy(next),
      applied: (/* @__PURE__ */ new Date()).toISOString()
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
      engineVersion: chrome.runtime.getManifest().version
    });
    for (const tab of await chrome.tabs.query({}))
      if (tab.id)
        chrome.tabs.sendMessage(tab.id, { type: "refresh" }).catch(() => {
        });
  }
  async function updateLists() {
    const results = {}, old = new Map(cache), pending = /* @__PURE__ */ new Map();
    for (const list of settings.lists.filter((l) => l.enabled))
      try {
        const data = await fetchList(list);
        pending.set(list.id, data);
        cache.set(list.id, data);
        results[list.id] = "Actualizada \xB7 " + data.hash.slice(0, 12);
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
  function contentConfig(host, topHost) {
    const key = host + "|" + topHost;
    if (cosmeticCache.has(key)) return cosmeticCache.get(key);
    const site = effective(settings, topHost), selectors = [];
    if (site.enabled && site.cosmetic) {
      const all = [...plan.cosmetic];
      for (const list of settings.lists.filter((l) => l.enabled)) {
        const active = list.category === "annoyances" ? site.cookies : list.category === "trackers" ? site.trackers : list.category === "malware" ? site.malware : site.ads;
        if (active) all.push(...cache.get(list.id)?.compiled.cosmetic ?? []);
      }
      selectors.push(...cosmeticFor(all, host));
    }
    const result = { enabled: site.enabled, selectors };
    if (cosmeticCache.size >= 128)
      cosmeticCache.delete(cosmeticCache.keys().next().value);
    cosmeticCache.set(key, result);
    return result;
  }
  async function snapshot(host, tabId) {
    prune(stats);
    return {
      settings,
      report,
      stats,
      capabilities: {
        feedback,
        contentSettings: !!chrome.contentSettings,
        privacy: !!chrome.privacy
      },
      host,
      site: host ? effective(settings, host) : void 0,
      counts: tabId === void 0 ? void 0 : feedback ? counts[tabId] ?? {} : void 0
    };
  }
  var picker = /* @__PURE__ */ new Map();
  async function handle(message, sender) {
    await ready;
    const ui = sender.id === chrome.runtime.id && !!sender.url && [
      chrome.runtime.getURL("popup.html"),
      chrome.runtime.getURL("dashboard.html")
    ].some((url) => sender.url.split("#")[0].split("?")[0] === url);
    if (message?.type === "content-config" && sender.tab && sender.url) {
      return contentConfig(
        new URL(sender.url).hostname,
        new URL(sender.tab.url ?? sender.url).hostname
      );
    }
    if (message?.type === "picker-save" && sender.tab?.id && sender.url) {
      const token = picker.get(sender.tab.id);
      if (!token || token.expires < Date.now() || token.host !== new URL(sender.url).hostname || sender.frameId !== 0)
        throw Error("Selector no autorizado");
      if (typeof message.selector !== "string" || !safeSelector(message.selector))
        throw Error("Selector inv\xE1lido");
      picker.delete(sender.tab.id);
      await apply({
        ...settings,
        customFilters: settings.customFilters + "\n" + token.host + "##" + message.selector
      });
      return true;
    }
    if (!ui) throw Error("Operaci\xF3n reservada a la interfaz de la extensi\xF3n");
    switch (message.type) {
      case "snapshot":
        return snapshot(message.host, message.tabId);
      case "settings": {
        const next = validateSettings(message.settings);
        for (const list of next.lists.filter(
          (l) => l.enabled && !cache.has(l.id)
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
          throw Error("Texto de lista inv\xE1lido");
        const data = await verified(message.text, list), old = cache.get(list.id);
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
        if (!data) throw Error("Lista a\xFAn no descargada");
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
          expires: Date.now() + 12e4
        });
        await chrome.tabs.sendMessage(
          message.tabId,
          { type: "picker" },
          { frameId: 0 }
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
          consistent: JSON.stringify(rules.map((r) => r.id).sort((a, b) => a - b)) === JSON.stringify(plan.rules.map((r) => r.id).sort((a, b) => a - b)),
          scripts: scripts.map((s) => s.id),
          feedback,
          report
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
      (e) => reply({ ok: false, error: error(e) })
    );
    return true;
  });
  chrome.runtime.onInstalled.addListener(() => {
    ready.then(() => serial(() => apply(settings))).catch(() => {
    });
  });
  chrome.runtime.onStartup.addListener(() => {
    ready.then(() => serial(() => apply(settings))).catch(() => {
    });
  });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === "wolf-update")
      ready.then(async () => {
        prune(stats);
        await chrome.storage.local.set({ stats });
        if (settings.autoUpdate) return serial(updateLists);
      }).catch((e) => {
        report.updateError = error(e);
        chrome.storage.local.set({ report });
      });
  });
  chrome.tabs.onRemoved.addListener((id) => {
    delete counts[id];
    picker.delete(id);
    chrome.storage.session.set({ counts }).catch(() => {
    });
  });
  chrome.tabs.onUpdated.addListener((id, change) => {
    if (change.status === "loading") {
      delete counts[id];
      chrome.storage.session.set({ counts }).catch(() => {
      });
    }
  });
  try {
    chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener((info) => {
      ready.then(() => {
        const meta = plan.meta[info.rule.ruleId];
        if (!meta || meta.action !== "block") return;
        const tab = info.request.tabId, category = meta.category;
        if (tab >= 0) {
          counts[tab] ??= {};
          counts[tab][category] = (counts[tab][category] ?? 0) + 1;
        }
        const domain = new URL(info.request.url).hostname;
        record(stats, settings, domain, category, info.request.type);
        if (!statsTimer)
          statsTimer = setTimeout(() => {
            statsTimer = void 0;
            chrome.storage.session.set({ counts });
            chrome.storage.local.set({ stats });
          }, 1e3);
      }).catch(() => {
      });
    });
  } catch {
    feedback = false;
  }
})();
//# sourceMappingURL=background.js.map
