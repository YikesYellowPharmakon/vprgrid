/**
 * 本机档案的前端一侧:把「值得留住的那部分状态」定期送到 `/api/vault` 落盘,
 * 并在浏览器存储被清空后自动接回来。
 *
 * 为什么需要:参考池与列表存在 localStorage + IndexedDB 里,浏览器一清站点数据就没了。
 * 档案文件在应用所在机器上,清浏览器不碰它。
 *
 * 两条铁律:
 *   1. 只有「空白状态」才自动恢复 —— 已经有内容时绝不悄悄盖掉用户手上的东西;
 *   2. 空白状态绝不自动备份 —— 否则清完数据后的第一次写入会把档案抹平。
 */
import { normalizePersistedTaste } from "./catalog/genres";
import { BUILTIN_SOURCE_ID } from "./catalog/sources";
import { ensureSavedList, SAVED_LIST_ID, savedIdsOf, type UserList } from "./catalog/lists";
import { useGrain } from "./store";

type GrainSnapshot = ReturnType<typeof useGrain.getState>;

/** 进档案的字段:用户自己攒出来的东西 + 偏好。AI 密钥与可再生成的缓存都不进。 */
const FIELDS = [
  "taste",
  "tastePresets",
  "customFamilies",
  "customGenres",
  "refSources",
  "userLists",
  "activeListId",
  "saved",
  "hidden",
  "types",
  "weights",
  "strictTaste",
  "skipThinRatings",
  "skipRoughCovers",
  "skipAssemblyLine",
  "theme",
  "lang",
  "customTheme",
  "view",
] as const;

type VaultState = Partial<Record<(typeof FIELDS)[number], unknown>>;
export type VaultSnapshot = { v: number; savedAt: string; state: VaultState };
export type VaultCounts = { lists: number; albums: number; sources: number; presets: number };

export function snapshotOf(s: GrainSnapshot): VaultState {
  const out: VaultState = {};
  for (const k of FIELDS) out[k] = (s as unknown as Record<string, unknown>)[k];
  return out;
}

function listsOf(v: unknown): UserList[] {
  return Array.isArray(v) ? (v as UserList[]).filter((l) => l && typeof l.id === "string") : [];
}

export function countsOf(state: VaultState): VaultCounts {
  const lists = listsOf(state.userLists);
  const sources: Array<{ id?: unknown }> = Array.isArray(state.refSources) ? state.refSources : [];
  return {
    lists: lists.length,
    albums: lists.reduce((n, l) => n + (Array.isArray(l.entries) ? l.entries.length : 0), 0),
    sources: sources.filter((x) => typeof x?.id === "string" && x.id !== BUILTIN_SOURCE_ID).length,
    presets: Array.isArray(state.tastePresets) ? state.tastePresets.length : 0,
  };
}

/** 空白 = 只有默认的空「收藏」、只有内置参考源、没有存过口味。 */
export function isBlank(state: VaultState): boolean {
  const c = countsOf(state);
  const onlyEmptySaved = listsOf(state.userLists).every((l) => l.id === SAVED_LIST_ID && !l.entries?.length);
  return onlyEmptySaved && c.sources === 0 && c.presets === 0;
}

