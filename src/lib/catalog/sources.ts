/**
 * 参考订阅源:参考标准从「单一歌单」升级为「多源订阅」。
 * 每个源(内置/网易云/Apple/Bandcamp/RYM/AOTY/RSS/艺人追踪/粘贴/手动)可单独开关、同步、删除;
 * 所有开启的源合并去重后形成参考池,品味推断与艺人加权基于合并池。
 * 本文件只含客户端安全的纯函数(类型、合并、粘贴解析、导入桥编解码)。
 */
import { DEFAULT_REF_ENTRIES, normalizeKey, syntheticId, type GoldEntry } from "./gold";
import { inferEntryDate, neutralizeGuessedDates } from "./release-date";

export type RefSourceKind =
  | "builtin"
  | "netease"
  | "apple"
  | "bandcamp"
  | "rym"
  | "aoty"
  | "rss"
  | "artist"
  | "paste"
  | "manual";

export type RefSource = {
  id: string;
  kind: RefSourceKind;
  label: string;
  /** 原始链接 / feed 地址 / 艺人名。 */
  url?: string;
  /** 参考类型说明,如「2026 年评分」「艺人追踪」「RSS 订阅」。 */
  detail?: string;
  enabled: boolean;
  /** 打开应用时自动重新拉取(内置网易云歌单 / 网易云 / Apple / RSS / 艺人源)。 */
  autoSync: boolean;
  /** builtin 未同步前用打包清单;同步后落盘,打开时再从网易云并入新专。 */
  entries: GoldEntry[];
  /** 用户从该源移出的专辑键 artist||title;自动刷新也不会加回。 */
  excluded?: string[];
  lastSync?: string;
};

export function entryKey(e: Pick<GoldEntry, "artist" | "title">): string {
  return `${normalizeKey(e.artist)}||${normalizeKey(e.title)}`;
}

export const BUILTIN_SOURCE_ID = "builtin";
/** 内置参考对应的网易云歌单:同步/自动刷新都拉这一份。 */
export const BUILTIN_PLAYLIST_ID = "17965976957";
export const BUILTIN_PLAYLIST_URL = `https://music.163.com/#/playlist?id=${BUILTIN_PLAYLIST_ID}`;

export function makeBuiltinSource(enabled = true): RefSource {
  return {
    id: BUILTIN_SOURCE_ID,
    kind: "builtin",
    label: "内置默认参考",
    detail: "364 张亲选 · 一专一代表曲",
    url: BUILTIN_PLAYLIST_URL,
    enabled,
    autoSync: true,
    entries: [],
  };
}

/** 给旧存档补上内置歌单链接,并默认打开自动刷新。 */
export function ensureBuiltinPlaylist(src: RefSource): RefSource {
  if (src.kind !== "builtin") return src;
  const url = src.url || BUILTIN_PLAYLIST_URL;
  const autoSync = src.url ? src.autoSync : true;
  if (src.url === url && src.autoSync === autoSync) return src;
  return { ...src, url, autoSync };
}

/** 把网易云歌单并进内置源:旧清单保留,只追加新专。 */
export function applyPlaylistToBuiltin(src: RefSource, incoming: GoldEntry[]): { entries: GoldEntry[]; added: number } {
  const prev = src.entries.length ? src.entries : DEFAULT_REF_ENTRIES;
  return mergeGoldEntries(prev, incoming);
}

export const KIND_LABEL: Record<RefSourceKind, string> = {
  builtin: "内置",
  netease: "网易云歌单",
  apple: "Apple Music 歌单",
  bandcamp: "Bandcamp",
  rym: "RYM",
  aoty: "AOTY",
  rss: "RSS 订阅",
  artist: "艺人追踪",
  paste: "粘贴导入",
  manual: "手动亲选",
};

/** 旧存档把 Apple 链当 RSS:升成正式源并打开时自动刷新。 */
export function ensureAppleSource(src: RefSource): RefSource {
  const url = src.url ?? "";
  if (!/music\.apple\.com|itunes\.apple\.com/i.test(url)) return src;
  if (src.kind === "apple") return src;
  if (src.kind !== "rss") return src;
  return {
    ...src,
    kind: "apple",
    autoSync: true,
    detail: src.detail && !/\brss\b/i.test(src.detail) ? src.detail : "Apple Music 歌单",
  };
}

/** 旧存档把 Bandcamp 链当 RSS:升成正式源。 */
export function ensureBandcampSource(src: RefSource): RefSource {
  const url = src.url ?? "";
  if (!/bandcamp\.com/i.test(url)) return src;
  if (src.kind === "bandcamp") return src;
  if (src.kind !== "rss") return src;
  return {
    ...src,
    kind: "bandcamp",
    autoSync: true,
    detail: src.detail && !/\brss\b/i.test(src.detail) ? src.detail : "Bandcamp",
  };
}

