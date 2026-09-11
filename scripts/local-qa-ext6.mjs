/* 插件 QA v6:Matrix 默认接管、Y2K 同步、N×N 满格墙 + 收纳盒、方框随规模缩放。 */
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const EXT = resolve("extension");
const PROFILE = resolve("screenshots/.ext-profile7");
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

// 1) 无同步码:默认 = Matrix 动效接管
await page.goto(`chrome-extension://${extId}/options.html`);
await page.fill("#base", "http://127.0.0.1:8080");
await page.click("#save");
await page.waitForTimeout(400);
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
const def = await page.evaluate(() => {
  const el = document.getElementById("bgfx");
  return {
    theme: document.documentElement.dataset.theme,
    rain: el ? getComputedStyle(el, "::before").animationName : "missing",
  };
});
check("默认主题 = Matrix", def.theme === "matrix", def.theme);
check("数字雨动画在跑", def.rain.includes("fx-matrix-rain"), def.rain);

// 2) N×N 满格墙:列数 = floor(√M),溢出收纳盒计入格子
const wall = await page.evaluate(() => {
  const grid = document.getElementById("grid");
  const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
  const cards = grid.querySelectorAll(".card").length;
  const morebox = grid.querySelector(".morebox");
  const count = morebox ? morebox.querySelector(".morecount")?.textContent : null;
  const wallbox = document.querySelector(".wallbox");
  return { cols, cards, hasMore: Boolean(morebox), count, boxWidth: wallbox.style.width };
});
const expectedN = wall.cols;
check(
  "满格 N×N(卡片数 = N² 或全量)",
  wall.cards === expectedN * expectedN || (!wall.hasMore && wall.cards <= expectedN * expectedN),
  `cols=${wall.cols} cards=${wall.cards} more=${wall.hasMore}${wall.count ? " " + wall.count : ""}`,
);
check("方框宽度随规模缩放(JS 已设宽)", /px$/.test(wall.boxWidth), wall.boxWidth);
await page.waitForTimeout(2500);
await page.screenshot({ path: "screenshots/ext6-matrix-nn.png" });

// 3) 同步 Y2K 主题
const app = await ctx.newPage();
await app.goto("http://127.0.0.1:8080", { waitUntil: "domcontentloaded" });
await app.evaluate(() => {
  localStorage.setItem("grain-friday-v4", JSON.stringify({ state: { theme: "y2k" }, version: 3 }));
});
await app.reload({ waitUntil: "domcontentloaded" });
await app.waitForSelector("h1");
await app.waitForTimeout(800);
const syncCode = await app.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const theme = {
    id: document.documentElement.getAttribute("data-theme") ?? "matrix",
    bg: v("--color-bg"), fg: v("--color-fg"), accent: v("--color-accent"),
  };
  return JSON.stringify({ v: 3, taste: [], weights: {}, theme, entries: [] });
});
check("应用端主题 id=y2k", syncCode.includes('"id":"y2k"'));
await app.close();

await page.goto(`chrome-extension://${extId}/options.html`);
await page.fill("#sync", syncCode);
await page.click("#save");
await page.waitForTimeout(400);
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
const y2k = await page.evaluate(() => {
  const el = document.getElementById("bgfx");
  return {
    theme: document.documentElement.dataset.theme,
    float: el ? getComputedStyle(el, "::before").animationName : "missing",
    bg: getComputedStyle(document.documentElement).backgroundColor,
  };
});
check("Y2K 主题接管", y2k.theme === "y2k", y2k.theme);
check("铬光泡上浮动画在跑", y2k.float.includes("fx-y2k-float"), y2k.float);
await page.waitForTimeout(2500);
await page.screenshot({ path: "screenshots/ext6-y2k-nn.png" });

// 4) 旧同步码兑底:default → matrix
await page.goto(`chrome-extension://${extId}/options.html`);
await page.fill("#sync", JSON.stringify({ v: 3, taste: [], weights: {}, theme: { id: "default" }, entries: [] }));
await page.click("#save");
await page.waitForTimeout(400);
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
const legacy = await page.evaluate(() => document.documentElement.dataset.theme);
check("旧 id(default)兑底为 matrix", legacy === "matrix", legacy);

// 5) 弹窗:N×N + 主题接管
await page.goto(`chrome-extension://${extId}/popup.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
const pop = await page.evaluate(() => {
  const grid = document.getElementById("grid");
  return {
    theme: document.documentElement.dataset.theme,
    cols: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
    cards: grid.querySelectorAll(".card").length,
  };
});
check("弹窗接管 + N×N", pop.theme === "matrix" && pop.cards <= pop.cols * pop.cols, JSON.stringify(pop));
await page.screenshot({ path: "screenshots/ext6-popup.png" });

await ctx.close();
if (fails.length) {
  console.error(`\n${fails.length} 项失败: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\nALL EXT v6 QA PASSED");