export async function readVault(prev = false): Promise<VaultSnapshot | null> {
  try {
    const res = await fetch(`/api/vault${prev ? "?prev=1" : ""}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { snapshot?: VaultSnapshot | null };
    const snap = body?.snapshot;
    if (!snap || typeof snap !== "object" || !snap.state || typeof snap.state !== "object") return null;
    return snap;
  } catch {
    return null;
  }
}

type WriteResult = { ok: boolean; savedAt?: string; reason?: string };

let lastWrite: WriteResult | null = null;

/** 最近一次写入的结果:面板用它判断这台机器到底能不能落盘(只读部署会一直失败)。 */
export function lastVaultWrite(): WriteResult | null {
  return lastWrite;
}

export async function writeVault(state: VaultState): Promise<WriteResult> {
  try {
    const res = await fetch("/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ v: 1, savedAt: new Date().toISOString(), state }),
    });
    lastWrite = (await res.json()) as WriteResult;
  } catch {
    lastWrite = { ok: false, reason: "offline" };
  }
  return lastWrite;
}

/** 把档案写回 store:只认识的字段、类型对得上才接,列表与收藏索引重新推导一遍。 */
export function applySnapshot(state: VaultState): VaultCounts {
  const patch: Record<string, unknown> = {};
  const keep = (k: (typeof FIELDS)[number], ok: (v: unknown) => boolean) => {
    const v = state[k];
    if (v !== undefined && ok(v)) patch[k] = v;
  };
  const isArr = (v: unknown) => Array.isArray(v);
  const isObj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
  const isStr = (v: unknown) => typeof v === "string";
  const isBool = (v: unknown) => typeof v === "boolean";

  keep("taste", isArr);
  if (isArr(patch.taste)) patch.taste = normalizePersistedTaste(patch.taste as string[]);
  keep("tastePresets", isArr);
  keep("customFamilies", isArr);
  keep("customGenres", isArr);
  keep("refSources", (v) => isArr(v) && (v as unknown[]).length > 0);
  keep("hidden", isArr);
  keep("types", (v) => isArr(v) && (v as unknown[]).length > 0);
  keep("weights", isObj);
  keep("customTheme", isObj);
  keep("strictTaste", isBool);
  keep("skipThinRatings", isBool);
  keep("skipRoughCovers", isBool);
  keep("skipAssemblyLine", isBool);
  keep("theme", isStr);
  keep("lang", (v) => v === "zh" || v === "en");
  keep("view", (v) => v === "list" || v === "grid");

  const lists = ensureSavedList(listsOf(state.userLists), []);
  patch.userLists = lists;
  patch.saved = savedIdsOf(lists);
  const active = state.activeListId;
  patch.activeListId = isStr(active) && lists.some((l) => l.id === active) ? active : SAVED_LIST_ID;

  useGrain.setState(patch as Partial<GrainSnapshot>);
  return countsOf(snapshotOf(useGrain.getState()));
}

let watching = false;

/**
 * 「我是自己清空的」标记。用户亲手删完列表与参考源后,重开不该把档案里的旧内容又搬回来;
 * 而清浏览器数据会把这个标记一起清掉 —— 那才是需要自动接回的场景。
 */
const CLEARED_KEY = "grain-vault-cleared";

function markCleared(on: boolean): void {
  try {
    if (on) localStorage.setItem(CLEARED_KEY, "1");
    else localStorage.removeItem(CLEARED_KEY);
  } catch {
    /* 隐私模式下写不了:最坏情况是多接回一次 */
  }
}

function wasClearedByUser(): boolean {
  try {
    return localStorage.getItem(CLEARED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 状态一稳定就往档案里写一份(4 秒防抖)。空白状态跳过,别把已有档案覆盖成空。
 */
export function startVaultWatch(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  let timer = 0;
  let lastJson = "";
  let lastRefs = useGrain.getState().refSources;
  let lastLists = useGrain.getState().userLists;
  let sawContent = false;
  const flush = () => {
    timer = 0;
    const state = snapshotOf(useGrain.getState());
    if (isBlank(state)) {
      // 本来有东西,现在空了:是用户自己清的,记下来别再自动接回
      if (sawContent) markCleared(true);
      return;
    }
    sawContent = true;
    markCleared(false);
    const json = JSON.stringify(state);
    if (json === lastJson) return;
    lastJson = json;
    void writeVault(state);
  };
  const schedule = (ms = 4000) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(flush, ms);
  };
  schedule();
  useGrain.subscribe((s) => {
    // 参考源或列表一变就尽快落盘:清 cookies 只清浏览器,档案在这台机器的磁盘上
    const heavy = s.refSources !== lastRefs || s.userLists !== lastLists;
    lastRefs = s.refSources;
    lastLists = s.userLists;
    schedule(heavy ? 400 : 4000);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && timer) flush();
  });
}

/**
 * 开应用时的自动接回:只在本地空白且档案里确实有东西时动手。
 * 返回恢复了多少内容,没恢复就 null。
 */
export async function maybeRestoreVault(): Promise<VaultCounts | null> {
  if (wasClearedByUser()) return null;
  if (!isBlank(snapshotOf(useGrain.getState()))) return null;
  const snap = await readVault();
  if (!snap || isBlank(snap.state)) return null;
  return applySnapshot(snap.state);
}

/** 面板上的「立即备份」。 */
export async function backupNow(): Promise<{ ok: boolean; reason?: string; counts: VaultCounts }> {
  const state = snapshotOf(useGrain.getState());
  const counts = countsOf(state);
  if (isBlank(state)) return { ok: false, reason: "blank", counts };
  const res = await writeVault(state);
  return { ok: Boolean(res.ok), reason: res.reason, counts };
}

/** 面板上的「从备份恢复」:这条会盖掉当前状态,调用方负责先确认。 */
export async function restoreFromVault(): Promise<VaultCounts | null> {
  const snap = await readVault();
  if (!snap || isBlank(snap.state)) return null;
  markCleared(false);
  return applySnapshot(snap.state);
}
