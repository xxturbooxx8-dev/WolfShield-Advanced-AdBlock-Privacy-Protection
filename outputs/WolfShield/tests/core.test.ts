import test from "node:test";
import assert from "node:assert/strict";
import {
  compile,
  cosmeticFor,
  safeSelector,
} from "../src/filtering/compiler.ts";
import {
  defaults,
  effective,
  hostname,
  validateSettings,
} from "../src/core/config.ts";
import {
  makePlan,
  compactRules,
  scope,
  scopeDestination,
} from "../src/filtering/network.ts";
import { verified } from "../src/lists/store.ts";
import { emptyStats, prune, record } from "../src/statistics/store.ts";
test("network: ABP domains, request types and first-party restrictions", () => {
  const r = compile(
    "||ads.example^$script,third-party,domain=news.example|~shop.news.example",
  ).rules[0];
  assert.equal(r.action.type, "block");
  assert.equal(r.condition.domainType, "thirdParty");
  assert.deepEqual(r.condition.initiatorDomains, ["news.example"]);
  assert.deepEqual(r.condition.excludedInitiatorDomains, ["shop.news.example"]);
  assert.deepEqual(r.condition.resourceTypes, ["script"]);
});
test("ordinary path filters are supported; regex and unsupported modifiers fail closed", () => {
  const c = compile(
    "/ads/banner.js\n/banner-publicidad-\n/foo.*/\n||x.test^$redirect=remote.js\n||a.test^$unknown",
  );
  assert.equal(c.rules.length, 2);
  assert.equal(c.rejected, 3);
});
test("exceptions win ordinary blocks, important blocks win ordinary exceptions", () => {
  const c = compile(
    "||a.test^\n@@||a.test^\n||a.test^$important\n@@||a.test^$important",
  );
  assert.ok(c.rules[1].priority! > c.rules[0].priority!);
  assert.ok(c.rules[2].priority! > c.rules[1].priority!);
  assert.ok(c.rules[3].priority! > c.rules[2].priority!);
});
test("cosmetic scoping, exclusions and exceptions across sources", () => {
  const c = compile(
    "##.ad\nnews.test##.slot\nnews.test#@#.ad\n~news.test##.generic\nnews.test##+js(foo)",
  );
  assert.deepEqual(cosmeticFor(c.cosmetic, "www.news.test"), [".slot"]);
  assert.deepEqual(cosmeticFor(c.cosmetic, "other.test"), [".ad", ".generic"]);
  assert.equal(c.rejected, 1);
});
test("CSS payload and procedural selectors rejected", () => {
  for (const s of [
    ".x{color:red}body",
    "@import url(x)",
    ".x/*",
    ".ad:has-text(foo)",
    "",
  ])
    assert.equal(safeSelector(s), false);
  assert.equal(safeSelector(".ad:has(img)"), true);
});
test("duplicates removed and hosts format accepted", () => {
  const c = compile("0.0.0.0 ads.test\n||a.test^\n||a.test^");
  assert.equal(c.duplicates, 1);
  assert.equal(c.rules.length, 2);
  assert.equal(c.rules[0].condition.urlFilter, "||ads.test^");
});
test("only malware lists include main_frame by default", () => {
  assert.ok(
    !compile("||x.test^").rules[0].condition.resourceTypes!.includes(
      "main_frame" as never,
    ),
  );
  assert.ok(
    compile("||x.test^", true).rules[0].condition.resourceTypes!.includes(
      "main_frame" as never,
    ),
  );
});
test("local redirects are trusted-user only and script-only", () => {
  assert.equal(compile("||x.test^$script,redirect=noop.js").rejected, 1);
  assert.equal(
    compile("||x.test^$script,redirect=noop.js", false, true).rules[0].action
      .redirect!.extensionPath,
    "/resources/noop.js",
  );
  assert.equal(compile("||x.test^$redirect=noop.js", false, true).rejected, 1);
});
test("domain compaction preserves conditions and batches 500 domains", () => {
  const rules = compile(
    Array.from({ length: 1100 }, (_, i) => `||ad${i}.test^$third-party`).join(
      "\n",
    ),
  ).rules;
  const c = compactRules(rules);
  assert.equal(c.length, 3);
  assert.equal(c[0].condition.requestDomains!.length, 500);
  assert.equal(c[0].condition.domainType, "thirdParty");
});
test("per-site flags inherit, hostname normalization and overlapping settings rejected", () => {
  const s = defaults();
  s.sites["news.test"] = { enabled: false, ads: false };
  assert.equal(effective(s, "www.news.test").enabled, false);
  assert.equal(effective(s, "badnews.test").enabled, true);
  assert.equal(hostname("HTTPS://Example.COM/path"), "example.com");
  s.sites["www.news.test"] = { enabled: true };
  assert.throws(() => validateSettings(s), /solaparse/);
});
test("import validation rejects unsafe URLs, types and excessive sites", () => {
  const s = defaults();
  s.lists[0].url = "http://example.test";
  assert.throws(() => validateSettings(s), /HTTPS/);
  const t = defaults();
  (t.features as any).ads = "true";
  assert.throws(() => validateSettings(t));
});
test("global disabling yields zero rules and site exception has highest priority", () => {
  const s = defaults();
  s.enabled = false;
  assert.equal(makePlan(s, new Map()).rules.length, 0);
  s.enabled = true;
  s.sites["news.test"] = { enabled: false };
  const p = makePlan(s, new Map());
  assert.ok(
    p.rules.some(
      (r) => r.priority === 100000 && r.action.type === "allowAllRequests",
    ),
  );
});
test("feature scope intersects original site restrictions", () => {
  const s = defaults();
  s.features.ads = false;
  s.sites["news.test"] = { ads: true };
  assert.equal(scope({ initiatorDomains: ["different.test"] }, s, "ads"), null);
  assert.deepEqual(
    scope({ initiatorDomains: ["sub.news.test"] }, s, "ads")!.initiatorDomains,
    ["sub.news.test"],
  );
});
test("navigation settings scope by destination even without an initiator", () => {
  const s = defaults();
  s.sites["news.test"] = { cleanup: false };
  assert.deepEqual(scopeDestination({}, s, "cleanup")!.excludedRequestDomains, [
    "news.test",
  ]);
  s.features.cleanup = false;
  s.sites["news.test"].cleanup = true;
  assert.deepEqual(scopeDestination({}, s, "cleanup")!.requestDomains, [
    "news.test",
  ]);
});
test("integrity pin verifies hashes and rejects HTML", async () => {
  const list = defaults().lists[0];
  const cached = await verified("||ads.example^", list);
  assert.equal(cached.hash.length, 64);
  await assert.rejects(
    () => verified("||ads.example^", { ...list, expectedHash: "0".repeat(64) }),
    /integridad/,
  );
  await assert.rejects(
    () => verified("<!doctype html><h1>Error</h1>", list),
    /inválida/,
  );
});
test("rule limits preserve exceptions and report omissions", () => {
  const s = defaults();
  s.lists = s.lists.slice(0, 1);
  const compiled = compile(
    Array.from({ length: 3500 }, (_, i) => `/advert${i}.js`).join("\n") +
      "\n@@||safe.test^",
  );
  const p = makePlan(
    s,
    new Map([[s.lists[0].id, { compiled, text: "", hash: "", updated: "" }]]),
    3000,
  );
  assert.ok(p.rules.length <= 3000);
  assert.ok(p.rules.some((r) => r.action.type === "allow"));
  assert.ok(Number(p.report.omitted) > 0);
});
test("compiler handles a large list within a bounded benchmark", () => {
  const text = Array.from({ length: 30000 }, (_, i) => `||ad${i}.test^`).join(
    "\n",
  );
  const t = performance.now();
  const c = compile(text);
  assert.equal(c.rules.length, 30000);
  const ms = performance.now() - t;
  assert.ok(ms < 5000);
  console.log("Compiler benchmark 30,000 filters:", Math.round(ms), "ms");
});
test("historical totals and tracker domains expire after 30 calendar days", () => {
  const stats = emptyStats(),
    now = Date.UTC(2026, 10, 25);
  record(
    stats,
    { statistics: true, requestLog: false },
    "tracker.test",
    "trackers",
    "image",
    now - 31 * 86400000,
  );
  record(
    stats,
    { statistics: true, requestLog: false },
    "recent.test",
    "trackers",
    "image",
    now,
  );
  prune(stats, now);
  assert.deepEqual(stats.domains, { "recent.test": 1 });
  assert.equal(Object.keys(stats.days).length, 1);
});
test("statistics disabled collects no history; request log is bounded", () => {
  const stats = emptyStats();
  record(
    stats,
    { statistics: false, requestLog: false },
    "tracker.test",
    "trackers",
    "image",
  );
  assert.deepEqual(stats, emptyStats());
  for (let i = 0; i < 250; i++)
    record(
      stats,
      { statistics: false, requestLog: true },
      "tracker.test",
      "trackers",
      "image",
    );
  assert.equal(stats.log.length, 200);
  assert.deepEqual(stats.days, {});
});
