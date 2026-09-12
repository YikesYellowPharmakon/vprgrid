/**
 * 服务端封面缓存(只给 /api/cover 与目录预热用)。
 *
 * Cover Art Archive 的每张封面都要 307 到随机的 archive.org 节点,单张中位 1.5–2s。
 * 一屏几十张直连时,浏览器还得为每个节点单独做 DNS + TLS,并撞上同域 6 连接上限。
 * 这里把字节缓在进程内存里:同一张只回源一次,并发请求合并成一个 in-flight。
 */

import { coverProxyAllows } from "./links";

const MAX_ENTRY_BYTES = 3_000_000;
const MAX_TOTAL_BYTES = 96_000_000;
export const MISS_TTL_MS = 60 * 60 * 12 * 1000;
const UPSTREAM_TIMEOUT_MS = 15_000;
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

/** 命中后挪到队尾,常看的封面不会被新条目挤掉。 */
export function peekCover(key: string): CoverHit | undefined {
  const hit = hits.get(key);
  if (!hit) return undefined;
  hits.delete(key);
  hits.set(key, hit);
  return hit;
}

export function missedRecently(key: string): boolean {
  const at = misses.get(key);
  return at != null && Date.now() - at < MISS_TTL_MS;
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
    url = new URL(String(raw));
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!coverProxyAllows(url.hostname)) return null;
  return url.toString();
}

async function load(target: string, lane: Lane): Promise<CoverHit | null> {
  const res = await withSlot(lane, () =>
    fetch(target, {
      redirect: "follow",
      headers: { "User-Agent": "VprGrid.SYS/1.0 (weekly album radar)", Accept: "image/*" },
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
      else misses.set(target, Date.now());
      return hit;
    })
    .catch(() => {
      misses.set(target, Date.now());
      return null;
    })
    .finally(() => inflight.delete(target));
  inflight.set(target, job);
  return job;
}

/**
 * 目录算完就后台把封面拉进缓存(不 await),浏览器随后请求时多半已经命中或能并到
 * 同一个 in-flight 上。只预热还没缓存过的地址,失败无所谓。
 */
export function warmCovers(urls: (string | null | undefined)[], cap = 120): void {
  let n = 0;
  for (const raw of urls) {
    if (n >= cap) break;
    const target = coverTarget(raw);
    if (!target || hits.has(target) || inflight.has(target) || missedRecently(target)) continue;
    n++;
    void fetchCover(target, "warm");
  }
}
