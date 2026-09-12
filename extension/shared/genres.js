/* 风格介绍库的出入口:两份数据文件合并去重,再按「最近看过的不再抽」发牌。
   条目本身写在 genres-world.js(地域与根源)与 genres-net.js(电子与地下),
   这里只管去重和抽签,新增风格只改数据文件。

   数据是动态 import 的:一是别让六万字的库拖慢新标签页首屏,
   二是某份数据文件出问题时只丢这张卡片,不至于把整页脚本带崩。 */

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** 两份库各写各的,同一个风格可能撞名:id 与英文名各去一次重,字段缺了就整条丢掉。 */
function merge(lists) {
  const out = [];
  const ids = new Set();
  const names = new Set();
  for (const list of lists) {
    for (const g of Array.isArray(list) ? list : []) {
      const id = String(g?.id || "");
      const name = normName(g?.en);
      if (!id || !name || ids.has(id) || names.has(name)) continue;
      if (!g.zh || !g.zhDesc || !g.enDesc || !g.whereZh || !g.whereEn) continue;
      ids.add(id);
      names.add(name);
      out.push(g);
    }
  }
  return out;
}

let cache = null;

export async function loadGenres() {
  if (cache) return cache;
  const parts = await Promise.all([
    import("./genres-world.js")
      .then((m) => m.GENRES_WORLD)
      .catch(() => []),
    import("./genres-net.js")
      .then((m) => m.GENRES_NET)
      .catch(() => []),
  ]);
  cache = merge(parts);
  return cache;
}

/**
 * 抽下一条:只在「没看过的」里随机,所以连开十几个标签页也不会撞同一条;
 * 整库看完由调用方清空记录重来。
 */
export function pickGenre(list, seen) {
  const all = Array.isArray(list) ? list : [];
  if (!all.length) return null;
  const skip = new Set(Array.isArray(seen) ? seen : []);
  const pool = all.filter((g) => !skip.has(g.id));
  const from = pool.length ? pool : all;
  return from[Math.floor(Math.random() * from.length)];
}
