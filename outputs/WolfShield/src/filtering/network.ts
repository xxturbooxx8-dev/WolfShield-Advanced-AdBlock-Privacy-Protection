import { effective, domainMatches } from "../core/config.ts";
import { compile } from "./compiler.ts";
import type {
  CachedList,
  Category,
  Cosmetic,
  Features,
  Rule,
  Settings,
} from "../core/types.ts";
export const TRACKING_PARAMS = [
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
  "igshid",
];
export type Plan = {
  rules: chrome.declarativeNetRequest.Rule[];
  cosmetic: Cosmetic[];
  meta: Record<number, { category: Category | string; action: string }>;
  report: Record<string, unknown>;
};
export function compactRules(rules: Rule[]): Rule[] {
  const result: Rule[] = [],
    groups = new Map<string, { base: Rule; domains: string[] }>();
  for (const rule of rules) {
    const match = rule.condition.urlFilter?.match(/^\|\|([a-z0-9.-]+)\^$/i);
    if (
      !match ||
      rule.condition.requestDomains ||
      rule.condition.isUrlFilterCaseSensitive
    ) {
      result.push(rule);
      continue;
    }
    const base = structuredClone(rule);
    delete base.condition.urlFilter;
    const key = JSON.stringify(base);
    if (!groups.has(key)) groups.set(key, { base, domains: [] });
    groups.get(key)!.domains.push(match[1]);
  }
  const grouped: Rule[] = [];
  for (const { base, domains } of groups.values()) {
    const unique = [...new Set(domains)];
    for (let i = 0; i < unique.length; i += 500)
      grouped.push({
        ...base,
        condition: {
          ...base.condition,
          requestDomains: unique.slice(i, i + 500),
        },
      });
  }
  return [...grouped, ...result];
}
function intersect(a: string[], b: string[]) {
  return [
    ...new Set(
      a.flatMap((x) =>
        b.flatMap((y) =>
          domainMatches(x, y) ? [x] : domainMatches(y, x) ? [y] : [],
        ),
      ),
    ),
  ];
}
export function scope(
  condition: chrome.declarativeNetRequest.RuleCondition,
  s: Settings,
  feature: keyof Features,
): chrome.declarativeNetRequest.RuleCondition | null {
  const c = structuredClone(condition),
    off: string[] = [],
    on: string[] = [];
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
      ...new Set([...(c.excludedInitiatorDomains ?? []), ...off]),
    ];
  return c;
}
export function scopeDestination(
  condition: chrome.declarativeNetRequest.RuleCondition,
  s: Settings,
  feature: keyof Features,
): chrome.declarativeNetRequest.RuleCondition | null {
  const c = structuredClone(condition),
    off: string[] = [],
    on: string[] = [];
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
      ...new Set([...(c.excludedRequestDomains ?? []), ...off]),
    ];
  return c;
}
export function makePlan(
  s: Settings,
  cache: Map<string, CachedList>,
  maxRules = 28000,
): Plan {
  const out: Plan = {
      rules: [],
      cosmetic: [],
      meta: {},
      report: { lists: {}, rejected: 0, omitted: 0 },
    },
    seen = new Set<string>();
  let id = 1;
  const add = (r: Rule, category: string) => {
    const key = JSON.stringify(r);
    if (seen.has(key)) return;
    seen.add(key);
    out.rules.push({ ...r, id });
    out.meta[id++] = { category, action: r.action.type };
  };
  if (!s.enabled) return out;
  const entries = s.lists
    .filter((l) => l.enabled && cache.has(l.id))
    .map((l) => ({
      list: l,
      data: cache.get(l.id)!,
      rules: compactRules(cache.get(l.id)!.compiled.rules),
      budget: 0,
    }));
  const custom = compile(s.customFilters, false, true);
  let remaining = maxRules - 2000;
  while (remaining > 0) {
    const hungry = entries.filter((e) => e.budget < e.rules.length);
    if (!hungry.length) break;
    const share = Math.max(1, Math.floor(remaining / hungry.length));
    for (const entry of hungry) {
      const extra = Math.min(
        share,
        entry.rules.length - entry.budget,
        remaining,
      );
      entry.budget += extra;
      remaining -= extra;
    }
  }
  const select = (rules: Rule[], budget: number) => {
    const allows = rules.filter((r) => r.action.type === "allow");
    if (allows.length > budget)
      throw Error(
        "Demasiadas excepciones: no se aplicará bloqueo sin sus excepciones",
      );
    return [
      ...allows,
      ...rules
        .filter((r) => r.action.type !== "allow")
        .slice(0, budget - allows.length),
    ];
  };
  if (custom.rules.length > 1200)
    throw Error("Máximo 1200 reglas de red personalizadas");
  for (const { list, data, rules, budget } of entries) {
    const feature: keyof Features =
      list.category === "malware"
        ? "malware"
        : list.category === "trackers"
          ? "trackers"
          : list.category === "annoyances"
            ? "cookies"
            : "ads";
    const chosen = select(rules, budget);
    let active = 0;
    for (const r of chosen) {
      if (r.condition.resourceTypes?.includes("main_frame" as never)) {
        const main = scopeDestination(
          { ...r.condition, resourceTypes: ["main_frame"] as never },
          s,
          feature,
        );
        if (main) {
          add({ ...r, condition: main }, list.category);
          active++;
        }
        const other = r.condition.resourceTypes.filter(
          (t) => t !== "main_frame",
        );
        if (other.length) {
          const sub = scope(
            { ...r.condition, resourceTypes: other },
            s,
            feature,
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
      examples: data.compiled.examples,
    };
    (out.report.lists as Record<string, unknown>)[list.id] = listReport;
    out.report.rejected = Number(out.report.rejected) + data.compiled.rejected;
    out.report.omitted = Number(out.report.omitted) + listReport.omitted;
    // Cosmetic rules retain category in the worker; this plan contains only custom rules.
  }
  for (const r of custom.rules)
    add(
      {
        ...r,
        priority: (r.action.type === "allow" ? 300 : 200) + (r.priority ?? 1),
      },
      "custom",
    );
  out.cosmetic = custom.cosmetic;
  out.report.custom = {
    network: custom.rules.length,
    cosmetic: custom.cosmetic.length,
    rejected: custom.rejected,
    examples: custom.examples,
  };
  for (const param of TRACKING_PARAMS) {
    const clean = scopeDestination(
      {
        regexFilter: "[?&]" + param + "=",
        resourceTypes: ["main_frame", "sub_frame"] as never,
      },
      s,
      "cleanup",
    );
    if (clean)
      add(
        {
          priority: 50,
          action: {
            type: "redirect" as never,
            redirect: {
              transform: { queryTransform: { removeParams: TRACKING_PARAMS } },
            },
          },
          condition: clean,
        },
        "cleanup",
      );
  }
  const https = scopeDestination(
    {
      urlFilter: "|http:",
      excludedRequestDomains: ["localhost", "127.0.0.1"],
      resourceTypes: ["main_frame"] as never,
    },
    s,
    "https",
  );
  if (https)
    add(
      {
        priority: 40,
        action: { type: "upgradeScheme" as never },
        condition: https,
      },
      "https",
    );
  const scripts = scope(
    {
      urlFilter: "*",
      domainType: "thirdParty" as never,
      resourceTypes: ["script"] as never,
    },
    s,
    "thirdPartyScripts",
  );
  if (scripts)
    add(
      { priority: 100, action: { type: "block" as never }, condition: scripts },
      "scripts",
    );
  for (const [domain, site] of Object.entries(s.sites))
    if (site.enabled === false) {
      add(
        {
          priority: 100000,
          action: { type: "allowAllRequests" as never },
          condition: {
            requestDomains: [domain],
            resourceTypes: ["main_frame", "sub_frame"] as never,
          },
        },
        "exception",
      );
      add(
        {
          priority: 100000,
          action: { type: "allow" as never },
          condition: { initiatorDomains: [domain] },
        },
        "exception",
      );
    }
  out.report.total = out.rules.length;
  out.report.budget = maxRules;
  if (out.rules.length > maxRules) throw Error("Límite de reglas excedido");
  return out;
}