export function sourceEntries(s: RefSource): GoldEntry[] {
  const raw =
    s.kind === "builtin"
      ? s.entries.length
        ? neutralizeGuessedDates(s.entries)
        : DEFAULT_REF_ENTRIES
      : neutralizeGuessedDates(s.entries);
  if (!s.excluded?.length) return raw;
  const drop = new Set(s.excluded);
  return raw.filter((e) => !drop.has(entryKey(e)));
}

/** 合并所有开启的源(保持源顺序,按 artist||title 去重,先到先得)。 */
export function mergeSourceEntries(sources: RefSource[]): GoldEntry[] {
  const seen = new Set<string>();
  const out: GoldEntry[] = [];
  for (const s of sources) {
    if (!s.enabled) continue;
    for (const e of sourceEntries(s)) {
      const k = entryKey(e);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
  }
  return out;
}

export function newSourceId(kind: RefSourceKind): string {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 去掉刷新参数与末尾斜杠,用来对上「同一条用户页」。保留路径里的年份/筛选段。 */
export function normalizeRefUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.searchParams.delete("vprrefresh");
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.host}${path}`.toLowerCase();
  } catch {
    return url.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

/** 刷新合并:旧清单全部保留,只追加新专辑;旧条目缺精确日期时用新的补上。 */
export function mergeGoldEntries(prev: GoldEntry[], incoming: GoldEntry[]): { entries: GoldEntry[]; added: number } {
  const map = new Map<string, GoldEntry>();
  for (const e of prev) map.set(`${normalizeKey(e.artist)}||${normalizeKey(e.title)}`, e);
  let added = 0;
  for (const e of incoming) {
    const k = `${normalizeKey(e.artist)}||${normalizeKey(e.title)}`;
    const old = map.get(k);
    if (!old) {
      map.set(k, e);
      added += 1;
      continue;
    }
    if (old.dateApprox && !e.dateApprox) {
      map.set(k, { ...old, date: e.date, dateApprox: e.dateApprox, pic: e.pic || old.pic });
    }
  }
  return { entries: [...map.values()], added };
}

/* ————————————— 导入桥:插件 / 外部把条目递给应用(URL hash) ————————————— */

export type ImportItem = {
  artist: string;
  title: string;
  /** ISO 日期或年份;缺省标为日期未知,不进当周墙。 */
  date?: string;
  pic?: string | null;
};

export type ImportPayload = {
  kind: "rym" | "aoty" | "paste";
  label: string;
  detail?: string;
  url?: string;
  items: ImportItem[];
};

/** 宽松日期:YYYY / YYYY-MM / YYYY-MM-DD / YYYY/MM/DD / YYYYMMDD → ISO,失败返回 null。 */
export function looseDate(input?: string | null): { date: string; approx: boolean } | null {
  const s = String(input ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const d = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return Number.isNaN(Date.parse(d)) ? null : { date: d, approx: false };
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const d = `${m[1]}-${m[2]}-${m[3]}`;
    return Number.isNaN(Date.parse(d)) ? null : { date: d, approx: false };
  }
  m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) return { date: `${m[1]}-${m[2].padStart(2, "0")}-15`, approx: true };
  m = s.match(/^(\d{4})$/);
  if (m) return { date: `${m[1]}-07-01`, approx: true };
  return null;
}

export function itemsToEntries(kind: string, items: ImportItem[]): GoldEntry[] {
  const out: GoldEntry[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const artist = it.artist.trim();
    const title = it.title.trim();
    if (!artist || !title) continue;
    const k = `${normalizeKey(artist)}||${normalizeKey(title)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const d = looseDate(it.date);
    const guessed = d
      ? { date: d.date, dateApprox: d.approx, dateUnknown: false }
      : inferEntryDate(title);
    const entry: GoldEntry = {
      albumId: syntheticId(`${kind}:${k}`),
      title,
      artist,
      date: guessed.date,
      songId: 0,
      song: "",
      pic: it.pic ?? null,
    };
    if (guessed.dateApprox) entry.dateApprox = true;
    if (guessed.dateUnknown) entry.dateUnknown = true;
    out.push(entry);
  }
  return out;
}

export function decodeImportPayload(b64url: string): ImportPayload | null {
  try {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as ImportPayload;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return {
      kind: parsed.kind === "rym" || parsed.kind === "aoty" ? parsed.kind : "paste",
      label: String(parsed.label || "外部导入").slice(0, 80),
      detail: parsed.detail ? String(parsed.detail).slice(0, 80) : undefined,
      url: parsed.url ? String(parsed.url).slice(0, 400) : undefined,
      items: parsed.items
        .filter((x) => x && typeof x.artist === "string" && typeof x.title === "string")
        .slice(0, 12000),
    };
  } catch {
    return null;
  }
}

/* ————————————— 粘贴导入解析(RYM 导出 CSV / 通用行) ————————————— */

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * 解析粘贴文本 → 条目。支持:
 * 1. RYM 官方导出 CSV(音乐库导出,含 Title / First Name / Last Name / Release_Date);
 * 2. 通用 CSV(含 artist,title[,date] 表头);
 * 3. 逐行文本:「艺人 - 专辑 (2026)」「艺人 – 专辑」等,分隔符 - – — |。
 */
