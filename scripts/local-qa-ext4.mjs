/* 插件 QA v4:主题背景图画同步(Matrix 数字雨)+ 中英文切换。 */
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const EXT = resolve("extension");
const PROFILE = resolve("screenshots/.ext-profile5");
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
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
const extId = new URL(sw.url()).host;
console.log(`扩展已加载:${extId}`);

// 1) 在应用页切到 Matrix 主题,按 copySyncCode 同一逻辑捕获主题(配色 + body 背景图画)
const app = await ctx.newPage();
// 走真实路径:预置 store 里的主题为 matrix 再加载(直接改 data-theme 会被 React 重置)
await app.goto("http://127.0.0.1:8080", { waitUntil: "domcontentloaded" });
await app.evaluate(() => {
  localStorage.setItem("grain-friday-v4", JSON.stringify({ state: { theme: "matrix" }, version: 2 }));
});
await app.reload({ waitUntil: "domcontentloaded" });
await app.waitForSelector("h1");
// body 的 background-color 有过渡动画,等它稳定再捕获
await app.waitForTimeout(1200);
const syncCode = await app.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const bs = getComputedStyle(document.body);
  const theme = {
    bg: v("--color-bg"), surface: v("--color-surface"), raised: v("--color-raised"),
    fg: v("--color-fg"), muted: v("--color-muted"), subtle: v("--color-subtle"),
    accent: v("--color-accent"), border: v("--color-border"),
    bodyBg: {
      image: bs.backgroundImage, size: bs.backgroundSize, position: bs.backgroundPosition,
      repeat: bs.backgroundRepeat, attachment: bs.backgroundAttachment,
      blend: bs.backgroundBlendMode, color: bs.backgroundColor,
    },
  };
  return JSON.stringify({ v: 2, taste: [], weights: {}, theme, entries: [] });
});
check("应用端捕获到 Matrix 数字雨背景", syncCode.includes("data:image/svg") && syncCode.includes("repeating-linear-gradient"));
await app.close();

// 2) 写入插件设置
const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/options.html`);
await page.fill("#base", "http://127.0.0.1:8080");
await page.fill("#sync", syncCode);
await page.click("#save");
await page.waitForTimeout(500);

// 3) 新标签页:背景图画完整复现
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
const bgi = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
check("插件 body 复现数字雨 SVG 层", bgi.includes("data:image/svg"));
check("插件 body 复现扫描线渐变层", bgi.includes("repeating-linear-gradient"));
const bgc = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check("底色为 Matrix 绿黑", bgc === "rgb(2, 7, 3)", bgc);
await page.waitForTimeout(3000);
await page.screenshot({ path: "screenshots/ext4-matrix-art.png" });

// 4) 中英切换
const langBtn = page.locator("#langtoggle");
check("语言按钮可见(EN)", (await langBtn.textContent()) === "EN");
await langBtn.click();
await page.waitForTimeout(1500);
check("搜索框占位切英文", (await page.locator("#q").getAttribute("placeholder")) === "Search Google or type a URL");
check("页脚切英文", (await page.locator("#ftleft").textContent()) === "Curator picks pinned · radar filtered");
check("模式按钮切英文", (await page.locator("#modetoggle").textContent())?.includes("Full app"));
const statusEn = await page.locator("#status").textContent();
check("状态行切英文", /Picks \d+ · Radar \d+/.test(statusEn ?? ""), statusEn ?? "");
check("html lang=en", await page.evaluate(() => document.documentElement.lang === "en"));
await page.screenshot({ path: "screenshots/ext4-english.png" });

// 5) 语言持久化 + 切回中文
await page.goto("about:blank");
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
check("重开后仍是英文", (await page.locator("#q").getAttribute("placeholder")) === "Search Google or type a URL");
await page.locator("#langtoggle").click();
await page.waitForTimeout(1000);
check("可切回中文", (await page.locator("#q").getAttribute("placeholder")) === "在 Google 搜索,或输入网址");

// 6) 弹窗标题也随语言(当前中文)
await page.goto(`chrome-extension://${extId}/popup.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
check("弹窗标题中文", (await page.locator("#pagetitle").textContent()) === "每周新专雷达");
await page.locator("#langtoggle").click();
await page.waitForTimeout(400);
check("弹窗标题切英文", (await page.locator("#pagetitle").textContent()) === "Weekly Album Radar");

await ctx.close();
if (fails.length) {
  console.error(`\n${fails.length} 项失败: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\nALL EXT v4 QA PASSED");
