/**
 * 插件直连同步(开放 CORS):
 *   POST /api/sync — 应用前端把最新的同步负载(口味 + 参考池 + 主题)推上来;
 *   GET  /api/sync — 插件打开新标签页/弹窗时直接拉取,免去复制粘贴同步码。
 * 负载存内存(本地运行时进程常驻足够;Vercel 冷启动丢失时插件自动回退到
 * 已保存的同步码)。不含任何敏感信息,只有公开的专辑清单与配色。
 */
import { createFileRoute } from "@tanstack/react-router";
import { getLatestSyncRaw, setLatestSyncCode } from "@/lib/catalog/sync-store";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_BYTES = 8_000_000;

export const Route = createFileRoute("/api/sync")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () =>
        new Response(JSON.stringify(getLatestSyncRaw() ?? {}), {
          headers: { "Content-Type": "application/json", ...CORS },
        }),
      POST: async ({ request }) => {
        try {
          const text = await request.text();
          if (!text || text.length > MAX_BYTES) {
            return new Response(JSON.stringify({ error: "bad payload" }), { status: 400, headers: CORS });
          }
          const parsed = JSON.parse(text) as { entries?: unknown };
          if (!parsed || !Array.isArray(parsed.entries)) {
            return new Response(JSON.stringify({ error: "bad payload" }), { status: 400, headers: CORS });
          }
          setLatestSyncCode(text);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch {
          return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: CORS });
        }
      },
    },
  },
});