export function parsePastedRef(text: string): { items: ImportItem[]; format: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { items: [], format: "empty" };

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));

  // RYM 导出 CSV
  const iTitle = col(["title", "rym album", "album"]);
  const iFirst = col(["first name", "first_name"]);
  const iLast = col(["last name", "last_name"]);
  const iArtist = col(["artist", "artist name", "artist_name"]);
  const iDate = col(["release_date", "release date", "date", "year"]);
  if (iTitle >= 0 && (iArtist >= 0 || iFirst >= 0 || iLast >= 0)) {
    const items: ImportItem[] = [];
    for (const line of lines.slice(1)) {
      const cells = parseCsvLine(line);
      const title = (cells[iTitle] ?? "").trim();
      const artist =
        iArtist >= 0
          ? (cells[iArtist] ?? "").trim()
          : [cells[iFirst] ?? "", cells[iLast] ?? ""].map((s) => s.trim()).filter(Boolean).join(" ");
      if (!title || !artist) continue;
      items.push({ artist, title, date: iDate >= 0 ? (cells[iDate] ?? "").trim() : undefined });
    }
    if (items.length) return { items, format: iFirst >= 0 ? "rym-csv" : "csv" };
  }

  // 逐行「艺人 - 专辑 (年份)」
  const items: ImportItem[] = [];
  const LINE = /^(.{1,120}?)\s+[-–—|]\s+(.{1,200}?)(?:\s*[([](\d{4})[)\]])?\s*$/;
  for (const line of lines) {
    const m = line.match(LINE);
    if (!m) continue;
    items.push({ artist: m[1].trim(), title: m[2].trim(), date: m[3] });
  }
  return { items, format: "lines" };
}

/* ————————————— URL 类型识别 ————————————— */

export type DetectedKind =
  | "netease"
  | "rym"
  | "aoty"
  | "rss"
  | "apple"
  | "bandcamp"
  | "spotify"
  | "unsupported"
  | "unknown";

export function detectSourceKind(url: string): DetectedKind {
  const u = url.trim().toLowerCase();
  if (/music\.163\.com|^\d{5,}$/.test(u)) return "netease";
  if (u.includes("rateyourmusic.com")) return "rym";
  if (u.includes("albumoftheyear.org")) return "aoty";
  if (u.includes("music.apple.com") || u.includes("itunes.apple.com")) return "apple";
  if (u.includes("bandcamp.com")) return "bandcamp";
  if (u.includes("spotify.com") || u.includes("spotify.link")) return "spotify";
  if (
    u.includes("tidal.com") ||
    u.includes("listen.tidal.com") ||
    u.includes("qobuz.com") ||
    u.includes("soundcloud.com") ||
    u.includes("on.soundcloud.com")
  ) {
    return "unsupported";
  }
  if (/\.(xml|rss|atom)(\?|$)|\/(rss|feed|atom)\b/.test(u)) return "rss";
  if (/^https?:\/\//.test(u)) return "rss"; // 未知链接按 RSS 尝试
  return "unknown";
}

/** 从 RYM 链接推断源标签(用户名/榜单/列表),RYM 无法直抓时由粘贴路径复用。 */
export function rymLabelFromUrl(url: string): string {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean);
    const ci = seg.indexOf("collection");
    if (ci >= 0 && seg[ci + 1]) return `RYM · ${decodeURIComponent(seg[ci + 1])}`;
    const tilde = seg.find((s) => s.startsWith("~"));
    if (tilde) return `RYM · ${decodeURIComponent(tilde.slice(1))}`;
    if (seg[0] === "charts") return "RYM · Chart";
    if (seg[0] === "list" && seg[1]) return `RYM 列表 · ${decodeURIComponent(seg[1])}`;
    return "RYM 列表";
  } catch {
    return "RYM 列表";
  }
}

/** 从 RYM 链接推断参考类型说明(年份评分 / 总评分 / 新发行追踪等)。 */
export function describeRymUrl(url: string): string {
  const m = url.match(/rateyourmusic\.com\/collection\/([^/]+)/i);
  const user = m ? m[1] : "";
  const year = url.match(/\/(\d{4})(?:\/|$)/)?.[1];
  const byRelYear = /relyear/i.test(url);
  if (year && byRelYear) return `${user} · ${year} 年发行评分`;
  if (year) return `${user} · ${year} 年`;
  if (byRelYear) return `${user} · 按发行年排列`;
  if (/\/wishlist|\bwish\b/i.test(url)) return `${user} · 愿望单(新发行追踪)`;
  return user ? `${user} · 总评分` : "RYM 收藏";
}

export function describeAotyUrl(url: string): string {
  const m = url.match(/albumoftheyear\.org\/user\/([^/]+)/i);
  const user = m ? m[1] : "";
  if (/\/ratings/i.test(url)) return `${user} · 评分记录`;
  if (/\/wanted|\/want/i.test(url)) return `${user} · 想听(新发行追踪)`;
  if (/\/albums/i.test(url)) return `${user} · 专辑库`;
  return user ? `${user} · AOTY` : "AOTY 列表";
}
