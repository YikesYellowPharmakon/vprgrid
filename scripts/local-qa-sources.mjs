/* 多源参考订阅 QA:
 * 1. 旧数据迁移(refPlaylist/refExtras → refSources)
 * 2. 订阅源列表(内置源、开关)
 * 3. 粘贴导入(逐行文本)+ RYM CSV
 * 4. 艺人追踪(真网 MusicBrainz 全分页)
 * 5. 导入桥 #refimport=(模拟插件递送)
 * 6. 同步码复制
 * 7. /api/radar 只读接口(CORS 头 + 数据形状)
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:8080";
mkdirSync("screenshots", { recursive: true });

const errors = [];
const fails = [];
function check(name, ok) {
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
  if (!ok) fails.push(name);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

/* —— 1. 旧数据迁移 —— */
console.log("— 旧数据迁移");
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  const old = {
    state: {
      refPlaylist: {
        id: "999",
        name: "旧自定义歌单",
        trackCount: 2,
        entries: [
          { albumId: 111, title: "Old Album A", artist: "Old Artist A", date: "2026-03-06", songId: 1, song: "t", pic: null },
          { albumId: 222, title: "Old Album B", artist: "Old Artist B", date: "2026-04-10", songId: 2, song: "t", pic: null },
        ],
      },
      refExtras: [
        { albumId: -333, title: "Extra Album", artist: "Extra Artist", date: "2026-05-01", songId: 0, song: "", pic: null },
      ],
    },
    version: 0,
  };
  localStorage.setItem("grain-friday-v4", JSON.stringify(old));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const migrated = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("grain-friday-v4"));
  return raw?.state?.refSources?.map((s) => ({ kind: s.kind, enabled: s.enabled, n: s.entries.length }));
});
check("迁移生成 3 个源(内置+网易云+手动)", migrated?.length === 3);
check("旧歌单迁移后内置源关闭", migrated?.[0]?.kind === "builtin" && migrated?.[0]?.enabled === false);
check("网易云源 2 张、手动源 1 张", migrated?.[1]?.n === 2 && migrated?.[2]?.n === 1);

/* —— 2. 重置为全新状态,检查内置源 —— */
console.log("— 订阅源面板");
await page.evaluate(() => localStorage.removeItem("grain-friday-v4"));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "参考设置" }).first().click();
await page.waitForTimeout(600);
check("面板出现「内置默认参考」", await page.getByText("内置默认参考").first().isVisible());
check("有「订阅链接」入口", await page.getByText("订阅链接").isVisible());
check("有「追踪艺人」入口", await page.getByText("追踪艺人").isVisible());
check("有「粘贴导入」入口", await page.getByText("粘贴导入(RYM/AOTY 兜底)").isVisible());
await page.screenshot({ path: "screenshots/sources-panel.png" });

/* —— 3. 粘贴导入 —— */
console.log("— 粘贴导入");
await page.getByPlaceholder("给这份参考起个名字(可选)").fill("QA 粘贴清单");
await page
  .locator("textarea")
  .fill("Kali Malone - All Life Long (2024)\nSarah Davachi - Cantus, Descant (2020)\nKMRU - Peel (2020)");
await page.getByRole("button", { name: "解析并订阅" }).click();
await page.waitForTimeout(800);
check("粘贴源出现在列表", await page.getByText("QA 粘贴清单", { exact: true }).isVisible());
const pasteCount = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("grain-friday-v4"));
  const src = raw.state.refSources.find((s) => s.kind === "paste");
  return src?.entries.length;
});
check(`粘贴解析出 3 张(实际 ${pasteCount})`, pasteCount === 3);

// RYM CSV 变体
await page.getByPlaceholder("给这份参考起个名字(可选)").fill("QA CSV");
await page
  .locator("textarea")
  .fill('Title,First Name,Last Name,Release_Date\n"Vespers","Kali","Malone",2019/05/10\n"Two Sisters","Sarah","Davachi",20220902');
await page.getByRole("button", { name: "解析并订阅" }).click();
await page.waitForTimeout(800);
const csvSrc = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("grain-friday-v4"));
  const src = raw.state.refSources.find((s) => s.label === "QA CSV");
  return src ? { n: src.entries.length, d1: src.entries[0].date, d2: src.entries[1].date } : null;
});
check(`CSV 解析 2 张且日期归一(${csvSrc?.d1} / ${csvSrc?.d2})`, csvSrc?.n === 2 && csvSrc?.d1 === "2019-05-10" && csvSrc?.d2 === "2022-09-02");

