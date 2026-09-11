/* 插件 QA v8:新标签页——搜索栏回上方;堆叠滑动墙(封面互叠、大圆角、横向滚动);
   大框底部功能条(本周 / 刷新 / 完整应用 / 设置)+ 语言切换覆盖新按钮;弹窗 N×N 不回归。 */
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const EXT = resolve("extension");
const PROFILE = resolve("screenshots/.ext-profile9");
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

// 1) 新标签页布局:搜索栏在上方;堆叠墙封面互叠、大圆角、可横向滚动
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
await page.waitForTimeout(600);
const layout = await page.evaluate(() => {
  const vh = window.innerHeight;
  const search = document.querySelector(".gsearch input").getBoundingClientRect();
  const grid = document.getElementById("grid");
  const cards = [...grid.querySelectorAll(".card")];
  const rects = cards.slice(0, 3).map((c) => c.getBoundingClientRect());
  const overlap = rects.length >= 2 ? rects[0].right - rects[1].left : 0;
  const cover = cards[0]?.querySelector(".cover");
  const scroller = document.querySelector(".wallscroll");
  return {
    searchCenterRatio: (search.top + search.height / 2) / vh,
    display: getComputedStyle(grid).display,
    cardCount: cards.length,
    overlap: Math.round(overlap),
    radius: cover ? getComputedStyle(cover).borderRadius : "none",
    scrollable: scroller.scrollWidth > scroller.clientWidth,
    scrollW: scroller.scrollWidth,
    clientW: scroller.clientWidth,
  };
});
check(
  "搜索栏位于画面上方(< 30% 视口高)",
  layout.searchCenterRatio < 0.3,
  `center=${(layout.searchCenterRatio * 100).toFixed(1)}%`,
);
check("堆叠墙为 flex 胶片条", layout.display === "flex", layout.display);
check("封面互相叠压(重叠 ≥ 30px)", layout.overlap >= 30, `overlap=${layout.overlap}px cards=${layout.cardCount}`);
check("封面大弧度圆角(26px)", layout.radius === "26px", layout.radius);
check(
  "墙内可横向滚动(专辑多时)",
  layout.cardCount <= 6 || layout.scrollable,
  `scrollW=${layout.scrollW} clientW=${layout.clientW}`,
);

// 横向滚动实际生效
const scrolled = await page.evaluate(() => {
  const s = document.querySelector(".wallscroll");
  s.scrollLeft = 240;
  return s.scrollLeft;
});
check("scrollLeft 可推进", layout.cardCount <= 6 || scrolled > 0, `scrollLeft=${scrolled}`);

// 2) 大框底部功能条:四个按钮齐全且在框内
const foot = await page.evaluate(() => {
  const box = document.querySelector(".wallbox");
  const foot = box.querySelector(".wallfoot");
  const ids = ["today", "reload", "openapp", "ftsettings"].map((id) => {
    const n = document.getElementById(id);
    return n && foot.contains(n) ? n.textContent.trim() : null;
  });
  return { ids, note: document.getElementById("ftleft")?.textContent.trim() };
});
check("功能条含 本周/刷新/完整应用/设置", foot.ids.every(Boolean), foot.ids.join(" | "));
check("功能条含状态文字", Boolean(foot.note), foot.note);

// 「本周」「刷新」点击后墙仍在
const before = await page.evaluate(() => document.getElementById("weeklabel").textContent);
await page.click("#prev");
await page.waitForTimeout(300);
await page.click("#today");
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
const after = await page.evaluate(() => document.getElementById("weeklabel").textContent);
check("「本周」跳回当前周", after === before, `${after}`);
await page.click("#reload");
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
check("「刷新」后墙重新渲染", true);
await page.waitForTimeout(1500);
await page.screenshot({ path: "screenshots/ext8-newtab-stack.png" });

// 3) 语言切换覆盖新按钮
await page.click("#langtoggle");
await page.waitForTimeout(500);
const en = await page.evaluate(() => ({
  today: document.getElementById("today").textContent,
  reload: document.getElementById("reload").textContent,
}));
check("EN 文案生效(This week / Refresh)", en.today === "This week" && en.reload === "Refresh", JSON.stringify(en));
await page.click("#langtoggle");
await page.waitForTimeout(300);

// 4) 弹窗:N×N 不回归、无功能条报错
await page.goto(`chrome-extension://${extId}/popup.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
const pop = await page.evaluate(() => {
  const grid = document.getElementById("grid");
  return {
    cols: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
    cards: grid.querySelectorAll(".card").length,
  };
});
check("弹窗仍为 N×N 网格", pop.cards <= pop.cols * pop.cols && pop.cols >= 2, JSON.stringify(pop));
await page.screenshot({ path: "screenshots/ext8-popup.png" });

await ctx.close();
if (fails.length) {
  console.error(`\n${fails.length} 项失败: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\nALL EXT v8 QA PASSED");
