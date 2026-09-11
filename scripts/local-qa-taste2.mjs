/** QA:口味扩库 + Baseline 预设 + 结果删除 + 参考设置多选/单选 + 单专辑直加。 */
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

// 1) Baseline 预设默认激活,主页芯片可见
const baselineChip = page.getByRole("button", { name: "Baseline", exact: true }).first();
ok("主页出现 Baseline 预设芯片", (await baselineChip.count()) >= 1);
const summary = await page.locator("span.text-xs.text-subtle.tabular-nums").first().innerText();
ok("口味摘要为 101/359(Baseline 默认)", summary.includes("101/359"), summary);

// 2) 母类卡片折叠:未启用母类聚合成虚线卡
ok("出现「还有 N 个母类未启用」卡片", (await page.getByText(/还有 \d+ 个母类未启用/).count()) >= 1);

// 3) 切到「全库」再切回 Baseline
await page.getByRole("button", { name: "全库", exact: true }).click();
await page.waitForTimeout(400);
const summary2 = await page.locator("span.text-xs.text-subtle.tabular-nums").first().innerText();
ok("全库预设 = 359/359", summary2.includes("359/359"), summary2);
ok("全库时虚线卡消失", (await page.getByText(/还有 \d+ 个母类未启用/).count()) === 0);
await page.screenshot({ path: `${shots}/qa-taste2-all.png` });
await baselineChip.click();
await page.waitForTimeout(400);
ok("切回 Baseline = 101/359", (await page.locator("span.text-xs.text-subtle.tabular-nums").first().innerText()).includes("101/359"));

// 4) 口味表:新母类存在 + Baseline 按钮
for (let i = 0; i < 4; i++) {
  if (await page.locator("h3", { hasText: "Hip Hop" }).count()) break;
  await page.getByRole("button", { name: "口味 A–Z", exact: true }).first().click();
  await page.waitForTimeout(900);
}
ok("口味表含新母类 Hip Hop", (await page.locator("h3", { hasText: "Hip Hop" }).count()) >= 1);
ok("口味表含新母类 Dance & Club", (await page.locator("h3", { hasText: "Dance & Club" }).count()) >= 1);
ok("口味表含新母类 Metal", (await page.locator("h3", { hasText: /^Metal$/ }).count()) >= 1);
ok("口味表有 Baseline 预设按钮", (await page.getByRole("button", { name: /核心 101 子类/ }).count()) >= 1);
await page.screenshot({ path: `${shots}/qa-taste2-sheet.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// 5) 结果删除:等自动雷达列表加载,点隐藏
await page.waitForSelector('button[aria-label="从结果中删除"]', { timeout: 120000 }).catch(() => null);
const hideButtons = page.locator('button[aria-label="从结果中删除"]');
const nHide = await hideButtons.count();
ok("列表出现「从结果中删除」按钮", nHide >= 1, `${nHide} 个`);
if (nHide >= 1) {
  const before = await hideButtons.count();
  await hideButtons.first().click();
  await page.waitForTimeout(600);
  ok("删除后出现撤销 toast", (await page.getByText(/已从结果中删除/).count()) >= 1);
  const after = await page.locator('button[aria-label="从结果中删除"]').count();
  ok("删除后列表条目减少", after < before, `${before} → ${after}`);
  // 撤销
  const undo = page.getByRole("button", { name: "撤销" });
  if (await undo.count()) {
    await undo.first().click();
    await page.waitForTimeout(600);
    const restored = await page.locator('button[aria-label="从结果中删除"]').count();
    ok("撤销后条目恢复", restored === before, `${restored}`);
  }
}
await page.screenshot({ path: `${shots}/qa-taste2-hide.png` });

// 6) 参考设置:批量控制 + 单专辑直加
for (let i = 0; i < 4; i++) {
  if (await page.locator("h2", { hasText: "参考设置" }).count()) break;
  await page.getByRole("button", { name: "参考设置", exact: true }).first().click();
  await page.waitForTimeout(900);
}
ok("参考面板打开", (await page.locator("h2", { hasText: "参考设置" }).count()) >= 1);
ok("有全选/全不选控制", (await page.getByRole("button", { name: "全不选", exact: true }).count()) >= 1);
ok("有源计数(N/N 个源参与参考)", (await page.getByText(/\d+\/\d+ 个源参与参考/).count()) >= 1);
ok("有添加单张专辑表单", (await page.getByText("添加单张专辑").count()) >= 1);

// 直加一张专辑
await page.getByPlaceholder("艺人 - 专辑名 (2026)").fill("QA Artist - QA Direct Album (2026)");
await page.getByRole("button", { name: "添加", exact: true }).click();
await page.waitForTimeout(700);
ok("专辑直加成功 toast", (await page.getByText(/已加入手动亲选/).count()) >= 1);
ok("出现手动亲选源", (await page.getByText("手动亲选", { exact: true }).count()) >= 1);

// 仅此源(solo)→ 只剩 1 个源启用,再全选恢复
const solo = page.getByRole("button", { name: "仅此源", exact: true });
ok("每个源有「仅此源」按钮", (await solo.count()) >= 2);
await solo.first().click();
await page.waitForTimeout(500);
ok("单选后计数为 1/N", (await page.getByText(/^1\/\d+ 个源参与参考$/).count()) >= 1);
await page.getByRole("button", { name: "全选", exact: true }).click();
await page.waitForTimeout(500);
const counter = await page.getByText(/\d+\/\d+ 个源参与参考/).first().innerText();
ok("全选后全部启用", /^(\d+)\/\1 /.test(counter), counter);
await page.screenshot({ path: `${shots}/qa-taste2-ref.png` });
await page.keyboard.press("Escape");

// 7) 移动端快查
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${shots}/qa-taste2-mobile.png` });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok("移动端无横向溢出", overflow <= 1, `${overflow}px`);

await browser.close();
if (fails.length) {
  console.error(`\n${fails.length} 项失败: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\n全部通过");
