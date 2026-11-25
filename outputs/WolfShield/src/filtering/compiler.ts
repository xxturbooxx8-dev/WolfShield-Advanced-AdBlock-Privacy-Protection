import type { Compiled, Cosmetic, Rule } from "../core/types.ts";
const types: Record<string, chrome.declarativeNetRequest.ResourceType> = {
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
  other: "other",
} as never;
const resources = [
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
  "other",
] as chrome.declarativeNetRequest.ResourceType[];
const domainOK = (s: string) =>
  /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(s) && !s.includes("..");
export function safeSelector(s: string): boolean {
  return (
    !!s &&
    s.length <= 1000 &&
    !/[{}\r\n\x00]/.test(s) &&
    !/\/\*|\*\/|@|:has-text\(|:contains\(|:matches-css\(|:xpath\(|:remove\(|:style\(|:upward\(|:watch-attr\(|:others\(|:matches-path\(|:min-text-length\(|:matches-attr\(|:matches-prop\(|:not\s*\(\s*\)/i.test(
      s,
    )
  );
}
export function compile(
  text: string,
  malware = false,
  localRedirects = false,
): Compiled {
  const result: Compiled = {
      rules: [],
      cosmetic: [],
      rejected: 0,
      duplicates: 0,
      examples: [],
    },
    seen = new Set<string>();
  const reject = (line: string) => {
    result.rejected++;
    if (result.examples.length < 8) result.examples.push(line.slice(0, 180));
  };
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (
      !line ||
      line.startsWith("!") ||
      line.startsWith("[") ||
      line.startsWith("# ")
    )
      continue;
    if (seen.has(line)) {
      result.duplicates++;
      continue;
    }
    seen.add(line);
    if (line.includes("#@#") || line.includes("##")) {
      const exception = line.includes("#@#"),
        separator = exception ? "#@#" : "##",
        index = line.indexOf(separator),
        selector = line.slice(index + separator.length),
        prefix = line.slice(0, index);
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
        excluded: domains
          .filter((d) => d.startsWith("~"))
          .map((d) => d.slice(1)),
        selector,
        exception,
      });
      continue;
    }
    if (line.startsWith("#")) continue;
    if (/#\$#|#%#|#\?#|#@\$#|#@\?#/.test(line)) {
      reject(line);
      continue;
    }
    const hostLine = line
      .replace(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+/, "")
      .replace(/\s+#.*$/, "");
    if (domainOK(hostLine) && hostLine.includes("."))
      line = "||" + hostLine + "^";
    let exception = line.startsWith("@@");
    if (exception) line = line.slice(2);
    const dollar = line.lastIndexOf("$"),
      pattern = dollar < 0 ? line : line.slice(0, dollar),
      options = dollar < 0 ? [] : line.slice(dollar + 1).split(",");
    if (
      !pattern ||
      pattern.length > 1000 ||
      /^\/.*\/$/.test(pattern) ||
      /\s|[^\x20-\x7e]/.test(pattern)
    ) {
      reject(line);
      continue;
    }
    const condition: chrome.declarativeNetRequest.RuleCondition = {
      urlFilter: pattern,
    };
    let included: chrome.declarativeNetRequest.ResourceType[] = [],
      excluded: chrome.declarativeNetRequest.ResourceType[] = [],
      invalid = false,
      important = false,
      noop = false;
    for (const option of options) {
      const neg = option.startsWith("~"),
        name = neg ? option.slice(1) : option;
      if (types[name]) (neg ? excluded : included).push(types[name]);
      else if (name === "third-party" || name === "3p")
        condition.domainType = (neg ? "firstParty" : "thirdParty") as never;
      else if (name === "first-party" || name === "1p")
        condition.domainType = (neg ? "thirdParty" : "firstParty") as never;
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
        const yes = domains.filter((d) => !d.startsWith("~")),
          no = domains.filter((d) => d.startsWith("~")).map((d) => d.slice(1));
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
        (t) => !excluded.includes(t),
      );
    else
      condition.resourceTypes = (
        malware
          ? [
              ...resources,
              "main_frame" as chrome.declarativeNetRequest.ResourceType,
            ]
          : resources
      ).filter((t) => !excluded.includes(t));
    if (!condition.resourceTypes.length) {
      reject(line);
      continue;
    }
    if (
      noop &&
      (condition.resourceTypes.length !== 1 ||
        condition.resourceTypes[0] !== "script")
    ) {
      reject(line);
      continue;
    }
    result.rules.push({
      priority: important ? (exception ? 50 : 40) : exception ? 30 : 10,
      action: noop
        ? {
            type: "redirect" as never,
            redirect: { extensionPath: "/resources/noop.js" },
          }
        : { type: (exception ? "allow" : "block") as never },
      condition,
    });
  }
  return result;
}
export function cosmeticFor(
  rules: Cosmetic[],
  host: string,
  limit = 2000,
): string[] {
  const match = (d: string) => host === d || host.endsWith("." + d);
  const applies = (r: Cosmetic) =>
    (!r.domains.length || r.domains.some(match)) && !r.excluded.some(match);
  const exceptions = new Set(
    rules.filter((r) => r.exception && applies(r)).map((r) => r.selector),
  );
  const specific = rules.filter(
    (r) => !r.exception && r.domains.length && applies(r),
  );
  const generic = rules
    .filter((r) => !r.exception && !r.domains.length && applies(r))
    .slice(0, 500);
  return [
    ...new Set(
      [...specific, ...generic]
        .map((r) => r.selector)
        .filter((s) => !exceptions.has(s)),
    ),
  ].slice(0, limit);
}
