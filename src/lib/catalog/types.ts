export type ReleaseType = "Album" | "EP" | "Single" | "Other";

export type ListenLinks = {
  apple: string | null;
  spotify: string | null;
  netease: string | null;
  bandcamp: string | null;
};

export type CatalogAlbum = {
  id: string;
  title: string;
  artist: string;
  artistMbids: string[];
  date: string;
  /** 参考条目缺真实发行日,不应按 date 归进当周墙。 */
  dateUnknown?: boolean;
  type: ReleaseType;
  secondaryType: string | null;
  tags: string[];
  inferredGenres: string[];
  /** 艺人级风格(由艺人整体标签推断,发行本身无标签时的口味兜底维度)。 */
  artistGenres?: string[];
  hasCover: boolean;
  coverUrl: string | null;
  coverUrlLg: string | null;
  listenCount: number;
  ratingVotes: number;
  ratingValue: number | null;
  artistStature: number;
  isFriday: boolean;
  inSelectedWeek: boolean;
  sources: string[];
  links: {
    musicbrainz: string;
    discogs: string;
    bandcamp: string;
    aoty: string;
    rym: string;
  };
  listen: ListenLinks;
  /** 同一艺人在展示期终点往回 21 天内的专辑/EP 数，用于高产流水线判定。 */
  artistWindowReleases?: number;
  /** 参考池亲选条目（默认内置,可由参考设置里的多源订阅替换）。 */
  gold?: boolean;
  /** 代表曲：一专一曲。 */
  repTrack?: { name: string; url: string } | null;
};

export type ScoreBreakdown = {
  taste: number;
  artist: number;
  rating: number;
  cover: number;
  composite: number;
  reasons: string[];
};

export type ScoredAlbum = CatalogAlbum & { scores: ScoreBreakdown };

export type WeekCatalog = {
  friday: string;
  weekStart: string;
  weekEnd: string;
  fetchedAt: string;
  sourceLabel: string;
  scanned: number;
  albums: CatalogAlbum[];
  /** true = 补水超时的半成品(缺标签/封面),不可长期缓存,稍后重取即完整 */
  partial?: boolean;
  error?: string;
};

export type CoverReading = {
  sleeveScore: number;
  aesthetic: string;
  matchedGenres: string[];
  notes: string;
};

export type ScoreWeights = {
  taste: number;
  artist: number;
  rating: number;
  cover: number;
};
