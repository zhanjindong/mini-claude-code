// Vision Language Model client for screenshot analysis
// Supports two protocols:
// 1. MiniMax proprietary: POST /v1/coding_plan/vlm with {prompt, image_url}
// 2. Standard OpenAI Vision: chat completions with image_url multimodal messages

import OpenAI from "openai";
import { getConfig } from "../../config.js";
import { PROVIDERS } from "../../engine.js";

const VLM_TIMEOUT = 30_000;

let _client: OpenAI | null = null;

/** Reset cached client (for testing or after reconfigure) */
export function resetVlmClient(): void {
  _client = null;
}

function getVlmClient(): OpenAI {
  if (_client) return _client;
  const config = getConfig();
  const provider = config.vlmProvider || config.provider;
  const preset = PROVIDERS[provider];
  _client = new OpenAI({
    apiKey: config.vlmApiKey || config.apiKey,
    baseURL: config.vlmBaseURL || preset?.baseURL || "https://api.openai.com/v1",
    maxRetries: 0,
  });
  return _client;
}

/**
 * MiniMax proprietary VLM protocol: POST /v1/coding_plan/vlm
 */
async function analyzeWithMinimax(
  base64Image: string,
  prompt: string,
): Promise<string> {
  const config = getConfig();
  const apiKey = config.vlmApiKey || config.apiKey;
  const baseURL = config.vlmBaseURL || PROVIDERS["minimax-vlm"]?.baseURL || "https://api.minimaxi.com";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VLM_TIMEOUT);

  try {
    const response = await fetch(`${baseURL}/v1/coding_plan/vlm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        image_url: `data:image/png;base64,${base64Image}`,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return `[截图分析失败: HTTP ${response.status} ${response.statusText}]`;
    }

    const data = (await response.json()) as any;
    const content = data.content || data.choices?.[0]?.message?.content;
    return content || "[截图分析失败: empty response]";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Standard OpenAI Vision protocol: chat completions with image_url
 */
async function analyzeWithOpenAI(
  base64Image: string,
  prompt: string,
): Promise<string> {
  const config = getConfig();
  const provider = config.vlmProvider || config.provider;
  const preset = PROVIDERS[provider];
  const model = config.vlmModel || preset?.defaultModel || "gpt-4o";

  const client = getVlmClient();
  const response = await client.chat.completions.create(
    {
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
                detail: "low",
              },
            },
          ],
        },
      ],
    },
    { timeout: VLM_TIMEOUT },
  );

  const content = response.choices[0]?.message?.content;
  return content || "[截图分析失败: empty response]";
}

export async function analyzeScreenshot(
  base64Image: string,
  prompt: string,
): Promise<string> {
  const config = getConfig();
  const vlmApiKey = config.vlmApiKey || config.apiKey;

  if (!vlmApiKey) {
    return "[VLM 未配置: 请运行 /model vlm 设置 VLM provider 和 API Key]";
  }

  const vlmProvider = config.vlmProvider;

  try {
    if (vlmProvider === "minimax-vlm") {
      return await analyzeWithMinimax(base64Image, prompt);
    }
    return await analyzeWithOpenAI(base64Image, prompt);
  } catch (err: any) {
    if (err.name === "AbortError" || err.code === "ETIMEDOUT") {
      return `[截图分析失败: request timeout (${VLM_TIMEOUT / 1000}s)]`;
    }
    return `[截图分析失败: ${err.message}]`;
  }
}