/* —— 4. 艺人追踪(真网 MusicBrainz) —— */
console.log("— 艺人追踪(MusicBrainz 全分页,约 5–20 秒)");
await page.getByPlaceholder("如 Sarah Davachi、/f、Éliane Radigue").fill("Sarah Davachi");
await page.getByRole("button", { name: "追踪" }).click();
await page.waitForSelector("text=已订阅「Sarah Davachi」", { timeout: 120000 });
await page.waitForTimeout(600);
const artistSrc = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("grain-friday-v4"));
  const src = raw.state.refSources.find((s) => s.kind === "artist");
  return src ? { label: src.label, n: src.entries.length, autoSync: src.autoSync } : null;
});
check(`艺人源建立:${artistSrc?.label} · ${artistSrc?.n} 张`, Boolean(artistSrc && artistSrc.n >= 10));
check("艺人源默认自动刷新", artistSrc?.autoSync === true);
await page.screenshot({ path: "screenshots/sources-artist.png" });

/* —— 5. 同步码 —— */
console.log("— 同步码");
await page.getByRole("button", { name: "复制同步码" }).click();
await page.waitForTimeout(500);
const clip = await page.evaluate(() => navigator.clipboard.readText());
let syncOk = false;
try {
  const parsed = JSON.parse(clip);
  syncOk = Array.isArray(parsed.entries) && parsed.entries.length >= 300 && Array.isArray(parsed.taste);
} catch {
  syncOk = false;
}
check("同步码为合法 JSON 且含参考池与口味", syncOk);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* —— 6. 导入桥 #refimport= —— */
console.log("— 导入桥(模拟插件递送 RYM 列表)");
const payload = {
  kind: "rym",
  label: "RYM · qa_user",
  detail: "qa_user · 2026 年发行评分",
  url: "https://rateyourmusic.com/collection/qa_user/strm_relyear,ss.dd/2026",
  items: [
    { artist: "Bridge Artist", title: "Bridge Album One", date: "2026" },
    { artist: "Bridge Artist 2", title: "Bridge Album Two", date: "2026-02-13" },
  ],
};
const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
// 插件是开新标签页递送;这里先离开再进,避免同文档 hash 导航不触发挂载
await page.goto("about:blank");
await page.goto(`${BASE}/#refimport=${b64}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
check("导入桥落成 RYM 源", await page.getByText("RYM · qa_user", { exact: true }).isVisible());
const rymSrc = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("grain-friday-v4"));
  const src = raw.state.refSources.find((s) => s.kind === "rym");
  return src ? { n: src.entries.length, detail: src.detail } : null;
});
check(`RYM 源 2 张、参考类型标注(${rymSrc?.detail})`, rymSrc?.n === 2 && /2026 年发行评分/.test(rymSrc?.detail ?? ""));
check("hash 已清理", await page.evaluate(() => !window.location.hash));
await page.screenshot({ path: "screenshots/sources-bridge.png" });

/* —— 7. 关闭内置源:参考池数量变化 —— */
console.log("— 源开关");
const before = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("grain-friday-v4"));
  return raw.state.refSources.filter((s) => s.enabled).length;
});
const switches = page.locator('button[role="switch"]');
await switches.first().click(); // 内置源开关
await page.waitForTimeout(600);
const builtinOff = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("grain-friday-v4"));
  return raw.state.refSources.find((s) => s.kind === "builtin")?.enabled === false;
});
check(`内置源可关闭(此前 ${before} 个开启)`, builtinOff);
await switches.first().click(); // 恢复
await page.waitForTimeout(400);

/* —— 8. /api/radar —— */
console.log("— /api/radar");
const api = await page.evaluate(async (base) => {
  const res = await fetch(`${base}/api/radar`);
  return {
    cors: res.headers.get("access-control-allow-origin"),
    body: await res.json(),
  };
}, BASE);
check("CORS 开放", api.cors === "*");
check(
  `返回本周数据(扫描 ${api.body.scanned} · 雷达 ${api.body.auto?.length})`,
  typeof api.body.week === "string" && Array.isArray(api.body.auto) && api.body.auto.length > 0,
);

await browser.close();
const realErrors = errors.filter((e) => !/favicon|net::ERR_|status of 5\d\d|status of 4\d\d/.test(e));
console.log(JSON.stringify({ fails, errors: realErrors }, null, 2));
if (fails.length || realErrors.length) process.exit(1);
console.log("ALL SOURCES QA PASSED");
