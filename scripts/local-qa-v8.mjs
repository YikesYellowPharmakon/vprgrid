/** QA:品牌名 VprGrid.SYS + 回扫补遗 + Baseline 101 + RYM 专属导入路径。 */
import { chromium } from "playwright";

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:8080";
const shots = "screenshots";
const fails = [];
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fails.push(name);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
page.setDefaultTimeout(45000);

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector("h1");
await page.waitForTimeout(1500);

// 1) 品牌名
ok("头部品牌为 VprGrid.SYS", (await page.getByText(/VprGrid.SYS · \d{4}/).count()) >= 1);
const title = await page.title();
ok("页面标题含 VprGrid.SYS", title.includes("VprGrid.SYS"), title);

// 2) Baseline 默认 101/359,且不含 rock/internet 母类卡
const summary = await page.locator("span.text-xs.text-subtle.tabular-nums").first().innerText();
ok("默认口味为 Baseline 101/359", summary.includes("101/359"), summary);
ok("主页无 Rock & Post 母类卡", (await page.locator("button", { hasText: "Rock & Post" }).count()) === 0);

// 3) 回扫补遗:切到上一周,点回扫,等完成 toast
ok("周导航旁有回扫补遗按钮", (await page.getByRole("button", { name: "回扫补遗" }).count()) >= 1);
await page.locator('button[aria-label="上一周"]').first().click();
await page.waitForTimeout(2500);
const rescan = page.getByRole("button", { name: "回扫补遗" }).first();
ok("旧周仍显示回扫按钮", (await rescan.count()) >= 1);
await rescan.click();
ok("出现回扫开始 toast", (await page.getByText(/正在回扫/).count()) >= 1);
const done = await page
  .getByText(/回扫完成:本周扫描池 \d+ 张/)
  .first()
  .waitFor({ timeout: 120000 })
  .then(() => true)
  .catch(() => false);
ok("回扫完成 toast(含扫描数)", done);
await page.screenshot({ path: `${shots}/qa-v8-rescan.png` });

// 4) RYM 专属导入路径
for (let i = 0; i < 4; i++) {
  if (await page.locator("h2", { hasText: "参考设置" }).count()) break;
  await page.getByRole("button", { name: "参考设置", exact: true }).first().click();
  await page.waitForTimeout(900);
}
ok("参考面板打开", (await page.locator("h2", { hasText: "参考设置" }).count()) >= 1);
await page
  .getByPlaceholder(/rateyourmusic/)
  .fill("https://rateyourmusic.com/collection/QAUser/strm_relyear,ss.dd/2026");
await page.getByRole("button", { name: "订阅此链接", exact: true }).click();
await page.waitForTimeout(800);
ok("出现 RYM 专属导入卡片", (await page.getByText("RYM 专属导入").count()) >= 1);
ok("卡片识别出用户与参考类型", (await page.getByText(/RYM · QAUser · 2026 年发行评分/).count()) >= 1);
await page.screenshot({ path: `${shots}/qa-v8-rympath.png` });

// 粘贴解析建源
await page
  .getByPlaceholder("粘贴 RYM 导出 CSV,或每行「艺人 - 专辑 (年份)」", { exact: true })
  .fill("QA Rym Artist - Deep Cuts (2026)\nAnother Band - Slow Light (2025)");
await page.getByRole("button", { name: "解析并订阅此 RYM 链接" }).click();
await page.waitForTimeout(900);
ok("RYM 源建立(标签 RYM · QAUser)", (await page.getByText("RYM · QAUser", { exact: true }).count()) >= 1);
ok("导入 2 张 toast", (await page.getByText(/已订阅「RYM · QAUser」:2 张/).count()) >= 1);
ok("RYM 专属卡片已收起", (await page.getByText("RYM 专属导入").count()) === 0);
// RYM 源卡片上不应有「立即同步」
const rymCard = page
  .locator("div")
  .filter({ has: page.getByText("RYM · QAUser", { exact: true }) })
  .locator('button:has-text("立即同步")');
ok("RYM 源无「立即同步」按钮", (await rymCard.count()) === 0);
await page.screenshot({ path: `${shots}/qa-v8-rymsource.png` });

// 清理:删掉 QA 建的源,避免污染本地状态
const qaSource = page.locator("div.rounded-lg").filter({ has: page.getByText("RYM · QAUser", { exact: true }) });
const delBtn = qaSource.locator('button:has-text("删除")').first();
if (await delBtn.count()) {
  await delBtn.click();
  await page.waitForTimeout(400);
  ok("QA 源已清理", (await page.getByText("RYM · QAUser", { exact: true }).count()) === 0);
}
await page.keyboard.press("Escape");

await browser.close();
if (fails.length) {
  console.error(`\n${fails.length} 项失败: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\n全部通过");
