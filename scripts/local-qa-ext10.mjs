/* 插件 QA v10:电影式 canvas 数字雨(应用 + 插件,无固定字符贴图);
   搜索栏固定加宽(920);大框宽高双滑杆、始终水平居中。 */
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const EXT = resolve("extension");
// profile 放系统临时目录:放项目里会触发 Vite 文件监听,导致应用页无限整页重载
const PROFILE = join(tmpdir(), "vaaapor-ext-profile11");
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
  viewport: { width: 1440, height: 900 },
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
const extId = new URL(sw.url()).host;

// ---------- 应用端:canvas 雨 + 无固定字符 ----------
const app = await ctx.newPage();
app.setDefaultTimeout(120000);
app.setDefaultNavigationTimeout(120000);
await app.goto("http://127.0.0.1:8080", { waitUntil: "domcontentloaded" });
await app.waitForSelector("h1", { timeout: 60000 });
await app.waitForSelector("#bgfx canvas", { timeout: 60000 }); // 等水合完成、雨挂载
const appRain = await app.evaluate(() => {
  const cv = document.querySelector("#bgfx canvas");
  const before = getComputedStyle(document.getElementById("bgfx"), "::before");
  const htmlBg = getComputedStyle(document.documentElement).backgroundImage;
  return {
    hasCanvas: Boolean(cv),
    canvasSized: cv ? cv.width > 100 && cv.height > 100 : false,
    beforeHasTiles: before.backgroundImage.includes("url("),
    htmlHasGlyphTile: htmlBg.includes("data:image/svg"),
  };
});
check("应用:canvas 雨已挂载且有尺寸", appRain.hasCanvas && appRain.canvasSized, JSON.stringify(appRain));
check("应用:固定字符贴图已全部移除(动效层 + 静态底)", !appRain.beforeHasTiles && !appRain.htmlHasGlyphTile);
// 帧间对比:同一坐标的像素应随时间变化(说明字符在滚动/变异,而非静止贴图)
// dev 下 Vite 可能整页重载,取样带重试
const samplePx = async () => {
  for (let i = 0; i < 3; i++) {
    try {
      await app.waitForSelector("#bgfx canvas", { state: "attached", timeout: 30000 });
      return await app.evaluate(() => {
        const cv = document.querySelector("#bgfx canvas");
        return cv.getContext("2d").getImageData(0, 0, 200, 400).data.reduce((a, b) => a + b, 0);
      });
    } catch {
      await app.waitForTimeout(1500);
    }
  }
  throw new Error("sample failed");
};
const px1 = await samplePx();
await app.waitForTimeout(1200);
const px2 = await samplePx();
check("应用:雨在逐帧滚动(画布内容随时间变化)", px1 !== px2 && px1 > 0, `${px1} → ${px2}`);
await app.screenshot({ path: "screenshots/ext10-matrix-app.png" });

// ---------- 插件端:雨 + 搜索栏固定 + 双滑杆 + 居中 ----------
const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/options.html`);
await page.fill("#base", "http://127.0.0.1:8080");
await page.click("#save");
await page.waitForTimeout(400);
// 清掉直连同步可能带来的非 matrix 主题:重置为默认(无 syncCode 时默认 matrix,
// 但上一轮应用主题若是别的会被直连覆盖——先把应用主题固定为 matrix)
await app.evaluate(() => {
  localStorage.setItem("grain-friday-v4", JSON.stringify({ state: { theme: "matrix" }, version: 3 }));
});
await app.reload({ waitUntil: "domcontentloaded" });
await app.waitForSelector("h1", { timeout: 60000 });
await app.waitForTimeout(4000); // 等自动推送

await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
await page.waitForTimeout(1000);
const nt = await page.evaluate(() => {
  const wb = document.querySelector(".wallbox");
  const r = wb.getBoundingClientRect();
  const search = document.querySelector(".gsearch").getBoundingClientRect();
  const card = document.querySelector(".stack .card");
  return {
    theme: document.documentElement.dataset.theme,
    hasCanvas: Boolean(document.querySelector("#bgfx canvas")),
    searchW: Math.round(search.width),
    wallW: Math.round(r.width),
    centered: Math.abs(r.left - (window.innerWidth - r.right)) <= 3,
    cardW: card ? Math.round(card.getBoundingClientRect().width) : 0,
    sliders: Boolean(document.getElementById("wallsize") && document.getElementById("wallhsize")),
  };
});
check("插件:matrix 主题 + canvas 雨运行", nt.theme === "matrix" && nt.hasCanvas, JSON.stringify({ theme: nt.theme, canvas: nt.hasCanvas }));
check("搜索栏固定 920 宽", nt.searchW === 920, `w=${nt.searchW}`);
check("大框默认 920 与搜索栏对齐且居中", nt.wallW === 920 && nt.centered, `wall=${nt.wallW} centered=${nt.centered}`);
check("双滑杆存在(↔ / ↕)", nt.sliders);
check("封面默认 128", nt.cardW === 128, `card=${nt.cardW}`);

// 调宽 → 仍居中;调高 → 封面变大;都记住
await page.evaluate(() => {
  for (const [id, v] of [["wallsize", "1100"], ["wallhsize", "180"]]) {
    const s = document.getElementById(id);
    s.value = v;
    s.dispatchEvent(new Event("input", { bubbles: true }));
    s.dispatchEvent(new Event("change", { bubbles: true }));
  }
});
await page.waitForTimeout(400);
const after = await page.evaluate(() => {
  const r = document.querySelector(".wallbox").getBoundingClientRect();
  const card = document.querySelector(".stack .card").getBoundingClientRect();
  return {
    wallW: Math.round(r.width),
    centered: Math.abs(r.left - (window.innerWidth - r.right)) <= 3,
    cardW: Math.round(card.width),
  };
});
check("调宽 1100 后仍居中", after.wallW === 1100 && after.centered, JSON.stringify(after));
check("调高 180 后封面变大", after.cardW === 180, `card=${after.cardW}`);
await page.reload();
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
const kept = await page.evaluate(() => ({
  wallW: Math.round(document.querySelector(".wallbox").getBoundingClientRect().width),
  cardW: Math.round(document.querySelector(".stack .card").getBoundingClientRect().width),
}));
check("刷新后宽高都被记住", kept.wallW === 1100 && kept.cardW === 180, JSON.stringify(kept));
await page.waitForTimeout(2000);
await page.screenshot({ path: "screenshots/ext10-newtab.png" });

await ctx.close();
if (fails.length) {
  console.error(`\n${fails.length} 项失败: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\nALL EXT v10 QA PASSED");
