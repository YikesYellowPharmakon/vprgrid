// QA:插件新标签页专辑墙应显示完整数量(参考 + 雷达),而不是 4 张空封面。
// 验证:radar 请求走 no-store;卡片数 >= 雷达 auto 数;封面图非空的占比合格。
import { chromium } from "playwright";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

const EXT = join(process.cwd(), "extension");
const PROFILE = mkdtempSync(join(tmpdir(), "vg-ext12-"));

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  args: [
    "--headless=new",
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--no-first-run",
  ],
});
ctx.setDefaultTimeout(120000);

let extId = "";
for (let i = 0; i < 40 && !extId; i++) {
  const sw = ctx.serviceWorkers();
  if (sw.length) extId = new URL(sw[0].url()).host;
  else await new Promise((r) => setTimeout(r, 500));
}
if (!extId) throw new Error("extension not loaded");

const page = await ctx.newPage();
let radarResp = null;
page.on("response", async (res) => {
  if (res.url().includes("/api/radar")) {
    try {
      radarResp = { status: res.status(), body: await res.json(), fromCache: res.fromServiceWorker() };
    } catch {}
  }
});
await page.goto(`chrome-extension://${extId}/newtab.html`);
await page.waitForSelector("#grid .card", { timeout: 120000 });
// 等封面像素真正落地(coverartarchive 跨域图较慢),至少 10 张 naturalWidth>0
await page
  .waitForFunction(
    () =>
      [...document.querySelectorAll("#grid .card img")].filter((i) => i.complete && i.naturalWidth > 0).length >= 10,
    { timeout: 60000 },
  )
  .catch(() => {});
await page.waitForTimeout(1000);

const counts = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("#grid .card")];
  const withCover = cards.filter((c) => c.querySelector("img[src]")).length;
  return {
    cards: cards.length,
    withCover,
    status: document.getElementById("status")?.textContent ?? "",
  };
});
console.log("radar API:", radarResp?.status, "auto=", radarResp?.body?.auto?.length, "partial=", radarResp?.body?.partial);
console.log("墙上卡片:", counts.cards, "带封面:", counts.withCover, "状态栏:", counts.status);

await page.screenshot({ path: "screenshots/ext12-newtab.png" });

const auto = radarResp?.body?.auto?.length ?? 0;
if (counts.cards < 10) throw new Error(`FAIL: 只有 ${counts.cards} 张卡片`);
if (counts.cards < auto) throw new Error(`FAIL: 卡片 ${counts.cards} < 雷达 ${auto}`);
if (counts.withCover / counts.cards < 0.8) throw new Error(`FAIL: 封面缺失过多 ${counts.withCover}/${counts.cards}`);
console.log("PASS");
await ctx.close();
