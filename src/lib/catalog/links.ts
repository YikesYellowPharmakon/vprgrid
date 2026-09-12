export function searchLinks(artist: string, title: string) {
  const q = encodeURIComponent(`${artist} ${title}`.trim());
  return {
    musicbrainz: `https://musicbrainz.org/search?query=${q}&type=release_group&method=indexed`,
    discogs: `https://www.discogs.com/search/?q=${q}&type=release`,
    bandcamp: `https://bandcamp.com/search?q=${q}`,
    aoty: `https://www.albumoftheyear.org/search/?q=${q}`,
    rym: `https://rateyourmusic.com/search?searchterm=${q}&searchtype=l`,
  };
}

/** Cover Art Archive 会 307 到随机 archive.org 节点,慢且拖满连接数——默认就换成同源代理。 */
const SLOW_HOSTS = /^(coverartarchive\.org|([\w-]+\.)*archive\.org)$/i;

/**
 * /api/cover 允许代理的图源(服务端白名单以此为准)。
 * 除了慢的那两个,其余是 CDN、平时直连更快;只有画布导出(专辑墙 PNG)需要把它们
 * 也拉成同源图片,否则 canvas 会被跨域污染,导不出图。
 */
export const COVER_PROXY_HOSTS = [
  SLOW_HOSTS,
  /^([\w-]+\.)?bcbits\.com$/i,
  /^([\w-]+\.)?music\.126\.net$/i,
  /^([\w-]+\.)?albumoftheyear\.org$/i,
  /^upload\.wikimedia\.org$/i,
  /^([\w-]+\.)*(lastfm|last\.fm)\.[\w.]+$/i,
  /^lastfm\.freetls\.fastly\.net$/i,
];

export function coverProxyAllows(hostname: string): boolean {
  return COVER_PROXY_HOSTS.some((re) => re.test(hostname));
}

/** `force` 让所有白名单图源都走代理(同源图片才能画进画布)。 */
export function proxiedCover(url: string | null | undefined, opts?: { force?: boolean }): string | null {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw || raw.startsWith("/") || raw.startsWith("data:")) return raw || null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return raw;
    const wanted = opts?.force ? coverProxyAllows(parsed.hostname) : SLOW_HOSTS.test(parsed.hostname);
    if (!wanted) return raw;
    return `/api/cover?u=${encodeURIComponent(parsed.toString())}`;
  } catch {
    return raw;
  }
}

export function coverUrls(releaseMbid: string | null, groupMbid: string): {
  sm: string | null;
  lg: string | null;
} {
  if (releaseMbid) {
    return {
      sm: `https://coverartarchive.org/release/${releaseMbid}/front-250`,
      lg: `https://coverartarchive.org/release/${releaseMbid}/front-500`,
    };
  }
  if (groupMbid) {
    return {
      sm: `https://coverartarchive.org/release-group/${groupMbid}/front-250`,
      lg: `https://coverartarchive.org/release-group/${groupMbid}/front-500`,
    };
  }
  return { sm: null, lg: null };
}
