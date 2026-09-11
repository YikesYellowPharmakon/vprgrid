import { collectPublicReleases } from "./rym-public-fetch.mjs";
import { ingestWebItems, type WebItem } from "./web-pool";

const HOUR = 60 * 60 * 1000;

type Cache = { at: number; items: WebItem[] };
let mem: Cache | null = null;
let inflight: Promise<WebItem[]> | null = null;

function asItems(raw: unknown[]): WebItem[] {
  const out: WebItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Partial<WebItem> & { tags?: string[] };
    const artist = String(o.artist ?? "").trim();
    const title = String(o.title ?? "").trim();
    const date = String(o.date ?? "").slice(0, 10);
    if (!artist || !title || date.length < 10) continue;
    const source = o.source === "wiki" ? "wiki" : "rym";
    out.push({
      source,
      artist,
      title,
      date,
      type: o.type === "EP" ? "EP" : "Album",
      userScore: typeof o.userScore === "number" ? o.userScore : null,
      cover: typeof o.cover === "string" ? o.cover : null,
      url: typeof o.url === "string" ? o.url : "",
      tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === "string") : [],
    });
  }
  return out;
}

async function refresh(): Promise<WebItem[]> {
  const bag = await collectPublicReleases();
  const items = asItems(bag.items);
  if (items.length > 0) {
    ingestWebItems(items);
    mem = { at: Date.now(), items };
  }
  return mem?.items ?? [];
}

/** 雷达构建时调用:有缓存直接回,没缓存就拉公开源(不登录、不打 Cloudflare)。 */
export async function loadRymPublic(): Promise<WebItem[]> {
  if (mem && Date.now() - mem.at < HOUR) return mem.items;
  if (!inflight) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
