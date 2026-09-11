/** QA:「参考设置」改名 + 中英文界面切换。 */
import { chromium } from "playwright";

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:8080";
const shots = "screenshots";
const fails = [];
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fails.push(name);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.setDefaultTimeout(30000);

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector("h1");

// 1) 中文默认:改名后的按钮
ok("标题为中文「每周新专雷达」", (await page.locator("h1").innerText()).includes("每周新专雷达"));
ok("口味栏按钮已改名「参考设置」", await page.getByRole("button", { name: "参考设置", exact: true }).count() >= 1);
ok("不再出现「参考歌单」", !(await page.content()).includes("参考歌单"));

// 打开参考面板确认标题(水合可能未完成,点击带重试)
for (let i = 0; i < 4; i++) {
  if (await page.locator("h2", { hasText: "参考设置" }).count()) break;
  await page.getByRole("button", { name: "参考设置", exact: true }).first().click();
  await page.waitForTimeout(1000);
}
ok("参考面板标题为「参考设置」", await page.locator("h2", { hasText: "参考设置" }).count() >= 1);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// 2) 切换到英文
await page.getByRole("button", { name: "Switch to English" }).click();
await page.waitForTimeout(400);
ok("英文标题 Weekly Album Radar", (await page.locator("h1").innerText()).includes("Weekly Album Radar"));
ok("英文标签页 This week", await page.getByText("This week", { exact: true }).count() >= 1);
const ph = await page.locator("input[placeholder]").first().getAttribute("placeholder");
ok("英文搜索占位", (ph ?? "").startsWith("Search all music"), ph ?? "");
ok("英文周标签含 Week", /Week \d+|Earlier/.test(await page.locator("select").first().innerText()));
ok("html lang=en", (await page.evaluate(() => document.documentElement.lang)) === "en");
await page.screenshot({ path: `${shots}/qa-lang-en.png`, fullPage: false });

// 英文参考面板
await page.getByRole("button", { name: "Reference", exact: true }).first().click();
await page.waitForTimeout(400);
ok("英文参考面板 Reference settings", await page.locator("h2", { hasText: "Reference settings" }).count() >= 1);
ok("英文订阅区 Subscribe to a link", await page.getByText("Subscribe to a link").count() >= 1);
await page.screenshot({ path: `${shots}/qa-lang-en-ref.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// 英文设置面板
await page.getByRole("button", { name: "Settings", exact: true }).click();
await page.waitForTimeout(400);
ok("英文设置面板 Ranking weights", await page.getByText("Ranking weights").count() >= 1);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// 3) 刷新后语言持久化
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("h1");
await page.waitForTimeout(800);
ok("刷新后仍是英文", (await page.locator("h1").innerText()).includes("Weekly Album Radar"));

// 4) 切回中文
await page.getByRole("button", { name: "切换到中文" }).click();
await page.waitForTimeout(400);
ok("切回中文", (await page.locator("h1").innerText()).includes("每周新专雷达"));
await page.screenshot({ path: `${shots}/qa-lang-zh.png` });

await browser.close();
if (fails.length) {
  console.error(`\n${fails.length} 项失败: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\n全部通过");
