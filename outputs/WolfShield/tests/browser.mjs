import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const work = path.resolve(
  process.env.WOLFSHIELD_TEST_WORK ?? "../../work/browser-tests",
);
await mkdir(work, { recursive: true });
const results = [],
  errors = [];
let context, sw, dashboard, page;
const extension = path.resolve("dist/chromium"),
  profile = path.join(work, "profile-" + Date.now());
const server = createServer((req, res) => {
  if (
    req.url.startsWith("/blocked.js") ||
    req.url.startsWith("/tracker.gif") ||
    req.url.startsWith("/replacement.js")
  ) {
    res.writeHead(200, { "content-type": "application/javascript" });
    res.end("window.networkExecuted=true");
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(
    `<!doctype html><html><head><title>WolfShield controlled fixture</title><script>window.earlyCompatibility=window.canRunAds===true;window.compatChecked=false;if(window.blockAdBlock){blockAdBlock.onNotDetected(()=>window.compatChecked=true).check();}</script></head><body><h1>Contenido editorial</h1><div class="fixture-ad">Anuncio de prueba</div><div class="keep">Contenido conservado</div><div class="adsbox" style="display:none;width:0;height:0"></div><div id="pick-me">Seleccionable</div><script>window.loaded=true;window.networkExecuted=false;fetch('/blocked.js').then(()=>window.requestBlocked=false,()=>window.requestBlocked=true);</script></body></html>`,
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chromium",
    viewport: { width: 1440, height: 1000 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  sw =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  sw.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const id = sw.url().split("/")[2];
  dashboard = await context.newPage();
  dashboard.on("pageerror", (e) => errors.push(e.message));
  await dashboard.goto("chrome-extension://" + id + "/dashboard.html");
  try {
    await dashboard
      .locator("#total-rules")
      .filter({ hasText: /[0-9]/ })
      .waitFor({ timeout: 30000 });
  } catch (e) {
    console.error(
      "STARTUP STATE",
      await sw.evaluate(() => chrome.storage.local.get(null)),
      await dashboard.locator("#status").innerText(),
    );
    throw e;
  }
  return id;
}
const send = async (m) => {
  const r = await dashboard.evaluate((m) => chrome.runtime.sendMessage(m), m);
  assert.equal(r.ok, true, r.error);
  return r.data;
};
const set = async (fn) => {
  const s = (await send({ type: "snapshot" })).settings;
  fn(s);
  await send({ type: "settings", settings: s });
};
async function test(name, fn) {
  const start = performance.now();
  try {
    await fn();
    results.push({
      name,
      status: "passed",
      ms: Math.round(performance.now() - start),
    });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "failed", error: String(e) });
    console.error("FAIL", name, e);
    throw e;
  }
}
try {
  let id = await launch();
  await test("Default lists install real DNR rules", async () => {
    const d = await send({ type: "diagnose" });
    assert.equal(d.consistent, true);
    assert.ok(d.rules > 1000);
    await writeFile(
      path.join(work, "initial-diagnostics.json"),
      JSON.stringify(d, null, 2),
    );
  });
  await test("Default advertising and tracking domain rules match", async () => {
    const result = await sw.evaluate(async () =>
      Promise.all(
        [
          "https://googleads.g.doubleclick.net/pagead/ads",
          "https://www.google-analytics.com/analytics.js",
        ].map((url) =>
          chrome.declarativeNetRequest.testMatchOutcome({
            url,
            type: "script",
            initiator: "https://news.example",
          }),
        ),
      ),
    );
    assert.ok(result.every((r) => r.matchedRules.length > 0));
  });
  await test("Custom network filter blocks a real HTTP request", async () => {
    await set((s) => {
      s.customFilters =
        "||127.0.0.1^*/blocked.js$script,xmlhttprequest\n127.0.0.1##.fixture-ad";
      s.statistics = true;
      s.requestLog = true;
    });
    page = await context.newPage();
    await page.goto(base);
    await page.waitForFunction(() => window.requestBlocked === true);
  });
  await test("Cosmetic filter hides existing and dynamically added ads, preserves content", async () => {
    await page.locator(".fixture-ad").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".keep").isVisible(), true);
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.className = "fixture-ad";
      el.textContent = "Dynamic";
      document.body.append(el);
    });
    assert.equal(await page.locator(".fixture-ad").nth(1).isVisible(), false);
  });
  await test("Statistics come from observed request events", async () => {
    await new Promise((r) => setTimeout(r, 1500));
    const s = await send({ type: "snapshot" });
    assert.equal(s.capabilities.feedback, true);
    assert.ok(
      s.stats.log.some(
        (e) => e.domain === "127.0.0.1" && e.category === "custom",
      ),
    );
    assert.ok(s.stats.log.every((e) => !("url" in e)));
  });
  await test("Real advertising and tracker requests fail with ERR_BLOCKED_BY_CLIENT", async () => {
    const failed = [];
    const listener = (req) =>
      failed.push({ url: req.url(), error: req.failure()?.errorText });
    page.on("requestfailed", listener);
    await page.evaluate(() =>
      Promise.all(
        [
          "https://googleads.g.doubleclick.net/pagead/ads",
          "https://www.google-analytics.com/analytics.js",
        ].map(
          (url) =>
            new Promise((resolve) => {
              const script = document.createElement("script");
              script.src = url;
              script.onload = script.onerror = resolve;
              document.head.append(script);
            }),
        ),
      ),
    );
    page.off("requestfailed", listener);
    assert.equal(failed.length, 2);
    assert.ok(failed.every((r) => r.error === "net::ERR_BLOCKED_BY_CLIENT"));
  });
  await test("Site pause allows the request and restores cosmetic content", async () => {
    await set((s) => (s.sites["127.0.0.1"] = { enabled: false }));
    await page.reload();
    await page.waitForFunction(() => window.requestBlocked === false);
    assert.equal(await page.locator(".fixture-ad").isVisible(), true);
  });
  await test("Main-world adapter runs before inline detection and preserves empty baits", async () => {
    await set((s) => (s.sites["127.0.0.1"] = { enabled: true, compat: true }));
    await page.reload();
    assert.equal(await page.evaluate(() => window.earlyCompatibility), true);
    assert.equal(await page.evaluate(() => window.compatChecked), true);
    assert.equal(
      await page
        .locator(".adsbox")
        .evaluate((el) => el.getBoundingClientRect().width),
      1,
    );
  });
  await test("Local inert script replacement prevents original execution", async () => {
    await set((s) => {
      s.customFilters +=
        "\n||127.0.0.1^*/replacement.js$script,redirect=noop.js,domain=127.0.0.1";
    });
    await page.reload();
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const el = document.createElement("script");
          el.src = "/replacement.js";
          el.onload = resolve;
          el.onerror = reject;
          document.head.append(el);
        }),
    );
    assert.equal(await page.evaluate(() => window.networkExecuted), false);
  });
  await test("URL cleanup removes tracking parameters and preserves other data", async () => {
    await page.goto(base + "/?utm_source=test&keep=yes&fbclid=secret");
    assert.equal(new URL(page.url()).search, "?keep=yes");
  });
  await test("Per-site cleanup overrides work for direct address-bar navigations", async () => {
    await set((s) => (s.sites["127.0.0.1"].cleanup = false));
    await page.goto(base + "/?utm_source=retained");
    assert.equal(new URL(page.url()).search, "?utm_source=retained");
    await set((s) => {
      s.features.cleanup = false;
      s.sites["127.0.0.1"].cleanup = true;
    });
    await page.goto(base + "/?utm_source=removed");
    assert.equal(new URL(page.url()).search, "");
    await set((s) => (s.features.cleanup = true));
  });
  await test("Strict fingerprint controls deny canvas and offline audio readback", async () => {
    await set((s) => (s.sites["127.0.0.1"].fingerprint = true));
    await page.reload();
    const result = await page.evaluate(async () => {
      let canvas = false,
        audio = false;
      try {
        document.createElement("canvas").toDataURL();
      } catch (e) {
        canvas = e.name === "SecurityError";
      }
      try {
        await new OfflineAudioContext(1, 16, 44100).startRendering();
      } catch (e) {
        audio = e.name === "SecurityError";
      }
      return { canvas, audio };
    });
    assert.deepEqual(result, { canvas: true, audio: true });
  });
  await test("Disabling strict mode restores canvas after reload", async () => {
    await set((s) => (s.sites["127.0.0.1"].fingerprint = false));
    await page.reload();
    assert.ok(
      await page.evaluate(() =>
        document
          .createElement("canvas")
          .toDataURL()
          .startsWith("data:image/png"),
      ),
    );
  });
  await test("Malicious-domain default navigation is matched without visiting it", async () => {
    const raw = await readFile("assets/lists/malware.txt", "utf8"),
      domain = raw.match(/^\|\|([^\^]+)\^$/m)[1];
    const result = await sw.evaluate(
      (url) =>
        chrome.declarativeNetRequest.testMatchOutcome({
          url,
          type: "main_frame",
        }),
      "https://" + domain + "/",
    );
    assert.ok(result.matchedRules.length > 0);
  });
  await test("Element picker saves a real domain-scoped filter", async () => {
    const tabs = await sw.evaluate(() => chrome.tabs.query({})),
      tab = tabs.find((t) => t.url?.startsWith("http://127.0.0.1"));
    assert.ok(tab);
    await send({ type: "picker", tabId: tab.id });
    await page.locator("#pick-me").hover();
    await page.locator("#pick-me").click();
    /* The shadow root is deliberately closed; use keyboard navigation. */ await page.keyboard.press(
      "Tab",
    );
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await page.locator("wolfshield-picker").waitFor({ state: "detached" });
    assert.ok(
      (await send({ type: "snapshot" })).settings.customFilters.includes(
        "127.0.0.1###pick-me",
      ),
    );
    await page.locator("#pick-me").waitFor({ state: "hidden" });
  });
  await test("Settings survive service-worker restart and browser relaunch", async () => {
    await context.close();
    id = await launch();
    const s = await send({ type: "snapshot" });
    assert.equal(s.settings.sites["127.0.0.1"].compat, true);
    assert.ok(s.settings.customFilters.includes("blocked.js"));
    page = await context.newPage();
    await page.goto(base);
    await page.waitForFunction(() => window.requestBlocked === true);
  });
  await test("Dashboard and popup render without application errors", async () => {
    await dashboard.reload();
    await dashboard
      .locator("#total-rules")
      .filter({ hasText: /[0-9]/ })
      .waitFor();
    await dashboard.screenshot({
      path: path.join(work, "dashboard.png"),
      fullPage: true,
      animations: "disabled",
    });
    const popup = await context.newPage();
    await page.bringToFront();
    await popup.goto("chrome-extension://" + id + "/popup.html");
    await popup
      .locator("#protection-label")
      .filter({ hasText: /Protección|Sin acceso/ })
      .waitFor();
    await popup.setViewportSize({ width: 410, height: 820 });
    await popup.screenshot({
      path: path.join(work, "popup.png"),
      fullPage: true,
      animations: "disabled",
    });
    await dashboard.locator('[data-section="appearance"]').click();
    await dashboard.locator("#theme").selectOption("light");
    await dashboard.waitForFunction(
      () => document.body.dataset.theme === "light",
    );
    await dashboard.locator('[data-section="overview"]').click();
    await dashboard.screenshot({
      path: path.join(work, "dashboard-light.png"),
      fullPage: true,
      animations: "disabled",
    });
    assert.equal(errors.length, 0, errors.join("\n"));
  });
  await test("Content scripts cannot mutate privileged settings", async () => {
    const tabs = await sw.evaluate(() => chrome.tabs.query({})),
      tab = tabs.find((t) => t.url?.startsWith("http://127.0.0.1"));
    const result = await sw.evaluate(
      (tabId) =>
        chrome.scripting.executeScript({
          target: { tabId },
          func: () => chrome.runtime.sendMessage({ type: "clear-stats" }),
        }),
      tab.id,
    );
    assert.equal(result[0].result.ok, false);
    assert.match(result[0].result.error, /reservada/);
  });
  await test("Global privacy settings apply and release browser control", async () => {
    await set((s) => {
      s.webrtc = true;
      s.thirdPartyCookies = true;
      s.sites["127.0.0.1"].popups = true;
      s.sites["127.0.0.1"].notifications = true;
    });
    const state = await sw.evaluate(async () => ({
      rtc: await chrome.privacy.network.webRTCIPHandlingPolicy.get({}),
      cookies: await chrome.privacy.websites.thirdPartyCookiesAllowed.get({}),
      popup: await chrome.contentSettings.popups.get({
        primaryUrl: "http://127.0.0.1/",
      }),
      notifications: await chrome.contentSettings.notifications.get({
        primaryUrl: "http://127.0.0.1/",
      }),
    }));
    assert.equal(state.rtc.value, "disable_non_proxied_udp");
    assert.equal(state.cookies.value, false);
    assert.equal(state.popup.setting, "block");
    assert.equal(state.notifications.setting, "block");
    await set((s) => {
      s.webrtc = false;
      s.thirdPartyCookies = false;
    });
    const released = await sw.evaluate(() =>
      chrome.privacy.network.webRTCIPHandlingPolicy.get({}),
    );
    assert.notEqual(released.levelOfControl, "controlled_by_this_extension");
  });
  await test("Invalid import rejected and previous configuration preserved", async () => {
    const before = (await send({ type: "snapshot" })).settings;
    const bad = structuredClone(before);
    bad.lists[0].url = "http://bad.test";
    const result = await dashboard.evaluate(
      (s) => chrome.runtime.sendMessage({ type: "settings", settings: s }),
      bad,
    );
    assert.equal(result.ok, false);
    assert.deepEqual((await send({ type: "snapshot" })).settings, before);
  });
  await test("HTTPS subscription refresh applies lists and daily alarm exists", async () => {
    const update = await send({ type: "update-lists" });
    assert.equal(Object.keys(update).length, 4);
    assert.ok(
      Object.values(update).every((v) => v.startsWith("Actualizada")),
      JSON.stringify(update),
    );
    const alarm = await sw.evaluate(() => chrome.alarms.get("wolf-update"));
    assert.equal(alarm.periodInMinutes, 1440);
    const diag = await send({ type: "diagnose" });
    assert.equal(diag.consistent, true);
  });
  await test("Statistics deletion clears persisted events", async () => {
    await send({ type: "clear-stats" });
    const s = await send({ type: "snapshot" });
    assert.deepEqual(s.stats, { days: {}, domains: {}, log: [] });
  });
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await writeFile(
    path.join(work, "browser-results.json"),
    JSON.stringify(
      {
        results,
        errors,
        browser: context?.browser()?.version(),
        time: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  await context?.close().catch(() => {});
  server.close();
}
