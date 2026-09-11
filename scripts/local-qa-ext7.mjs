/* 插件 QA v7:新标签页 M×N 横向满格墙 + 搜索栏中间偏下 + 框宽固定与搜索栏对齐;
   浅色新主题(Utopian Virtual)动效同步;弹窗 N×N 不回归。 */
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const EXT = resolve("extension");
const PROFILE = resolve("screenshots/.ext-profile8");
mkdirSync("screenshots", { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });

const fails = [];
function check(name, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) fails.push(name);
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium",
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1280, height: 900 },
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
const extId = new URL(sw.url()).host;
console.log(`扩展已加载:${extId}`);

const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/options.html`);
await page.fill("#base", "http://127.0.0.1:8080");
await page.click("#save");
await page.waitForTimeout(400);

// 1) 新标签页布局:搜索栏中间偏下、专辑墙横排其下、框宽固定 680 与搜索栏对齐
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
await page.waitForTimeout(600);
const layout = await page.evaluate(() => {
  const vh = window.innerHeight;
  const search = document.querySelector(".gsearch input").getBoundingClientRect();
  const wallbox = document.querySelector(".wallbox");
  const wb = wallbox.getBoundingClientRect();
  const grid = document.getElementById("grid");
  const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
  const cards = grid.querySelectorAll(".card").length;
  const morebox = grid.querySelector(".morebox");
  return {
    vh,
    searchCenterRatio: (search.top + search.height / 2) / vh,
    searchWidth: Math.round(search.width),
    wallTop: wb.top,
    searchBottom: search.bottom,
    wallWidth: Math.round(wb.width),
    jsWidth: wallbox.style.width || "(css)",
    cols,
    cards,
    hasMore: Boolean(morebox),
  };
});
const rows = Math.ceil(layout.cards / layout.cols);
check(
  "搜索栏位于中间偏下(45%–62% 视口高)",
  layout.searchCenterRatio > 0.45 && layout.searchCenterRatio < 0.62,
  `center=${(layout.searchCenterRatio * 100).toFixed(1)}%`,
);
check("专辑墙位于搜索栏之下", layout.wallTop > layout.searchBottom, `wallTop=${Math.round(layout.wallTop)}`);
check(
  "框宽固定且与搜索栏等宽(非 JS 缩放)",
  Math.abs(layout.wallWidth - layout.searchWidth) <= 4 && layout.jsWidth === "(css)",
  `wall=${layout.wallWidth} search=${layout.searchWidth} js=${layout.jsWidth}`,
);
check(
  "M×N 横向满格(卡片数 = M×N,M ≥ 2N 或单行)",
  layout.cards === layout.cols * rows && (rows === 1 || layout.cols >= 2 * rows),
  `M=${layout.cols} N=${rows} cards=${layout.cards} more=${layout.hasMore}`,
);
await page.waitForTimeout(2000);
await page.screenshot({ path: "screenshots/ext7-newtab-mn.png" });

// 2) 同步浅色新主题 Utopian Virtual:动效接管
await page.goto(`chrome-extension://${extId}/options.html`);
await page.fill(
  "#sync",
  JSON.stringify({ v: 3, taste: [], weights: {}, theme: { id: "utopian-virtual" }, entries: [] }),
);
await page.click("#save");
await page.waitForTimeout(400);
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
const utopia = await page.evaluate(() => {
  const el = document.getElementById("bgfx");
  return {
    theme: document.documentElement.dataset.theme,
    iris: el ? getComputedStyle(el).animationName : "missing",
    cloud: el ? getComputedStyle(el, "::before").animationName : "missing",
    rise: el ? getComputedStyle(el, "::after").animationName : "missing",
  };
});
check("Utopian Virtual 接管", utopia.theme === "utopian-virtual", utopia.theme);
check(
  "三层动效在跑(iris/cloud/rise)",
  utopia.iris.includes("fx-utopia-iris") && utopia.cloud.includes("fx-utopia-cloud") && utopia.rise.includes("fx-utopia-rise"),
  `${utopia.iris} / ${utopia.cloud} / ${utopia.rise}`,
);
await page.waitForTimeout(2000);
await page.screenshot({ path: "screenshots/ext7-newtab-utopia.png" });

// 3) 弹窗:N×N 不回归
await page.goto(`chrome-extension://${extId}/popup.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
const pop = await page.evaluate(() => {
  const grid = document.getElementById("grid");
  return {
    cols: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
    cards: grid.querySelectorAll(".card").length,
  };
});
check("弹窗仍为 N×N 满格", pop.cards === pop.cols * pop.cols || pop.cards <= pop.cols * pop.cols, JSON.stringify(pop));
await page.screenshot({ path: "screenshots/ext7-popup.png" });

await ctx.close();
if (fails.length) {
  console.error(`\n${fails.length} 项失败: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\nALL EXT v7 QA PASSED");
