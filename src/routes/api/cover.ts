/**
 * 封面代理:GET /api/cover?u=<上游封面地址>
 *
 * 同源代理换来三件事:一条 HTTP/2 连接多路复用(不再受同域 6 连接上限和逐个
 * archive.org 节点的 DNS + TLS 拖累)、服务端内存缓存复用、长 Cache-Control
 * 让刷新直接命中磁盘缓存。只放行图源白名单,不做通用转发。
 */
import { createFileRoute } from "@tanstack/react-router";
import { coverTarget, fetchCoverResolved, peekCover, type CoverHit } from "@/lib/catalog/cover-cache";

const HIT_MAX_AGE = 60 * 60 * 24 * 7;
/** 空结果别缓存太久:兜底检索源会抖,浏览器若把 204 存半天就再也看不见图。 */
const MISS_MAX_AGE = 60 * 10;

function send(hit: CoverHit, request: Request): Response {
  const headers = {
    ETag: hit.etag,
    "Cache-Control": `public, max-age=${HIT_MAX_AGE}, s-maxage=${HIT_MAX_AGE}, immutable`,
  };
  if (request.headers.get("if-none-match") === hit.etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(hit.body, {
    headers: { ...headers, "Content-Type": hit.type, "Content-Length": String(hit.body.byteLength) },
  });
}

/**
 * 原地址和艺人+专辑兜底都找不到图时回 204:
 * <img> 走 error 退回首字母,控制台不会刷 404。短缓存,避免把暂时失败锁死。
 */
function sendMiss(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": `public, max-age=${MISS_MAX_AGE}` } });
}

export const Route = createFileRoute("/api/cover")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const target = coverTarget(q.get("u"));
        const artist = q.get("artist");
        const title = q.get("title");
        if (!target && !(artist && title)) return new Response(null, { status: 400 });

        const cached = (target && peekCover(target)) || undefined;
        if (cached) return send(cached, request);

        const hit = await fetchCoverResolved({
          target,
          artist,
          title,
          large: q.get("lg") === "1",
        });
        return hit ? send(hit, request) : sendMiss();
      },
    },
  },
});
