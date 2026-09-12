/**
 * 本机档案:把参考订阅源、专辑列表、口味与偏好存到跑着应用的这台机器的磁盘上。
 * 浏览器清 cookies / 站点数据会把 localStorage 与 IndexedDB 一起清掉,而这份文件
 * 不在浏览器里,所以清完再打开应用能自动接回来。
 *
 *   GET  /api/vault        — 读最新档案(没有就 snapshot: null)
 *   GET  /api/vault?prev=1 — 读上一份(覆盖前留的那份,救急用)
 *   POST /api/vault        — 覆盖写,先把当前那份挪成 .prev 再原子替换
 *
 * 只读文件系统(Vercel 之类)上写入会失败,此时返回 ok:false,前端静默降级到只用浏览器存储。
 */
import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 32_000_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function paths() {
  const dir = process.env.VPRGRID_VAULT_DIR || `${process.cwd()}/.data`;
  return { dir, file: `${dir}/vault.json`, prev: `${dir}/vault.prev.json` };
}

function isPublicDemo(): boolean {
  return process.env.VITE_VPRGRID_DEMO === "1" || process.env.VITE_VPRGRID_DEMO === "true";
}

export const Route = createFileRoute("/api/vault")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (isPublicDemo()) return json({ ok: true, snapshot: null });
        const wantPrev = new URL(request.url).searchParams.get("prev") === "1";
        try {
          const { readFile } = await import("node:fs/promises");
          const p = paths();
          const raw = await readFile(wantPrev ? p.prev : p.file, "utf8");
          return json({ ok: true, snapshot: JSON.parse(raw) });
        } catch {
          // 没有档案、或这台机器读不到文件:都当作「还没有备份」
          return json({ ok: true, snapshot: null });
        }
      },
      POST: async ({ request }) => {
        if (isPublicDemo()) return json({ ok: false, reason: "readonly" });
        const text = await request.text();
        if (!text || text.length > MAX_BYTES) return json({ ok: false, reason: "size" }, 400);
        try {
          JSON.parse(text);
        } catch {
          return json({ ok: false, reason: "json" }, 400);
        }
        try {
          const { mkdir, writeFile, rename, rm } = await import("node:fs/promises");
          const p = paths();
          await mkdir(p.dir, { recursive: true });
          const tmp = `${p.file}.tmp`;
          await writeFile(tmp, text, "utf8");
          // 先留一份旧的再原子替换:写坏或写空也还有上一份可捞
          await rename(p.file, p.prev).catch(() => undefined);
          await rename(tmp, p.file);
          await rm(tmp, { force: true }).catch(() => undefined);
          return json({ ok: true, savedAt: new Date().toISOString(), bytes: text.length });
        } catch {
          return json({ ok: false, reason: "readonly" });
        }
      },
    },
  },
});
