/**
 * 服务端封面缓存(只给 /api/cover 与目录预热用)。
 *
 * Cover Art Archive 的每张封面都要 307 到随机的 archive.org 节点,单张中位 1.5–2s。
 * 一屏几十张直连时,浏览器还得为每个节点单独做 DNS + TLS,并撞上同域 6 连接上限。
 * 这里把字节缓在进程内存里:同一张只回源一次,并发请求合并成一个 in-flight。
 *
 * MusicBrainz 补充条目常常只有一个猜的 CAA 地址,实际 404。URL miss 之后
 * 再用艺人+专辑名去 iTunes / Deezer / 网易云兜底,命中后挂到原 URL 键上。
 */

import { coverLookupKey, lookupCoverUrls } from "./cover-lookup";
import { coverProxyAllows } from "./links";

const MAX_ENTRY_BYTES = 3_000_000;
const MAX_TOTAL_BYTES = 96_000_000;
export const MISS_TTL_MS = 60 * 60 * 12 * 1000;
const SOFT_MISS_TTL_MS = 2 * 60 * 1000;
const LOOKUP_MISS_TTL_MS = 30 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 15_000;
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
/**
 * 上游并发:再高 archive.org 单条延迟会明显变差,再低一屏封面填不满。
 * 后台预热单独占一小份额度,免得预热队列把用户正在看的那几张挤到后面。
 */
const LIMIT = { demand: 12, warm: 4 } as const;

export type CoverHit = { body: ArrayBuffer; type: string; etag: string };

const hits = new Map<string, CoverHit>();
const misses = new Map<string, number>();
const inflight = new Map<string, Promise<CoverHit | null>>();
let cachedBytes = 0;

function remember(key: string, hit: CoverHit) {
  if (hit.body.byteLength > MAX_ENTRY_BYTES || hits.has(key)) return;
  hits.set(key, hit);
  cachedBytes += hit.body.byteLength;
  while (cachedBytes > MAX_TOTAL_BYTES) {
    const oldest = hits.keys().next();
    if (oldest.done || oldest.value === key) break;
    const dropped = hits.get(oldest.value);
    hits.delete(oldest.value);
    if (dropped) cachedBytes -= dropped.body.byteLength;
  }
}

function rememberMiss(key: string, ttl = MISS_TTL_MS) {
  misses.set(key, Date.now() + ttl);
}

/** 命中后挪到队尾,常看的封面不会被新条目挤掉。 */
export function peekCover(key: string): CoverHit | undefined {
  const hit = hits.get(key);
  if (!hit) return undefined;
  hits.delete(key);
  hits.set(key, hit);
  return hit;
}

export function missedRecently(key: string): boolean {
  const until = misses.get(key);
  if (until == null) return false;
  if (Date.now() >= until) {
    misses.delete(key);
    return false;
  }
  return true;
}

type Lane = keyof typeof LIMIT;
const lanes: Record<Lane, { active: number; waiting: (() => void)[] }> = {
  demand: { active: 0, waiting: [] },
  warm: { active: 0, waiting: [] },
};

async function withSlot<T>(lane: Lane, job: () => Promise<T>): Promise<T> {
  const q = lanes[lane];
  if (q.active >= LIMIT[lane]) await new Promise<void>((r) => q.waiting.push(r));
  q.active++;
  try {
    return await job();
  } finally {
    q.active--;
    q.waiting.shift()?.();
  }
}

