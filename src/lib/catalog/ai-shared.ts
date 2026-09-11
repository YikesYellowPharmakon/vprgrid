/**
 * AI 接口配置解析(服务端)。
 * 只使用用户在「AI 设置」里填的三项,或部署时显式写入的环境变量。
 * 没有内置服务商地址或模型名。
 */
import { createServerFn } from "@tanstack/react-start";

/** 用户自设的 AI 接口(存 localStorage,由客户端随调用传入)。 */
export type AiOverride = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export type AiResolved = { apiKey: string; baseUrl: string; model: string };

export function resolveAi(override?: AiOverride): AiResolved | null {
  const apiKey = override?.apiKey?.trim() || process.env.AI_API_KEY || "";
  const baseUrl = (override?.baseUrl?.trim() || process.env.AI_BASE_URL || "").replace(/\/+$/, "");
  const model = override?.model?.trim() || process.env.AI_MODEL || "";
  if (!apiKey || !baseUrl || !model) return null;
  return { apiKey, baseUrl, model };
}

/** 连接测试:发一条最小的对话请求,验证密钥/地址/模型三件套是否可用。 */
export const testAi = createServerFn({ method: "POST" })
  .validator((d: { ai: AiOverride }) => d)
  .handler(async ({ data }): Promise<{ ok: true; model: string } | { ok: false; error: string }> => {
    const ai = resolveAi(data.ai);
    if (!ai) return { ok: false, error: "no-key" };
    try {
      const res = await fetch(`${ai.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ai.apiKey}` },
        body: JSON.stringify({
          model: ai.model,
          max_tokens: 4,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        const text = (await res.text()).slice(0, 160);
        return { ok: false, error: `HTTP ${res.status}${text ? ` · ${text}` : ""}` };
      }
      return { ok: true, model: ai.model };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "connect-failed" };
    }
  });
