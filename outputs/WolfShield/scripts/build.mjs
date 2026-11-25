import { build } from "esbuild";
import { mkdir, cp, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const integrity=JSON.parse(await readFile('assets/lists/index.json','utf8'));
for(const [id,entry] of Object.entries(integrity)){
 const bytes=await readFile(`assets/lists/${id}.txt`);
 if(createHash('sha256').update(bytes).digest('hex')!==entry.hash)throw Error(`Integrity mismatch: ${id}`);
}
const common = {
  manifest_version: 3,
  name: "WolfShield",
  version: "1.0.0",
  description:
    "Bloqueo local de anuncios, rastreadores y dominios maliciosos, con control por sitio.",
  permissions: [
    "storage",
    "alarms",
    "scripting",
    "activeTab",
    "declarativeNetRequest",
    "declarativeNetRequestFeedback",
    "privacy",
    "contentSettings",
  ],
  host_permissions: ["http://*/*", "https://*/*"],
  action: {
    default_popup: "popup.html",
    default_title: "WolfShield",
    default_icon: {
      16: "icons/icon16.png",
      32: "icons/icon32.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    },
  },
  icons: {
    16: "icons/icon16.png",
    32: "icons/icon32.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  },
  options_ui: { page: "dashboard.html", open_in_tab: true },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["content.js"],
      run_at: "document_start",
      all_frames: true,
    },
  ],
  web_accessible_resources: [
    {
      resources: ["resources/noop.js"],
      matches: ["http://*/*", "https://*/*"],
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none';",
  },
};
// Stable development key makes the isolated test extension ID reproducible.
const { publicKey } = await import("node:crypto").then((c) =>
  c.generateKeyPairSync("rsa", { modulusLength: 2048 }),
);
await cp("licenses/GPL-3.0.txt", "LICENSE");
await mkdir("public/docs", { recursive: true });
const readme = await readFile("README.md", "utf8");
await writeFile(
  "public/docs/README.html",
  '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WolfShield · Documentación</title><link rel="stylesheet" href="../ui.css"><body><main style="max-width:960px;margin:auto;padding:32px"><h1>WolfShield · Documentación</h1><pre style="max-height:none;white-space:pre-wrap;font:15px/1.7 system-ui">' +
    readme
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;") +
    "</pre></main></body></html>",
);
let key;
try {
  key = (await readFile("assets/development-key.txt", "utf8")).trim();
} catch {
  key = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  await mkdir("assets", { recursive: true });
  await writeFile("assets/development-key.txt", key);
}
for (const target of ["chromium", "firefox"]) {
  const out = "dist/" + target;
  await mkdir(out, { recursive: true });
  await cp("public", out, { recursive: true });
  await cp("assets/lists", out + "/lists", { recursive: true });
  await cp("licenses", out + "/licenses", { recursive: true });
  await cp("THIRD_PARTY_NOTICES.md", out + "/THIRD_PARTY_NOTICES.md");
  await cp("LICENSE", out + "/LICENSE");
  await build({
    entryPoints: {
      background: "src/background.ts",
      content: "src/content.ts",
      "privacy-main": "src/privacy/main.ts",
      "compat-main": "src/scriptlets/compat.ts",
      popup: "src/ui/popup.ts",
      dashboard: "src/ui/dashboard.ts",
    },
    outdir: out,
    bundle: true,
    format: "iife",
    target: target === "chromium" ? "chrome121" : "firefox140",
    define: target === "firefox" ? { chrome: "browser" } : {},
    sourcemap: true,
    legalComments: "eof",
  });
  const manifest = structuredClone(common);
  if (target === "chromium") {
    manifest.minimum_chrome_version = "121";
    manifest.background = { service_worker: "background.js" };
    manifest.key = key;
  } else {
    manifest.background = { scripts: ["background.js"] };
    manifest.permissions = manifest.permissions.filter(
      (p) => p !== "contentSettings",
    );
    manifest.browser_specific_settings = {
      gecko: {
        id: "wolfshield@local.invalid",
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
    };
  }
  await writeFile(out + "/manifest.json", JSON.stringify(manifest, null, 2));
  console.log("Built", target);
}
