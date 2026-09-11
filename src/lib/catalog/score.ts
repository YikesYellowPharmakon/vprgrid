import { genreById, tasteOverlap, type GenreDef } from "./genres";
import type { CatalogAlbum, ScoreBreakdown, ScoreWeights, ScoredAlbum } from "./types";

export const DEFAULT_WEIGHTS: ScoreWeights = {
  taste: 40,
  artist: 25,
  rating: 20,
  cover: 15,
};

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

export function normalizeWeights(w: ScoreWeights): ScoreWeights {
  const sum = w.taste + w.artist + w.rating + w.cover;
  if (sum <= 0) return DEFAULT_WEIGHTS;
  return {
    taste: w.taste / sum,
    artist: w.artist / sum,
    rating: w.rating / sum,
    cover: w.cover / sum,
  };
}

/**
 * 口味分 = 发行级风格命中(全权重)+ 艺人级风格命中(0.7 折权重)。
 * 很多高质量新发行的发行页还没人打标签,但艺人本身有清晰的风格画像——
 * 艺人维度兜底能把这类专辑捞回口味匹配,而不是一律沉底。
 */
function tasteScore(
  album: CatalogAlbum,
  taste: string[],
): { score: number; hits: string[]; artistHits: string[] } {
  if (taste.length === 0) return { score: 40, hits: [], artistHits: [] };
  const hits = tasteOverlap(album.inferredGenres, taste);
  const hitSet = new Set(hits);
  const artistHits = tasteOverlap(album.artistGenres ?? [], taste).filter((g) => !hitSet.has(g));
  if (hits.length === 0 && artistHits.length === 0) return { score: 10, hits: [], artistHits: [] };
  const density = (hits.length + artistHits.length * 0.7) / Math.max(1, Math.min(taste.length, 6));
  // 纯靠艺人风格命中时起点略低:它是间接证据,不该和发行本身贴口味平起平坐
  const base = hits.length > 0 ? 38 : 31;
  return {
    score: clamp(base + density * 62 + (hits.length + artistHits.length > 1 ? 8 : 0)),
    hits,
    artistHits,
  };
}

function ratingScore(album: CatalogAlbum): number {
  let s = 16;
  const votes = sampleSize(album);
  if (votes > 0) {
    s += Math.min(50, Math.log10(votes + 1) * 22);
  }
  if (album.tags.length > 0) s += 14;
  if (album.hasCover) s += 10;
  if (album.inferredGenres.length > 0) s += 12;
  else if ((album.artistGenres?.length ?? 0) > 0) s += 6;
  if (album.secondaryType?.toLowerCase().includes("field recording")) s += 16;
  if (album.type === "Album") s += 6;
  if (album.ratingValue != null) {
    s = Math.max(s, clamp(album.ratingValue * 20));
  }
  // Thin samples cannot look like a confident high score.
  if (votes > 0 && votes < 5) s = Math.min(s, 52);
  // 零关注(没人听、没人评):标签/封面等元数据齐全也撑不起中高分——
  // 这类「谁都没期待」的发行评分维度封顶在低位,只能靠口味/艺人分量翻身
  if (votes === 0 && album.ratingValue == null) s = Math.min(s, 36);
  return clamp(s);
}

function coverScore(album: CatalogAlbum, sleeveScore?: number): number {
  if (typeof sleeveScore === "number") return clamp(sleeveScore);
  if (album.hasCover) return 62;
  return 18;
}

function sampleSize(album: CatalogAlbum): number {
  return Math.max(album.ratingVotes, album.listenCount);
}

const THIN_VOTE_MAX = 4;
const HIGH_RATING = 3.5;
const HIGH_DERIVED = 55;
const ROUGH_SLEEVE = 45;

export function isThinHighRating(album: CatalogAlbum, derivedRating: number): boolean {
  const votes = sampleSize(album);
  if (votes < 1 || votes > THIN_VOTE_MAX) return false;
  if (album.ratingValue != null && album.ratingValue >= HIGH_RATING) return true;
  return derivedRating >= HIGH_DERIVED;
}

/**
 * 「拥挤风格」:日更产量极大的门类(ambient 系 / new age / drone)。
 * 这些风格里零关注的发行 99% 是背景音流水线——单纯命中口味标签
 * 不足以构成推荐理由,必须另有关注信号(有人听 / 有人评 / 艺人有分量)。
 */
