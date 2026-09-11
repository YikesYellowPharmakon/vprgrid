/**
 * RYM / AOTY 新发行池(文件缓存 + 插件/登录态现场导入)。
 * 不进打分过滤:只要带发行日的 Album/EP 都进扫描池,由后面的口味规则再筛。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bundledAoty from "./data/aoty-cache.json";
import bundledRym from "./data/rym-cache.json";
import { normalizeKey } from "./gold";

export type WebItem = {
  source: "aoty" | "rym" | "wiki";
  artist: string;
  title: string;
  date: string;
  type: "Album" | "EP";
  userScore: number | null;
  cover: string | null;
  url: string;
  tags?: string[];
};

type FileShape = { items?: Array<Partial<WebItem> & { artist?: string; title?: string }> };

const DIR = dirname(fileURLToPath(import.meta.url));
const AOTY_PATH = join(DIR, "data", "aoty-cache.json");
const RYM_PATH = join(DIR, "data", "rym-cache.json");

const aotyBaseline: WebItem[] = normalizeList((bundledAoty as FileShape).items, "aoty");
const rymBaseline: WebItem[] = normalizeList((bundledRym as FileShape).items, "rym");

let live: WebItem[] = [];
let gen = 0;
let fileCache: { at: number; items: WebItem[] } | null = null;
const REREAD_MS = 5 * 60 * 1000;

function asSource(raw: unknown, fallback: WebItem["source"]): WebItem["source"] {
  if (raw === "rym" || raw === "aoty" || raw === "wiki") return raw;
  return fallback;
}

function normalizeList(raw: FileShape["items"], fallback: WebItem["source"]): WebItem[] {
  if (!Array.isArray(raw)) return [];
  const out: WebItem[] = [];
  for (const x of raw) {
    const artist = String(x.artist ?? "").trim();
    const title = String(x.title ?? "").trim();
    const date = String(x.date ?? "").slice(0, 10);
    if (!artist || !title || date.length < 10) continue;
    const type = x.type === "EP" ? "EP" : "Album";
    const tags = Array.isArray((x as { tags?: unknown }).tags)
      ? ((x as { tags: unknown[] }).tags.filter((t): t is string => typeof t === "string"))
      : undefined;
    out.push({
      source: asSource(x.source, fallback),
      artist,
      title,
      date,
      type,
      userScore: typeof x.userScore === "number" ? x.userScore : null,
      cover: typeof x.cover === "string" ? x.cover : null,
      url: typeof x.url === "string" ? x.url : "",
      tags,
    });
  }
  return out;
}

function readFileItems(path: string, fallback: WebItem["source"]): WebItem[] {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as FileShape;
    return normalizeList(parsed.items, fallback);
  } catch {
    return [];
  }
}

function readFiles(): WebItem[] {
  if (fileCache && Date.now() - fileCache.at < REREAD_MS) return fileCache.items;
  const items = [
    ...aotyBaseline,
    ...rymBaseline,
    ...readFileItems(AOTY_PATH, "aoty"),
    ...readFileItems(RYM_PATH, "rym"),
  ];
  const map = new Map<string, WebItem>();
  for (const it of items) map.set(`${it.source}|${normalizeKey(it.artist)}||${normalizeKey(it.title)}`, it);
  const merged = [...map.values()];
  fileCache = { at: Date.now(), items: merged };
  return merged;
}

export function webPoolGen(): number {
  return gen;
}

export function ingestWebItems(incoming: WebItem[]): { added: number; total: number } {
  const map = new Map<string, WebItem>();
  for (const it of live) map.set(`${it.source}|${normalizeKey(it.artist)}||${normalizeKey(it.title)}`, it);
  let added = 0;
  for (const it of incoming) {
    if (!it.artist || !it.title || it.date.length < 10) continue;
    const k = `${it.source}|${normalizeKey(it.artist)}||${normalizeKey(it.title)}`;
    if (!map.has(k)) added += 1;
    map.set(k, it);
  }
  live = [...map.values()];
  if (added > 0) gen += 1;
  return { added, total: live.length };
}

export function allWebItems(): WebItem[] {
  const map = new Map<string, WebItem>();
  for (const it of [...readFiles(), ...live]) {
    map.set(`${it.source}|${normalizeKey(it.artist)}||${normalizeKey(it.title)}`, it);
  }
  return [...map.values()];
}

export function loadWebWeek(start: string, end: string): WebItem[] {
  return allWebItems().filter((a) => a.date >= start && a.date <= end);
}

export function webPoolStats(): { aoty: number; rym: number; wiki: number; live: number } {
  const all = allWebItems();
  return {
    aoty: all.filter((x) => x.source === "aoty").length,
    rym: all.filter((x) => x.source === "rym").length,
    wiki: all.filter((x) => x.source === "wiki").length,
    live: live.length,
  };
}
