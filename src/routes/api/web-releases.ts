/**
 * RYM / AOTY 新发行现场导入:
 *   GET  — 当前池统计 + 待打开的新发行页任务;
 *   POST ingest  — 插件把本页新专写入扫描池(无条件,只去重);
 *   POST enqueue-new — 应用点按钮,让插件后台打开 RYM/AOTY 新发行页。
 */
import { createFileRoute } from "@tanstack/react-router";
import { ingestWebItems, webPoolStats, type WebItem } from "@/lib/catalog/web-pool";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_BYTES = 2_000_000;

type Job = { url: string; kind: "rym" | "aoty"; at: string };
let jobs: Job[] = [];

function defaultJobs(): Job[] {
  const year = new Date().getFullYear();
  const month = new Date().toISOString().slice(0, 7);
  const at = new Date().toISOString();
  return [
    { url: "https://www.albumoftheyear.org/releases/", kind: "aoty", at },
    { url: "https://www.albumoftheyear.org/releases/this-week/", kind: "aoty", at },
    { url: `https://rateyourmusic.com/charts/top/album/${year}/`, kind: "rym", at },
    { url: `https://rateyourmusic.com/charts/top/album/${month}/`, kind: "rym", at },
    { url: "https://rateyourmusic.com/charts/top/album/new/", kind: "rym", at },
  ];
}

function asItems(raw: unknown): WebItem[] {
  if (!Array.isArray(raw)) return [];
  const today = new Date().toISOString().slice(0, 10);
  const out: WebItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const artist = String(o.artist ?? "").trim();
    const title = String(o.title ?? "").trim();
    if (!artist || !title) continue;
    const source = o.source === "rym" ? "rym" : "aoty";
    let date = String(o.date ?? "").slice(0, 10);
    if (date.length < 10) date = today;
    out.push({
      source,
      artist,
      title,
      date,
      type: o.type === "EP" ? "EP" : "Album",
      userScore: typeof o.userScore === "number" ? o.userScore : null,
      cover: typeof o.cover === "string" ? o.cover : null,
      url: typeof o.url === "string" ? o.url : "",
    });
  }
  return out.slice(0, 4000);
}

export const Route = createFileRoute("/api/web-releases")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () =>
        new Response(JSON.stringify({ jobs, stats: webPoolStats() }), {
          headers: { "Content-Type": "application/json", ...CORS },
        }),
      POST: async ({ request }) => {
        try {
          const text = await request.text();
          if (!text || text.length > MAX_BYTES) {
            return new Response(JSON.stringify({ error: "bad payload" }), { status: 400, headers: CORS });
          }
          const body = JSON.parse(text) as { action?: string; items?: unknown; urls?: string[] };
          if (body.action === "enqueue-new") {
            jobs = defaultJobs();
            return new Response(JSON.stringify({ ok: true, queued: jobs.length }), {
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }
          if (body.action === "ack" && Array.isArray(body.urls)) {
            const drop = new Set(body.urls.map((u) => u.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase()));
            jobs = jobs.filter((j) => !drop.has(j.url.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase()));
            return new Response(JSON.stringify({ ok: true }), {
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }
          if (body.action === "ingest" || Array.isArray(body.items)) {
            const result = ingestWebItems(asItems(body.items));
            return new Response(JSON.stringify({ ok: true, ...result, stats: webPoolStats() }), {
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }
          return new Response(JSON.stringify({ error: "bad action" }), { status: 400, headers: CORS });
        } catch {
          return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: CORS });
        }
      },
    },
  },
});
