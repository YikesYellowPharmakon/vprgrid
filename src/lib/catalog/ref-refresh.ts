/**
 * RYM / AOTY 参考源刷新:先试服务器直抓,失败则排队给浏览器插件在真实会话里拉。
 */
import { importWebList } from "./import-sources";
import {
  itemsToEntries,
  mergeGoldEntries,
  normalizeRefUrl,
  type ImportItem,
  type RefSource,
} from "./sources";

export async function enqueueRefJobs(jobs: Array<{ url: string; kind: "rym" | "aoty" }>): Promise<void> {
  if (jobs.length === 0) return;
  try {
    await fetch("/api/ref-bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enqueue", jobs }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // 插件稍后还会自己轮询;失败不打断界面
  }
}

export async function pullRefResults(): Promise<Array<{ url: string; kind: "rym" | "aoty"; items: ImportItem[] }>> {
  try {
    const res = await fetch("/api/ref-bridge", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ url: string; kind: string; items?: ImportItem[] }>;
    };
    return (data.results ?? []).filter((r): r is { url: string; kind: "rym" | "aoty"; items: ImportItem[] } => {
      return r.kind === "rym" || r.kind === "aoty";
    });
  } catch {
    return [];
  }
}

export async function ackRefResults(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    await fetch("/api/ref-bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ack", urls }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // 下次轮询还会再合并一次,去重后无害
  }
}

export function mergeSourceFromItems(src: RefSource, items: ImportItem[]): { entries: ReturnType<typeof itemsToEntries>; added: number } {
  const incoming = itemsToEntries(`${src.kind}:${src.url ?? src.id}`, items);
  return mergeGoldEntries(src.entries, incoming);
}

/** 尝试直抓;被拦则排队给插件。空结果不当成功,避免冲掉旧清单。 */
export async function refreshLinkedSource(
  src: RefSource,
): Promise<{ mode: "server"; items: ImportItem[] } | { mode: "queued" } | { mode: "fail"; error: string }> {
  if ((src.kind !== "rym" && src.kind !== "aoty") || !src.url) {
    return { mode: "fail", error: "这个源没有可刷新的链接" };
  }
  try {
    const res = await importWebList({ data: { url: src.url } });
    if (res.ok && res.items.length > 0) return { mode: "server", items: res.items };
  } catch {
    // 直抓失败走插件
  }
  await enqueueRefJobs([{ url: src.url, kind: src.kind }]);
  return { mode: "queued" };
}

export function sourceMatchesUrl(src: RefSource, url: string): boolean {
  return Boolean(src.url && normalizeRefUrl(src.url) === normalizeRefUrl(url));
}