const CROWDED_GENRES = new Set(["ambient", "dark-ambient", "drone", "new-age", "deep-listening", "ambient-techno"]);

function isCrowdedNiche(album: CatalogAlbum): boolean {
  const gs = [...album.inferredGenres, ...(album.artistGenres ?? [])];
  if (gs.length === 0) return false;
  const outside = gs.filter((g) => !CROWDED_GENRES.has(g));
  // 全部(或仅剩一个例外)落在拥挤风格里 → 视为拥挤生态位
  return outside.length === 0 || (gs.length >= 3 && outside.length <= 1);
}

/** 期待信号:有人听过 / 有评分 / 艺人本身有分量。三者全无 = 谁都没在等这张。 */
export function hasAnticipation(album: CatalogAlbum): boolean {
  return sampleSize(album) >= 3 || album.ratingValue != null || album.artistStature >= 50;
}

const JUNK =
  /\b(432\s*hz|528\s*hz|\d{3}\s*hz frequency|binaural|healing frequenc(y|ies)|sleep music|deep sleep|baby sleep|lullab(y|ies) for|spa music|rain sounds|ocean waves|nature sounds|chakra|solfeggio|white noise|brown noise|pink noise|meditation music|guided meditation|yoga music|study music|relaxing music|music for stress|asmr|8d audio|sound bath|singing bowls?|subliminal|reiki|hypnosis|karaoke version|tribute to|workout mix|lofi beats to)\b/i;

export function isJunkRelease(album: CatalogAlbum): boolean {
  const blob = `${album.title} ${album.artist} ${album.tags.join(" ")}`;
  return JUNK.test(blob);
}

/**
 * 高产流水线（低区分度、超高发行量）判定 —— 规则化，不写死艺人名：
 * 1) 同一艺人在展示期终点往回约 21 天内有 3 张以上专辑/EP：日更式产量；
 * 2) 窗口内 2 张以上，且标题呈序列化模式（日期戳 / 长编号结尾），
 *    典型如每日氛围流水线的「Still Air 0010」「2026.08.14」式命名。
 * 参考池条目（album.gold）永远豁免，不会被这条误杀。
 */
