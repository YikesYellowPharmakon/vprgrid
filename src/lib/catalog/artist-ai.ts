/**
 * 艺人 AI 背景分析(服务端专用,密钥不进浏览器)。
 * 四个维度:个人作品 / 风格谱系 / 互联网可查的成就与评价 / 相似艺人团体。
 * 铁律:宁缺毋滥 —— 模型不确定该名字对应哪位艺人、或某维度无可靠公开资料时,
 * 该字段留空(空数组/空字符串),前端整块隐藏,绝不编造。
 * 接口配置与封面识别共用:用户填写或环境变量 AI_API_KEY / AI_BASE_URL / AI_MODEL。
 */
import { createServerFn } from "@tanstack/react-start";
import { resolveAi, type AiOverride } from "./ai-shared";

export type ArtistNote = {
  /** 代表作品(最多 5 个,含年份)。 */
  works: string[];
  /** 风格谱系:源流、场景、脉络,1–2 句。 */
  lineage: string;
  /** 互联网可查询到的成就与评价(厂牌/奖项/媒体),1–2 句。 */
  achievements: string;
  /** 相似艺人或团体(最多 6 个)。 */
  similar: string[];
};

const SYSTEM = `你是严谨的音乐资料编辑,只依据你可靠掌握的公开资料回答。铁律:宁缺毋滥。
- 如果不能确认这个名字具体对应哪位艺人(重名/过于生僻/信息矛盾),所有字段一律留空;
- 某个维度没有可靠信息,该字段留空(空字符串或空数组),绝不推测、绝不编造;
- 简体中文回答,艺名/专辑名/厂牌名保留原文。
只输出紧凑 JSON,无 markdown,字段:
{"works": string[](代表作品,最多5个,格式"《作品》(年份)"), "lineage": string(风格谱系:源流/场景/脉络,1-2句), "achievements": string(互联网可查的成就与评价:厂牌、奖项、媒体评价,1-2句), "similar": string[](相似艺人或团体,最多6个)}`;

function asStringArray(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, cap);
}

export const analyzeArtist = createServerFn({ method: "POST" })
  .validator((d: { artist: string; albumTitle: string; ai?: AiOverride }) => d)
  .handler(async ({ data }): Promise<{ ok: true; note: ArtistNote } | { ok: false; error: string }> => {
    const ai = resolveAi(data.ai);
    if (!ai) return { ok: false, error: "艺人分析暂不可用(可在 AI 设置里填入你自己的密钥)" };

    try {
      const res = await fetch(`${ai.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ai.apiKey}`,
        },
        body: JSON.stringify({
          model: ai.model,
          max_tokens: 600,
          temperature: 0.1,
          messages: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: `艺名:${data.artist}\n参考专辑(用于消歧,确认是同一位艺人再作答):《${data.albumTitle}》\n若无法确认对应艺人,全部字段留空。`,
            },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return { ok: false, error: `AI 接口 ${res.status}` };
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = body.choices?.[0]?.message?.content ?? "";
      const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(jsonText) as Partial<ArtistNote>;
      const note: ArtistNote = {
        works: asStringArray(parsed.works, 5),
        lineage: typeof parsed.lineage === "string" ? parsed.lineage.trim() : "",
        achievements: typeof parsed.achievements === "string" ? parsed.achievements.trim() : "",
        similar: asStringArray(parsed.similar, 6),
      };
      return { ok: true, note };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "分析失败" };
    }
  });
