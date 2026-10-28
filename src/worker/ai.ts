import type { Env } from "./types";

export const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export type AiMode = "split" | "breakdown";

const PROMPTS: Record<AiMode, string> = {
  split:
    "あなたはタスク整理のアシスタントです。ユーザーのメモを読み、実行可能なタスクに分割してください。" +
    "各タスクは日本語で、動詞で終わる30文字以内の簡潔な文にします。重複や挨拶は除き、最大8件。",
  breakdown:
    "あなたはタスク分解のアシスタントです。与えられたタスクを、順番に実行できる具体的なサブタスクに分解してください。" +
    "各サブタスクは日本語で、動詞で終わる30文字以内の簡潔な文にします。3〜6件。",
};

const SCHEMA = {
  type: "object",
  properties: { tasks: { type: "array", items: { type: "string" } } },
  required: ["tasks"],
};

export function normalizeTasks(raw: unknown): string[] {
  let value = raw;
  if (typeof raw === "string") {
    const match = raw.match(/\{[\s\S]*\}/);
    try {
      value = JSON.parse(match ? match[0] : raw);
    } catch {
      value = { tasks: raw.split("\n") };
    }
  }
  const list = (value as { tasks?: unknown })?.tasks;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.replace(/^\s*(?:[-*・•]|\d+[.)、])\s*/, "").trim())
    .filter((t) => t.length > 0 && t.length <= 200 && !seen.has(t) && (seen.add(t), true))
    .slice(0, 8);
}

function mockTasks(mode: AiMode, text: string): string[] {
  if (mode === "breakdown") return [`${text}の準備をする`, `${text}を進める`, `${text}を見直す`];
  return text.split(/[\n、。,]+/).map((s) => s.trim()).filter(Boolean);
}

export async function suggestTasks(env: Env, mode: AiMode, text: string): Promise<string[]> {
  if (env.AI_MOCK === "1") return normalizeTasks({ tasks: mockTasks(mode, text) });
  const result = (await env.AI.run(AI_MODEL as Parameters<Ai["run"]>[0], {
    messages: [
      { role: "system", content: PROMPTS[mode] + ' 出力は {"tasks": ["..."]} 形式のJSONのみ。' },
      { role: "user", content: text },
    ],
    response_format: { type: "json_schema", json_schema: SCHEMA },
    max_tokens: 512,
    temperature: 0.3,
  } as never)) as { response?: unknown };
  return normalizeTasks(result.response);
}
