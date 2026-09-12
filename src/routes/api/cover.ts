/**
 * 封面代理:GET /api/cover?u=<上游封面地址>
 *
 * 同源代理换来三件事:一条 HTTP/2 连接多路复用(不再受同域 6 连接上限和逐个
 * archive.org 节点的 DNS + TLS 拖累)、服务端内存缓存复用、长 Cache-Control
 * 让刷新直接命中磁盘缓存。只放行图源白名单,不做通用转发。
 */
import { createFileRoute } from "@tanstack/react-router";
import { coverTarget, fetchCover, missedRecently, peekCover, type CoverHit } from "@/lib/catalog/cover-cache";

const HIT_MAX_AGE = 60 * 60 * 24 * 7;
const MISS_MAX_AGE = 60 * 60 * 12;

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
 * 上游没有这张封面(MusicBrainz 补充条目是乐观猜的地址,本来就常常没有图):
 * 回 204 空响应——图片解码失败会触发 <img> 的 error,前端退回首字母封面,
 * 而控制台不会像 404 那样刷一串红字。同样缓存一段时间,不再反复回源。
 */
function sendMiss(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": `public, max-age=${MISS_MAX_AGE}` } });
}

export const Route = createFileRoute("/api/cover")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = coverTarget(new URL(request.url).searchParams.get("u"));
        if (!target) return new Response(null, { status: 400 });

        const cached = peekCover(target);
        if (cached) return send(cached, request);
        if (missedRecently(target)) return sendMiss();

        const hit = await fetchCover(target);
        return hit ? send(hit, request) : sendMiss();
      },
    },
  },
});
