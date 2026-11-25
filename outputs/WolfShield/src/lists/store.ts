import { compile } from "../filtering/compiler.ts";
import { compactRules } from "../filtering/network.ts";
import type { CachedList, Subscription } from "../core/types.ts";
const MAX_BYTES = 12 * 1024 * 1024;
export async function digest(text: string) {
  const data = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(data), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
let database: Promise<IDBDatabase>;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("wolfshield-lists", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("lists");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export async function getCache(id: string): Promise<CachedList | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction("lists").objectStore("lists").get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function putCache(id: string, value: CachedList) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction("lists", "readwrite");
    tx.objectStore("lists").put(value, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function verified(
  text: string,
  list: Subscription,
): Promise<CachedList> {
  if (
    new TextEncoder().encode(text).length > MAX_BYTES ||
    text.trim().length < 10 ||
    /^\s*<!doctype|^\s*<html/i.test(text)
  )
    throw Error("Respuesta de lista inválida o demasiado grande");
  const hash = await digest(text);
  if (list.expectedHash && hash !== list.expectedHash)
    throw Error("La integridad SHA-256 no coincide");
  const compiled = compile(text, list.category === "malware");
  if (!compiled.rules.length && !compiled.cosmetic.length)
    throw Error("La lista no contiene filtros compatibles");
  compiled.sourceRules = compiled.rules.length;
  compiled.rules = compactRules(compiled.rules);
  return { text, hash, compiled, updated: new Date().toISOString() };
}
export async function fetchList(list: Subscription): Promise<CachedList> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(list.url, {
      signal: controller.signal,
      credentials: "omit",
      cache: "no-cache",
      referrerPolicy: "no-referrer",
    });
    if (!res.ok || !res.url.startsWith("https:"))
      throw Error("Descarga fallida: HTTP " + res.status);
    if (Number(res.headers.get("content-length")) > MAX_BYTES)
      throw Error("Lista demasiado grande");
    const reader = res.body!.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BYTES) {
        await reader.cancel();
        throw Error("Máximo 12 MB por lista");
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
      list,
    );
  } finally {
    clearTimeout(timer);
  }
}
