import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const gold = JSON.parse(readFileSync(join(here, "../src/lib/catalog/gold-2026.json"), "utf8"));

test("金标准硬性召回：364 张专辑，互不重复", () => {
  assert.equal(gold.length, 364);
  const ids = new Set(gold.map((g) => g.albumId));
  assert.equal(ids.size, 364);
});

test("每张专辑都有代表曲与可归周的日期", () => {
  for (const g of gold) {
    assert.ok(g.title && g.artist, `缺标题/艺人: ${g.albumId}`);
    assert.ok(g.songId && g.song, `缺代表曲: ${g.title}`);
    assert.match(g.date, /^\d{4}-\d{2}-\d{2}$/, `日期不合法: ${g.title} ${g.date}`);
  }
});

test("金标准里的 Michiru Aoyama 亲选条目保留（不被流水线规则误杀）", () => {
  const michiru = gold.filter((g) => g.artist.toLowerCase().includes("michiru aoyama"));
  assert.equal(michiru.length, 1);
  assert.equal(michiru[0].title, "Still Air 0010");
});

test("2026 年条目占绝对主体（按自然周分组的时间轴成立）", () => {
  const in2026 = gold.filter((g) => g.date >= "2025-12-29" && g.date <= "2027-01-03");
  assert.ok(in2026.length >= 350, `2026 自然周内仅 ${in2026.length} 张`);
});
