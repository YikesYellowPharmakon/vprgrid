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

/** 这些图源直连容易失败或拖垮连接:CAA 307、网易云热链、AOTY 墙。默认走同源代理。 */
const ALWAYS_PROXY = /^(coverartarchive\.org|([\w-]+\.)*archive\.org|([\w-]+\.)?music\.126\.net|([\w-]+\.)?albumoftheyear\.org)$/i;

/**
 * /api/cover 允许代理的图源(服务端白名单以此为准)。
 * 除了 ALWAYS_PROXY,其余 CDN 平时可直连;画布导出(专辑墙 PNG)或封面兜底检索
 * 命中后也会走代理,否则 canvas 会被跨域污染,导不出图。
 */
export const COVER_PROXY_HOSTS = [
  ALWAYS_PROXY,
  /^([\w-]+\.)?bcbits\.com$/i,
  /^([\w-]+\.)*mzstatic\.com$/i,
  /^([\w-]+\.)*dzcdn\.net$/i,
  /^e-cdns-images\.dzcdn\.net$/i,
  /^i\.discogs\.com$/i,
  /^img\.discogs\.com$/i,
  /^upload\.wikimedia\.org$/i,
  /^([\w-]+\.)*(lastfm|last\.fm)\.[\w.]+$/i,
  /^lastfm\.freetls\.fastly\.net$/i,
];

export function coverProxyAllows(hostname: string): boolean {
  return COVER_PROXY_HOSTS.some((re) => re.test(hostname));
}

export type ProxiedCoverOpts = { force?: boolean; artist?: string; title?: string; large?: boolean };

function coverQuery(opts?: ProxiedCoverOpts): string {
  const q = new URLSearchParams();
  if (opts?.artist?.trim()) q.set("artist", opts.artist.trim());
  if (opts?.title?.trim()) q.set("title", opts.title.trim());
  if (opts?.large) q.set("lg", "1");
  const s = q.toString();
  return s ? `&${s}` : "";
}

/** `force` 让所有白名单图源都走代理(同源图片才能画进画布)。 */
export function proxiedCover(url: string | null | undefined, opts?: ProxiedCoverOpts): string | null {
  const extra = coverQuery(opts);
  if (!url) {
    return extra ? `/api/cover?${extra.slice(1)}` : null;
  }
  const raw = String(url).trim();
  if (!raw || raw.startsWith("/") || raw.startsWith("data:")) return raw || null;
  try {
    const parsed = new URL(raw.startsWith("http://") ? `https://${raw.slice(7)}` : raw);
    if (parsed.protocol !== "https:") return raw;
    const wanted = opts?.force ? coverProxyAllows(parsed.hostname) : ALWAYS_PROXY.test(parsed.hostname);
    if (!wanted) return raw;
    return `/api/cover?u=${encodeURIComponent(parsed.toString())}${extra}`;
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