const SERIAL_TITLE =
  /(\d{4}\s?[.\-/年]\s?\d{1,2}\s?[.\-/月]\s?\d{1,2})|([\s._\-#]\d{3,}\s*$)|(\b(vol|no|pt|part)\.?\s?\d{2,}\s*$)/i;

export function isAssemblyLine(album: CatalogAlbum): boolean {
  if (album.gold) return false;
  const n = album.artistWindowReleases ?? 0;
  if (n >= 3) return true;
  if (n >= 2 && SERIAL_TITLE.test(album.title.trim())) return true;
  return false;
}

export type QualityOpts = {
  skipThinRatings: boolean;
  skipRoughCovers: boolean;
  skipAssemblyLine: boolean;
};

export function isRoughCover(album: CatalogAlbum, sleeveScore?: number): boolean {
  if (!album.hasCover) return true;
  if (typeof sleeveScore === "number" && sleeveScore < ROUGH_SLEEVE) return true;
  const blob = `${album.title} ${album.artist}`.toLowerCase();
  if (/\b(cover tbd|no artwork|placeholder sleeve)\b/.test(blob)) return true;
  return false;
}

/**
 * 参考池风格画像:genre id → 0..1 权重(在参考池里出现得越频繁越接近 1)。
 * 由前端根据已启用参考源的专辑推断风格统计得到。
 */
export type RefGenreProfile = Record<string, number>;

/** 从参考池专辑列表构建风格频率画像。 */
export function buildRefGenreProfile(albums: Array<{ inferredGenres: string[] }>): RefGenreProfile {
  const counts = new Map<string, number>();
  for (const a of albums) {
    for (const g of a.inferredGenres) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let max = 0;
  for (const n of counts.values()) max = Math.max(max, n);
  if (max === 0) return {};
  const profile: RefGenreProfile = {};
  for (const [g, n] of counts) profile[g] = n / max;
  return profile;
}

/** 专辑风格与参考池画像的贴合度 0..1(取命中风格的最高频率权重,再按命中数微调;艺人级风格按 0.8 折计入)。 */
function refProfileAffinity(album: CatalogAlbum, profile?: RefGenreProfile): number {
  if (!profile) return 0;
  let best = 0;
  let hits = 0;
  for (const g of album.inferredGenres) {
    const w = profile[g];
    if (w == null) continue;
    hits += 1;
    best = Math.max(best, w);
  }
  for (const g of album.artistGenres ?? []) {
    const w = profile[g];
    if (w == null) continue;
    hits += 1;
    best = Math.max(best, w * 0.8);
  }
  if (hits === 0) return 0;
  return Math.min(1, best * (hits > 1 ? 1.15 : 1));
}

export function scoreAlbum(
  album: CatalogAlbum,
  taste: string[],
  weights: ScoreWeights,
  sleeveScore?: number,
  catalog: GenreDef[] = [],
  refArtists?: Set<string>,
  refProfile?: RefGenreProfile,
  detail = true,
): ScoreBreakdown {
  const t = tasteScore(album, taste);
  const isRefArtist = refArtists?.has(album.artist.trim().toLowerCase()) ?? false;
  // 参考池里的艺人(含艺人追踪源)在艺人维度直接给高权重
  const a = clamp(Math.max(album.artistStature, isRefArtist ? 82 : 0));
  const r = ratingScore(album);
  const c = coverScore(album, sleeveScore);
  const w = normalizeWeights(weights);
  let composite = t.score * w.taste + a * w.artist + r * w.rating + c * w.cover;
  const reasons: string[] = [];
  if (!detail) {
    const affinity = refProfileAffinity(album, refProfile);
    if (affinity > 0.25) composite += affinity * 10;
    if (album.isFriday) composite += 8;
    else if (album.inSelectedWeek) composite += 3;
    if (album.type === "Album") composite += 2;
    if (album.secondaryType?.toLowerCase().includes("field recording")) composite += 5;
    if (!isRefArtist && isCrowdedNiche(album) && !hasAnticipation(album)) composite -= 16;
    if (!isRefArtist && album.sources.length === 1 && album.sources[0] === "Bandcamp" && !hasAnticipation(album)) {
      composite -= 10;
    }
    return {
      taste: Math.round(t.score),
      artist: Math.round(a),
      rating: Math.round(r),
      cover: Math.round(c),
      composite: Math.round(clamp(composite)),
      reasons,
    };
  }

  if (t.hits.length) {
    reasons.push(
      `口味吻合 ${t.hits.map((id) => genreById(id, catalog)?.label ?? id).join(" / ")}`,
    );
  }
  if (t.artistHits.length) {
    reasons.push(
      `艺人风格贴口味 ${t.artistHits.map((id) => genreById(id, catalog)?.label ?? id).join(" / ")}`,
    );
  }
  // 参考池风格画像:专辑风格贴合你实际收藏的风格分布,最多 +10
  const affinity = refProfileAffinity(album, refProfile);
  if (affinity > 0.25) {
    composite += affinity * 10;
    reasons.push("贴合参考池的风格画像");
  }
  if (isRefArtist) reasons.push("参考池里的艺人(订阅/追踪中)");
  else if (a >= 80) reasons.push("艺人在实验音乐名册中权重很高");
  else if (a >= 60) reasons.push("发行脉络接近你关注的厂牌/艺人");
  if (album.isFriday) {
    composite += 8;
    reasons.push("周五发行日");
  } else if (album.inSelectedWeek) {
    composite += 3;
  }
  if (album.type === "Album") composite += 2;
  if (album.secondaryType?.toLowerCase().includes("field recording")) {
    composite += 5;
    reasons.push("田野录音（官方二级类型）");
  }
  // 拥挤风格(ambient 系等)+ 零期待信号:重压。这类组合基本是背景音流水线,
  // 光贴着口味标签不该出现在周榜前列;参考池艺人豁免。
  if (!isRefArtist && isCrowdedNiche(album) && !hasAnticipation(album)) {
    composite -= 16;
    reasons.push("高产风格且无人关注,降权");
  }
  // Bandcamp 自发上架 + 零关注:风格标签是上传者自己打的(容易多贴),
  // 无任何外部信号佐证时温和降权,让位给有编辑语境的条目;参考池艺人豁免
  if (!isRefArtist && album.sources.length === 1 && album.sources[0] === "Bandcamp" && !hasAnticipation(album)) {
    composite -= 10;
    reasons.push("Bandcamp 自发上架且无关注信号,降权");
  }
  const votes = sampleSize(album);
  if (votes > 0) reasons.push(`样本 ${votes} 人`);
  if (sleeveScore != null) reasons.push(`封面识别 ${Math.round(sleeveScore)}`);
  else if (album.hasCover) reasons.push("封面已收录于 Cover Art Archive");
  else reasons.push("尚无封面，封面分偏低");

  if (!t.hits.length && !t.artistHits.length) reasons.push("标签未直接命中口味，排在后面");

  return {
    taste: Math.round(t.score),
    artist: Math.round(a),
    rating: Math.round(r),
    cover: Math.round(c),
    composite: Math.round(clamp(composite)),
    reasons,
  };
}

export function rankAlbums(
  albums: CatalogAlbum[],
  taste: string[],
  weights: ScoreWeights,
  sleeves: Record<string, { sleeveScore: number }>,
  opts: {
    strictTaste: boolean;
    types: Array<"Album" | "EP">;
    refArtists?: Set<string>;
    refProfile?: RefGenreProfile;
  } & QualityOpts,
  catalog: GenreDef[] = [],
): ScoredAlbum[] {
  const typeSet = new Set(opts.types);
  const refArtists = opts.refArtists;
  const isRef = (a: CatalogAlbum) => refArtists?.has(a.artist.trim().toLowerCase()) ?? false;
  const scored = albums
    .filter((a) => typeSet.has(a.type as "Album" | "EP"))
    .filter((a) => {
      if (isJunkRelease(a)) return false;
      // 参考池艺人(订阅/追踪)豁免流水线与粗糙封面过滤——用户明确在跟这位艺人
      if (opts.skipAssemblyLine && !isRef(a) && isAssemblyLine(a)) return false;
      const sleeve = sleeves[a.id]?.sleeveScore;
      if (opts.skipRoughCovers && !isRef(a) && isRoughCover(a, sleeve)) return false;
      return true;
    })
    .map((album) => ({
      ...album,
      scores: scoreAlbum(
        album,
        taste,
        weights,
        sleeves[album.id]?.sleeveScore,
        catalog,
        refArtists,
        opts.refProfile,
        false,
      ),
    }))
    .filter((album) => {
      if (opts.skipThinRatings && !isRef(album) && isThinHighRating(album, album.scores.rating)) return false;
      return true;
    });

  // 严格口味:必须命中口味风格(发行级或艺人级),且综合分达到兜底线(挡掉靠单一弱信号混进来的残留)
  const STRICT_FLOOR = 40;
  const tasteSet = new Set(taste);
  // 期待门槛:零关注(没人听、没人评、艺人无分量)的发行,除非口味多重强命中
  // 才放行;拥挤风格(ambient 系)里的零关注发行一律不放——它命中的口味标签
  // 正是流水线扎堆的那一个,不构成推荐理由
  const anticipatedOrEarned = (a: ScoredAlbum) =>
    hasAnticipation(a) || (!isCrowdedNiche(a) && a.scores.taste >= 62);
  const filtered = opts.strictTaste
    ? scored.filter(
        (a) =>
          isRef(a) ||
          ((a.scores.taste >= 28 ||
            a.inferredGenres.some((g) => tasteSet.has(g)) ||
            (a.artistGenres ?? []).some((g) => tasteSet.has(g))) &&
            a.scores.composite >= STRICT_FLOOR &&
            anticipatedOrEarned(a)),
      )
    : scored;

  filtered.sort((x, y) => {
    if (y.scores.composite !== x.scores.composite) return y.scores.composite - x.scores.composite;
    if (Number(y.hasCover) !== Number(x.hasCover)) return Number(y.hasCover) - Number(x.hasCover);
    return y.date.localeCompare(x.date);
  });
  return diversify(filtered);
}

function diversify(list: ScoredAlbum[]): ScoredAlbum[] {
  const seen = new Map<string, number>();
  const adjusted = list.map((a) => {
    const key = a.artist.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n <= 2) return a;
    return {
      ...a,
      scores: {
        ...a.scores,
        composite: Math.max(12, a.scores.composite - (n - 2) * 12),
      },
    };
  });
  adjusted.sort((x, y) => y.scores.composite - x.scores.composite);
  return adjusted;
}
