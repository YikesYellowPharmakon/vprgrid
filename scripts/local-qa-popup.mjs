// QA:工具栏弹窗墙(不依赖 MV3 扩展加载)
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const ROOT = join(process.cwd(), "extension");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

const items = Array.from({ length: 22 }, (_, i) => ({
  id: `a${i}`,
  artist: `Artist ${i}`,
  title: `Album ${i}`,
  date: "2026-09-11",
  pic: "",
  gold: i < 2,
}));
const syncCode = JSON.stringify({
  v: 4,
  taste: [],
  weights: { taste: 40, artist: 25, rating: 20, cover: 15 },
  theme: { id: "matrix" },
  entries: [],
  wall: { week: "2026-09-07", grain: "week", start: "2026-09-07", end: "2026-09-13", items },
});

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const file = join(ROOT, url.pathname === "/" ? "popup.html" : decodeURIComponent(url.pathname.slice(1)));
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    res.writeHead(404);
    res.end("missing");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 428, height: 600 } });
await page.addInitScript(
  ({ code }) => {
    const store = {
      appBase: "http://127.0.0.1:9",
      syncCode: code,
      wallY: 120,
      wallS: 200,
      wallGrain: "month",
      extLang: "zh",
    };
    const pick = (keys) => {
      if (!keys) return { ...store };
      if (typeof keys === "string") return { [keys]: store[keys] };
      if (Array.isArray(keys)) {
        const out = {};
        for (const k of keys) out[k] = store[k];
        return out;
      }
      const out = { ...keys };
      for (const k of Object.keys(keys)) if (k in store) out[k] = store[k];
      return out;
    };
    globalThis.chrome = {
      storage: {
        local: {
          get: async (keys) => pick(keys),
          set: async (obj) => Object.assign(store, obj),
        },
      },
      runtime: { sendMessage() {} },
      tabs: { query(_q, cb) { cb?.([]); }, create() {}, update() {} },
      windows: { update() {} },
    };
  },
  { code: syncCode },
);

const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/**", (route) => route.abort());
await page.goto(`${origin}/popup.html`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#grid .card", { timeout: 8000 });
await page.waitForTimeout(400);

const info = await page.evaluate(() => {
  const grid = document.getElementById("grid");
  const box = document.querySelector(".wallbox");
  const cards = [...grid.querySelectorAll(".card")];
  const more = Boolean(grid.querySelector(".morebox"));
  return {
    cards: cards.length,
    more,
    skel: grid.querySelectorAll(".skeleton").length,
    cols: getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length,
    transform: box ? getComputedStyle(box).transform : "",
    label: document.getElementById("weeklabel")?.textContent || "",
    weekOn: document.getElementById("grainweek")?.classList.contains("on"),
    monthOn: document.getElementById("grainmonth")?.classList.contains("on"),
    prerain: document.querySelectorAll(".prerain span").length,
    bodyH: document.body.getBoundingClientRect().height,
    wallTop: box?.getBoundingClientRect().top ?? -1,
    wallVisible: box ? box.getBoundingClientRect().bottom > box.getBoundingClientRect().top + 80 : false,
  };
});

mkdirSync("screenshots", { recursive: true });
await page.screenshot({ path: "screenshots/ext-popup-wall.png" });
await browser.close();
server.close();

const fails = [];
if (info.cards !== 16) fails.push(`cards=${info.cards}`);
if (!info.more) fails.push("missing morebox");
if (info.skel) fails.push(`skel=${info.skel}`);
if (info.cols !== 4) fails.push(`cols=${info.cols}`);
if (!info.weekOn || info.monthOn) fails.push("grain not week");
if (info.prerain) fails.push(`prerain=${info.prerain}`);
if (!info.wallVisible) fails.push("wall not visible");
if (/matrix\([^)]*,\s*1[0-9]{2}\s*\)/.test(info.transform)) fails.push(`wall-y leaked ${info.transform}`);
if (info.bodyH > 600) fails.push(`bodyH=${info.bodyH}`);
const realErrors = errors.filter((e) => !/favicon|net::ERR_|Failed to fetch|AbortError/.test(e));
console.log(JSON.stringify({ info, fails, errors: realErrors }, null, 2));
if (fails.length || realErrors.length) process.exit(1);
console.log("POPUP WALL QA PASSED");