/** 上游地址白名单校验;返回规范化后的地址,不合规则返回 null。 */
export function coverTarget(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(String(raw).replace(/^http:\/\//i, "https://"));
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!coverProxyAllows(url.hostname)) return null;
  return url.toString();
}

function upstreamHeaders(target: string): HeadersInit {
  if (/music\.126\.net|music\.163\.com/i.test(target)) {
    return {
      Accept: "image/*",
      "User-Agent": BROWSER_UA,
      Referer: "https://music.163.com/",
    };
  }
  return { Accept: "image/*", "User-Agent": "VprGrid.SYS/1.0 (weekly album radar)" };
}

async function load(target: string, lane: Lane): Promise<CoverHit | null> {
  const res = await withSlot(lane, () =>
    fetch(target, {
      redirect: "follow",
      headers: upstreamHeaders(target),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    }),
  );
  if (!res.ok) return null;
  const type = res.headers.get("content-type") ?? "image/jpeg";
  if (!type.startsWith("image/")) return null;
  const body = await res.arrayBuffer();
  if (!body.byteLength) return null;
  return { body, type, etag: `W/"${body.byteLength.toString(36)}-${target.length.toString(36)}"` };
}

/** 取一张封面:命中内存直接返回,否则回源并缓存;并发同一地址只回源一次。 */
export function fetchCover(target: string, lane: Lane = "demand"): Promise<CoverHit | null> {
  const cached = peekCover(target);
  if (cached) return Promise.resolve(cached);
  const running = inflight.get(target);
  if (running) return running;
  const job = load(target, lane)
    .then((hit) => {
      if (hit) remember(target, hit);
      else rememberMiss(target);
      return hit;
    })
    .catch(() => {
      rememberMiss(target, SOFT_MISS_TTL_MS);
      return null;
    })
    .finally(() => inflight.delete(target));
  inflight.set(target, job);
  return job;
}

async function loadLooked(
  artist: string,
  title: string,
  large: boolean,
  lane: Lane,
): Promise<CoverHit | null> {
  const looked = await lookupCoverUrls(artist, title);
  if (!looked) return null;
  const target = coverTarget(large ? looked.lg : looked.sm) ?? coverTarget(looked.sm);
  if (!target) return null;
  return fetchCover(target, lane);
}

export type CoverRequest = {
  target: string | null;
  artist?: string | null;
  title?: string | null;
  large?: boolean;
};

/**
 * 先回源给定地址;404 / 超时后再按艺人+专辑名检索。
 * 检索命中会同时挂到原 URL 键上,下次同一张 CAA 空链直接出图。
 */
export async function fetchCoverResolved(req: CoverRequest, lane: Lane = "demand"): Promise<CoverHit | null> {
  const artist = req.artist?.trim() ?? "";
  const title = req.title?.trim() ?? "";
  const lookupKey = artist && title ? coverLookupKey(artist, title) : null;

  if (req.target) {
    const cached = peekCover(req.target);
    if (cached) return cached;
  }
  if (lookupKey) {
    const cached = peekCover(lookupKey);
    if (cached) {
      if (req.target) remember(req.target, cached);
      return cached;
    }
  }

  if (req.target && !missedRecently(req.target)) {
    const hit = await fetchCover(req.target, lane);
    if (hit) {
      if (lookupKey) remember(lookupKey, hit);
      return hit;
    }
  }

  if (!lookupKey || missedRecently(lookupKey)) return null;

  try {
    const hit = await loadLooked(artist, title, Boolean(req.large), lane);
    if (hit) {
      remember(lookupKey, hit);
      if (req.target) remember(req.target, hit);
      return hit;
    }
    rememberMiss(lookupKey, LOOKUP_MISS_TTL_MS);
    return null;
  } catch {
    rememberMiss(lookupKey, SOFT_MISS_TTL_MS);
    return null;
  }
}

export type WarmCover = string | null | undefined | { url?: string | null; artist?: string; title?: string };

/**
 * 目录算完就后台把封面拉进缓存(不 await),浏览器随后请求时多半已经命中或能并到
 * 同一个 in-flight 上。只预热还没缓存过的地址,失败无所谓。
 */
export function warmCovers(items: WarmCover[], cap = 120): void {
  let n = 0;
  for (const raw of items) {
    if (n >= cap) break;
    const url = typeof raw === "string" || raw == null ? raw : raw.url;
    const artist = typeof raw === "object" && raw ? raw.artist : undefined;
    const title = typeof raw === "object" && raw ? raw.title : undefined;
    const target = coverTarget(url);
    if (target && (hits.has(target) || inflight.has(target))) continue;
    if (!target && !(artist && title)) continue;
    n++;
    void fetchCoverResolved({ target, artist, title }, "warm");
  }
}
