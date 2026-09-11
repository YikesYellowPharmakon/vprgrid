/**
 * AI 口味画像(服务端专用,密钥不进浏览器)。
 * 输入:已启用的风格 + 参考池样本(高频艺人与专辑清单);
 * 输出:取向画像、审美关键词、建议开启/关闭的子类(只能从候选 id 里选,服务端再过滤一遍)、
 * 值得追踪的艺人。铁律与艺人分析相同:不确定就留空,绝不编造。
 * 接口配置与艺人/封面分析共用:用户填写或环境变量 AI_API_KEY / AI_BASE_URL / AI_MODEL。
 */
import { createServerFn } from "@tanstack/react-start";
import { resolveAi, type AiOverride } from "./ai-shared";

export type TasteNote = {
  /** 取向画像:2–3 句,描述这份参考池与口味透露的审美坐标。 */
  profile: string;
  /** 审美关键词(≤8)。 */
  keywords: string[];
  /** 建议开启的子类 id(来自候选列表,≤10)。 */
  enable: string[];
  /** 建议关闭的子类 id(来自已启用列表,≤6)。 */
  disable: string[];
  /** 值得追踪的艺人(≤8)。 */
  artists: string[];
};

const SYSTEM = `你是严谨的音乐审美分析师,依据用户的参考专辑池与已勾选风格,推断其真实取向。铁律:宁缺毋滥,不确定就留空,绝不编造。
- profile:2-3 句简体中文,点出核心审美坐标(场景/年代/质感/态度),避免空话;
- keywords:最多 8 个审美关键词(简体中文或通行英文术语);
- enable:从「候选子类 id」里挑最多 10 个与参考池明显契合、但用户尚未开启的子类,只能用给出的 id 原文;没有把握就给空数组;
- disable:从「已启用子类 id」里挑最多 6 个与参考池明显不合的,只能用给出的 id 原文;没有把握就给空数组;
- artists:最多 8 个值得追踪新发行的艺人(与参考池气质相近、仍活跃),不确定就少给或留空。
只输出紧凑 JSON,无 markdown,字段:{"profile": string, "keywords": string[], "enable": string[], "disable": string[], "artists": string[]}`;

function strArr(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, cap);
}

export const analyzeTaste = createServerFn({ method: "POST" })
  .validator(
    (d: {
      /** 已启用子类:"id|标签" 行,≤400。 */
      genresOn: string[];
      /** 未启用的候选子类:"id|标签" 行,≤400。 */
      candidates: string[];
      /** 参考池高频艺人:"艺人 ×N",≤30。 */
      topArtists: string[];
      /** 参考池样本:"艺人 - 专辑 (年份)",≤120。 */
      refSample: string[];
      ai?: AiOverride;
    }) => d,
  )
  .handler(async ({ data }): Promise<{ ok: true; note: TasteNote } | { ok: false; error: string }> => {
    const ai = resolveAi(data.ai);
    if (!ai) return { ok: false, error: "AI 口味画像暂不可用(可在 AI 设置里填入你自己的密钥)" };

    const onIds = new Set(data.genresOn.slice(0, 400).map((l) => l.split("|")[0]));
    const candIds = new Set(data.candidates.slice(0, 400).map((l) => l.split("|")[0]));

    const user = [
      `【参考池高频艺人】\n${data.topArtists.slice(0, 30).join("\n") || "(空)"}`,
      `【参考池专辑样本】\n${data.refSample.slice(0, 120).join("\n") || "(空)"}`,
      `【已启用子类 id|标签】\n${data.genresOn.slice(0, 400).join("\n") || "(空)"}`,
      `【候选子类 id|标签(未启用)】\n${data.candidates.slice(0, 400).join("\n") || "(空)"}`,
    ].join("\n\n");

    try {
      const res = await fetch(`${ai.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ai.apiKey}` },
        body: JSON.stringify({
          model: ai.model,
          max_tokens: 900,
          temperature: 0.2,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) return { ok: false, error: `AI 接口 ${res.status}` };
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = body.choices?.[0]?.message?.content ?? "";
      const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(jsonText) as Partial<TasteNote>;
      const note: TasteNote = {
        profile: typeof parsed.profile === "string" ? parsed.profile.trim() : "",
        keywords: strArr(parsed.keywords, 8),
        // 建议只认候选/已启用列表里的 id,防幻觉
        enable: strArr(parsed.enable, 10).filter((id) => candIds.has(id)),
        disable: strArr(parsed.disable, 6).filter((id) => onIds.has(id)),
        artists: strArr(parsed.artists, 8),
      };
      return { ok: true, note };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "分析失败" };
    }
  });
