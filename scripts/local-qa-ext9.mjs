/* 插件 QA v9:免复制直连同步(应用自动推 → 插件自动拉,主题跟着走);
   新标签页小组件(时钟 / 天气 / 音乐快讯);毛玻璃大框;墙宽滑杆调整并记住;
   Matrix 雨三层新瓦片。 */
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const EXT = resolve("extension");
const PROFILE = resolve("screenshots/.ext-profile10");
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

// 0) 在应用里选一个有辨识度的主题(y2k),让自动推送把它送进 /api/sync
const app = await ctx.newPage();
await app.goto("http://127.0.0.1:8080", { waitUntil: "domcontentloaded" });
await app.evaluate(() => {
  localStorage.setItem("grain-friday-v4", JSON.stringify({ state: { theme: "y2k" }, version: 3 }));
});
await app.reload({ waitUntil: "domcontentloaded" });
await app.waitForSelector("h1", { timeout: 60000 });
// Matrix 雨新瓦片在应用里的验证(先切回 matrix 之前,顺便查 y2k 推送)
// 轮询最多 20s:等 1.2s 防抖 + rehydrate 后的推送真正落地
const pushed = await app.evaluate(async () => {
  for (let i = 0; i < 40; i++) {
    const r = await fetch("/api/sync");
    const j = await r.json();
    if (j.code) {
      const p = JSON.parse(j.code);
      if (p.theme?.id === "y2k") return { ok: true, theme: p.theme.id, entries: p.entries?.length ?? 0 };
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  return { ok: false };
});
check("应用自动推送 /api/sync(免复制)", pushed.ok && pushed.theme === "y2k", JSON.stringify(pushed));

// 1) 插件设置只填地址,不粘任何同步码
const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/options.html`);
await page.fill("#base", "http://127.0.0.1:8080");
await page.click("#save");
await page.waitForTimeout(400);

// 2) 新标签页:直连拉取 → 主题自动变 y2k;小组件;毛玻璃;滑杆
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
await page.waitForTimeout(800);
const nt = await page.evaluate(() => {
  const wb = document.querySelector(".wallbox");
  const cs = getComputedStyle(wb);
  return {
    theme: document.documentElement.dataset.theme,
    clock: document.getElementById("clock").textContent,
    date: document.getElementById("wdate").textContent,
    newsItems: document.querySelectorAll("#newslist li").length,
    newsIsDim: Boolean(document.querySelector("#newslist .newsdim")),
    blur: cs.backdropFilter,
    wallW: Math.round(wb.getBoundingClientRect().width),
    searchW: Math.round(document.querySelector(".gsearch input").getBoundingClientRect().width),
  };
});
check("直连同步生效:新标签页主题 = y2k(未粘同步码)", nt.theme === "y2k", nt.theme);
check("时钟在走", /\d{1,2}:\d{2}/.test(nt.clock), `${nt.clock} / ${nt.date}`);
check("音乐快讯已渲染(或显示占位)", nt.newsItems > 0, `items=${nt.newsItems} dim=${nt.newsIsDim}`);
check("大框毛玻璃(blur ≥ 20px)", /blur\(2\dpx\)/.test(nt.blur), nt.blur);
check("默认墙宽 800 且与搜索栏等宽", Math.abs(nt.wallW - 800) <= 4 && Math.abs(nt.wallW - nt.searchW) <= 4, `wall=${nt.wallW} search=${nt.searchW}`);

// 3) 滑杆调宽 → 即时生效并记住
await page.evaluate(() => {
  const s = document.getElementById("wallsize");
  s.value = "1000";
  s.dispatchEvent(new Event("input", { bubbles: true }));
  s.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(400);
const w1 = await page.evaluate(() => Math.round(document.querySelector(".wallbox").getBoundingClientRect().width));
check("滑杆调宽即时生效(1000px)", Math.abs(w1 - 1000) <= 4, `w=${w1}`);
await page.reload();
await page.waitForSelector(".card, .empty, .error", { timeout: 120000 });
const w2 = await page.evaluate(() => Math.round(document.querySelector(".wallbox").getBoundingClientRect().width));
check("刷新后墙宽被记住", Math.abs(w2 - 1000) <= 4, `w=${w2}`);
await page.waitForTimeout(2500);
await page.screenshot({ path: "screenshots/ext9-newtab.png" });

// 4) Matrix 雨新瓦片(应用端):三层新尺寸 + 动画在跑
await app.evaluate(() => {
  localStorage.setItem("grain-friday-v4", JSON.stringify({ state: { theme: "matrix" }, version: 3 }));
});
await app.reload({ waitUntil: "domcontentloaded" });
await app.waitForSelector("h1", { timeout: 60000 });
await app.waitForTimeout(1200);
const rain = await app.evaluate(() => {
  const cs = getComputedStyle(document.getElementById("bgfx"), "::before");
  return { size: cs.backgroundSize, anim: cs.animationName, layers: cs.backgroundImage.split("url(").length - 1 };
});
check(
  "Matrix 三层新瓦片(240/320/400 宽)",
  rain.size === "240px 420px, 320px 560px, 400px 700px" && rain.layers === 3 && rain.anim.includes("fx-matrix-rain"),
  `${rain.size} · layers=${rain.layers}`,
);
await app.screenshot({ path: "screenshots/ext9-matrix-app.png" });

await ctx.close();
if (fails.length) {
  console.error(`\n${fails.length} 项失败: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\nALL EXT v9 QA PASSED");
