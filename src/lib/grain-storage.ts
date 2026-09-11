/**
 * 参考池(歌单/艺人/手动专辑)走 IndexedDB,其余小设置仍在 localStorage。
 * 万级歌单塞进 localStorage 会超配额,persist 静默失败,再次打开就只剩内置源。
 */
const IDB_NAME = "vprgrid-grain";
const IDB_STORE = "kv";
const HEAVY_KEY = "grain-friday-heavy";
const HEAVY_FIELDS = ["refSources", "artistNotes", "sleeves"] as const;

type PersistBlob = { state?: Record<string, unknown>; version?: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withDb<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, mode);
        const req = fn(tx.objectStore(IDB_STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      }),
  );
}

function idbGet(key: string): Promise<unknown> {
  return withDb("readonly", (store) => store.get(key));
}

function idbSet(key: string, value: unknown): Promise<void> {
  return withDb("readwrite", (store) => store.put(value, key)).then(() => undefined);
}

function idbDel(key: string): Promise<void> {
  return withDb("readwrite", (store) => store.delete(key));
}

function splitHeavy(blob: PersistBlob): { light: PersistBlob; heavy: Record<string, unknown> } {
  const state = { ...(blob.state ?? {}) };
  const heavy: Record<string, unknown> = {};
  for (const k of HEAVY_FIELDS) {
    if (k in state) {
      heavy[k] = state[k];
      delete state[k];
    }
  }
  return { light: { ...blob, state }, heavy };
}

let hydratedOnce = false;

export const grainStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    try {
      let light: PersistBlob | null = null;
      try {
        const raw = localStorage.getItem(name);
        if (raw) light = JSON.parse(raw) as PersistBlob;
      } catch {
        light = null;
      }
      let heavy: Record<string, unknown> | null = null;
      try {
        const fromIdb = await idbGet(HEAVY_KEY);
        if (fromIdb && typeof fromIdb === "object") heavy = fromIdb as Record<string, unknown>;
      } catch {
        heavy = null;
      }
      if (!light && !heavy) return null;
      const state = { ...(light?.state ?? {}) };
      // IndexedDB 优先;尚未迁走时沿用 localStorage 里的旧参考池
      for (const k of HEAVY_FIELDS) {
        if (heavy && k in heavy) state[k] = heavy[k];
      }
      return JSON.stringify({ state, version: light?.version ?? 9 });
    } finally {
      hydratedOnce = true;
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    if (typeof window === "undefined" || !hydratedOnce) return;
    let parsed: PersistBlob;
    try {
      parsed = JSON.parse(value) as PersistBlob;
    } catch {
      return;
    }
    const { light, heavy } = splitHeavy(parsed);
    const hasHeavy = HEAVY_FIELDS.some((k) => parsed.state && k in parsed.state);
    // partialize 后的轻量写入不含参考池;空对象写进 IDB 会把万级歌单抹掉
    if (hasHeavy) {
      try {
        await idbSet(HEAVY_KEY, heavy);
      } catch {
        try {
          localStorage.setItem(name, value);
        } catch {
          /* 配额满且无 IDB:这次保存失败,下次再试 */
        }
        return;
      }
    }
    try {
      localStorage.setItem(name, JSON.stringify(light));
    } catch {
      // 配额满:参考池已在 IDB,主题等小字段写失败不回滚
    }
  },

  removeItem: async (name: string): Promise<void> => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
    try {
      await idbDel(HEAVY_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** 参考池 / 艺人笔记 / 封面识别只在这三份引用变化时写入 IndexedDB。 */
export function writeHeavy(heavy: Record<(typeof HEAVY_FIELDS)[number], unknown>): Promise<void> {
  if (typeof window === "undefined" || !hydratedOnce) return Promise.resolve();
  return idbSet(HEAVY_KEY, heavy).catch(() => undefined);
}
