/**
 * 进程内最新同步负载(仅服务端路由读写)。
 * 应用 POST /api/sync 写入,插件 GET /api/sync 与 /api/radar 共用这份,
 * 避免雷达接口再各算一套过滤。
 */
let latest: { code: string; at: string } | null = null;

export function setLatestSyncCode(code: string): void {
  latest = { code, at: new Date().toISOString() };
}

export function getLatestSyncRaw(): { code: string; at: string } | null {
  return latest;
}

export function getLatestSyncPayload(): Record<string, unknown> | null {
  if (!latest) return null;
  try {
    const parsed = JSON.parse(latest.code) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
