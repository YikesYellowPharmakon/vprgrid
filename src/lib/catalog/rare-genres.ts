/**
 * 风格介绍库(与新标签页卡片同一份)。
 * 条目由 extension/shared/genres-*.js 合并而来,改库时重新导出 rare-genres.json;
 * 能挂进现有母类的走 rare-families.ts,撞名的不再另开。
 */
import raw from "./rare-genres.json";

export type RareGenre = {
  id: string;
  en: string;
  zh: string;
  whereZh: string;
  whereEn: string;
  zhDesc: string;
  enDesc: string;
  key: string;
};

export const RARE_FAMILY_ID = "cf-rare-regional";
export const RARE_FAMILY_LABEL = "Rare & Regional";
export const RARE_FAMILY_ZH = "冷门与地域";

export const RARE_GENRES: RareGenre[] = raw as RareGenre[];
