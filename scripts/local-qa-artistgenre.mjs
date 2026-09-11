/* 艺人风格维度 QA:通过真实「回扫补遗」深扫路径跑两轮,
   验证艺人历史发行标签的覆盖率随缓存累积、并放大口味召回。 */
import { chromium } from "playwright";

async function debugStats() {
  const res = await fetch("http://127.0.0.1:8080/api/radar?week=2026-08-24&debug=1", {
    signal: AbortSignal.timeout(150000),
  });
  const j = await res.json();
  return { auto: (j.auto ?? []).length, ...j.debug };
}

const before = await debugStats();
console.log("回扫前:", JSON.stringify(before));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://127.0.0.1:8080", { waitUntil: "domcontentloaded" });
await page.waitForSelector("h1", { timeout: 60000 });
// 等 React 完成水合,否则点击落在未绑事件的 SSR 按钮上
await page.waitForTimeout(3000);

for (let round = 1; round <= 2; round++) {
  const btn = page.getByRole("button", { name: /回扫补遗|Rescan/ }).first();
  await btn.waitFor({ state: "visible", timeout: 30000 });
  await btn.click();
  // 先等忙碌状态出现(证明深扫真的开始了),再等它结束(深扫最长 ~2 分钟)
  const busy = page.getByRole("button", { name: /回扫中|Rescanning/ }).first();
  await busy.waitFor({ state: "visible", timeout: 15000 });
  await busy.waitFor({ state: "hidden", timeout: 180000 });
  const stats = await debugStats();
  console.log(`第 ${round} 轮回扫后:`, JSON.stringify(stats));
}

await browser.close();

const after = await debugStats();
const gained = (after.artistGenresOnly ?? 0) - (before.artistGenresOnly ?? 0);
console.log(`\n艺人风格兜底覆盖:${before.artistGenresOnly} → ${after.artistGenresOnly}(+${gained})`);
console.log(`过筛结果:${before.rankedTotal} → ${after.rankedTotal};其中靠艺人风格入选:${after.rankedViaArtist}`);
if (gained <= 0) {
  console.error("✗ 覆盖率没有累积");
  process.exit(1);
}
console.log("✓ 艺人风格维度生效且随回扫累积");
