import { createServerFn } from "@tanstack/react-start";
import { resolveAi, type AiOverride } from "./ai-shared";
import { ALL_GENRES } from "./genres";
import type { CoverReading } from "./types";

const SYSTEM = `You read experimental album sleeves (field recordings, drone, EAI, modern classical, glitch, IDM, free improvisation, musique concrete, lowercase, noise, plunderphonics, ambient). Score sleeveScore below 45 if the art is a crude placeholder, generic stock sunset, stretched JPEG, healing-frequency clipart, or missing design. Reply with compact JSON only, no markdown.`;

/**
 * AI 封面识别(服务端专用)。配置解析见 ai-shared.ts:
 * 用户页面自设的密钥优先,回退部署方环境变量;都没有则优雅降级。
 */
export const analyzeCover = createServerFn({ method: "POST" })
  .validator((d: { title: string; artist: string; coverUrl: string; taste: string[]; ai?: AiOverride }) => d)
  .handler(async ({ data }): Promise<{ ok: true; reading: CoverReading } | { ok: false; error: string }> => {
    const ai = resolveAi(data.ai);
    if (!ai) return { ok: false, error: "封面识别暂不可用(可在 AI 设置里填入你自己的密钥)" };

    const genreList = ALL_GENRES.map((g) => g.id).join(", ");
    const res = await fetch(`${ai.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify({
        model: ai.model,
        max_tokens: 280,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Album: "${data.title}" by ${data.artist}.
User taste ids: ${data.taste.join(", ") || "(none)"}.
Allowed matchedGenres ids: ${genreList}.
Score the sleeve as an object for an experimental listener:
{"sleeveScore":0-100,"aesthetic":"5-8 words English","matchedGenres":["id"],"notes":"two sentences in Simplified Chinese on composition, type, and whether it fits the taste"}`,
              },
              { type: "image_url", image_url: { url: data.coverUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return { ok: false, error: `识别失败（${res.status}）` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: "未能解析识别结果" };
    try {
      const parsed = JSON.parse(match[0]) as CoverReading;
      return {
        ok: true,
        reading: {
          sleeveScore: Math.max(0, Math.min(100, Number(parsed.sleeveScore) || 0)),
          aesthetic: String(parsed.aesthetic ?? "").slice(0, 80),
          matchedGenres: Array.isArray(parsed.matchedGenres)
            ? parsed.matchedGenres.map(String).slice(0, 6)
            : [],
          notes: String(parsed.notes ?? "").slice(0, 400),
        },
      };
    } catch {
      return { ok: false, error: "未能解析识别结果" };
    }
  });
