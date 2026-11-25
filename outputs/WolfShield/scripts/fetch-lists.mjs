import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { catalog } from "../src/core/config.ts";
await mkdir("assets/lists", { recursive: true });
await mkdir("licenses", { recursive: true });
const index = {};
const texts = new Map();
for (const list of catalog.filter((l) => l.enabled)) {
  console.log("Downloading", list.name);
  const response = await fetch(list.url, {
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw Error(list.id + ": HTTP " + response.status);
  const text = await response.text();
  if (text.length < 100 || text.trim().startsWith("<"))
    throw Error("Invalid response: " + list.id);
  texts.set(list.id, text);
  index[list.id] = {
    name: list.name,
    url: list.url,
    license: list.license,
    hash: createHash("sha256").update(text).digest("hex"),
    retrieved: new Date().toISOString(),
    bytes: Buffer.byteLength(text),
  };
}
for (const [id,text] of texts) await writeFile(`assets/lists/${id}.txt`,text);
await writeFile("assets/lists/index.json", JSON.stringify(index, null, 2));
for (const [file, url] of [
  [
    "GPL-3.0.txt",
    "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/LICENSE",
  ],
]) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (res.ok) await writeFile("licenses/" + file, await res.text());
  else console.log("License fetch failed", url, res.status);
}
