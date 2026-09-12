/**
 * Vercel 上 grok 注入器会丢掉 og:image（*.vercel.app 不当作公开主机）。
 * 这层包在它外面，给分享卡片补上标题 / 简介 / 图，方便微信、X、iMessage 展开。
 */
import { grokOgIdentity } from "virtual:grok-og-identity";

interface ShareEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

function hostOf(event: ShareEvent): string {
  return (
    event.req.headers.get("x-forwarded-host") ?? event.req.headers.get("host") ?? event.url.host
  )
    .split(",")[0]
    .trim()
    .split(":")[0]
    .toLowerCase();
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;");
}

function shareTags(host: string): string {
  const site = grokOgIdentity.site ?? {};
  const title = esc(String(site.title ?? "VprGrid.SYS").trim());
  const description = esc(String(site.description ?? "").trim());
  const origin = `https://${host}`;
  const image = `${origin}/og.jpg`;
  const tags = [
    `<meta property="og:url" content="${origin}/">`,
    `<meta property="og:site_name" content="VprGrid.SYS">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:image" content="${image}">`,
  ];
  if (description) tags.push(`<meta name="twitter:description" content="${description}">`);
  return tags.join("");
}

export default async function vercelShareMiddleware(
  event: ShareEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const result = await next();
  if (!(result instanceof Response) || !result.body) return result;
  if (!String(result.headers.get("content-type") ?? "").includes("text/html")) return result;
  if (result.headers.get("content-encoding")) return result;
  const host = hostOf(event);
  if (!host) return result;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  let done = false;
  const extra = shareTags(host);
  const transformed = result.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (done) {
          controller.enqueue(chunk);
          return;
        }
        pending += decoder.decode(chunk, { stream: true });
        const lower = pending.toLowerCase();
        if (!lower.includes("</head>")) return;
        if (!/property\s*=\s*["']og:image["']/i.test(pending)) {
          pending = pending.replace(/<\/head>/i, `${extra}</head>`);
        }
        controller.enqueue(encoder.encode(pending));
        pending = "";
        done = true;
      },
      flush(controller) {
        if (pending) controller.enqueue(encoder.encode(pending));
      },
    }),
  );
  const headers = new Headers(result.headers);
  headers.delete("content-length");
  return new Response(transformed, {
    status: result.status,
    statusText: result.statusText,
    headers,
  });
}
