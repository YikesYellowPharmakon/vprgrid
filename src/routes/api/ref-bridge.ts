/**
 * RYM / AOTY 参考源刷新桥(开放 CORS):
 *   服务器直抓会被 Cloudflare 拦,所以应用把待刷新的用户页 URL 排队,
 *   浏览器插件在真实会话里打开页面、翻页收集,再把结果 POST 回来。
 *   GET  — 插件取待办,应用取已完成结果;
 *   POST — enqueue / complete / ack。
 */
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_BYTES = 8_000_000;
const MAX_ITEMS = 12000;

type Kind = "rym" | "aoty";
type Item = { artist: string; title: string; date?: string; pic?: string | null };
type Job = { url: string; kind: Kind; at: string };
type Result = { url: string; kind: Kind; items: Item[]; at: string };

let jobs: Job[] = [];
let results: Result[] = [];

function urlKey(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.searchParams.delete("vprrefresh");
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return url.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

export const Route = createFileRoute("/api/ref-bridge")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () =>
        new Response(JSON.stringify({ jobs, results }), {
          headers: { "Content-Type": "application/json", ...CORS },
        }),
      POST: async ({ request }) => {
        try {
          const text = await request.text();
          if (!text || text.length > MAX_BYTES) {
            return new Response(JSON.stringify({ error: "bad payload" }), { status: 400, headers: CORS });
          }
          const body = JSON.parse(text) as {
            action?: string;
            jobs?: Array<{ url?: string; kind?: string }>;
            url?: string;
            kind?: string;
            items?: Item[];
            urls?: string[];
          };
          if (body.action === "enqueue" && Array.isArray(body.jobs)) {
            const at = new Date().toISOString();
            for (const j of body.jobs) {
              if (!j.url || (j.kind !== "rym" && j.kind !== "aoty")) continue;
              const key = urlKey(j.url);
              jobs = jobs.filter((x) => urlKey(x.url) !== key);
              jobs.push({ url: j.url, kind: j.kind, at });
            }
            return new Response(JSON.stringify({ ok: true, queued: jobs.length }), {
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }
          if (body.action === "complete" && body.url && (body.kind === "rym" || body.kind === "aoty")) {
            const items = Array.isArray(body.items)
              ? body.items
                  .filter((x) => x && typeof x.artist === "string" && typeof x.title === "string")
                  .slice(0, MAX_ITEMS)
              : [];
            const key = urlKey(body.url);
            jobs = jobs.filter((x) => urlKey(x.url) !== key);
            results = results.filter((x) => urlKey(x.url) !== key);
            results.push({ url: body.url, kind: body.kind, items, at: new Date().toISOString() });
            return new Response(JSON.stringify({ ok: true, n: items.length }), {
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }
          if (body.action === "ack" && Array.isArray(body.urls)) {
            const keys = new Set(body.urls.map(urlKey));
            results = results.filter((x) => !keys.has(urlKey(x.url)));
            return new Response(JSON.stringify({ ok: true }), {
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
