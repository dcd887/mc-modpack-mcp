const fs = require("node:fs");
const path = require("node:path");

const DASHSCOPE_URL =
  process.env.DASHSCOPE_BASE_URL ||
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";
const DEFAULT_MODEL = "qwen-turbo";
const REQUEST_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT =
  "你是一位经验丰富的 Minecraft 玩家和技术支持专家。请根据提供的整合包诊断数据，给出专业、易懂的分析和优化建议。用中文回答，语气友好，优先指出严重问题，控制在 800 字以内。不要输出任何 JSON 或代码块，直接输出自然语言报告。";

async function callDashScope(
  userPrompt: string,
  systemPrompt: string = SYSTEM_PROMPT,
  model: string = DEFAULT_MODEL,
): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY not set");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(DASHSCOPE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: { messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] },
        parameters: { result_format: "message" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data: any = await res.json();
    const content =
      data?.output?.choices?.[0]?.message?.content ??
      data?.output?.text ??
      "";
    if (!content) throw new Error("AI returned empty response");
    return content.trim();
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") throw new Error("AI request timed out after 30s");
    throw e;
  }
}

export async function callQwen(prompt: string, systemPrompt?: string): Promise<string> {
  return callDashScope(prompt, systemPrompt, DEFAULT_MODEL);
}

export function buildDiagnosePrompt(data: any): string {
  const conflictLines =
    data.conflicts.length > 0
      ? data.conflicts
          .map((c: any) => `- [${c.severity}] ${c.name}\n  - 涉及：${c.matches.map((m: any) => m.file.replace(/\.jar$/i, "")).join(", ")}`)
          .join("\n\n")
      : "（无）";

  const crashLines =
    data.crashes.length > 0
      ? data.crashes
          .map((c: any) => `- ${c.crash_file} | ${c.exception_type || "未知"} | ${c.error_message?.slice(0, 100) || "无"}`)
          .join("\n")
      : "（无）";

  const cleanLines =
    data.cleanIssues.length > 0
      ? data.cleanIssues.map((i: any) => `- [${i.type}] ${i.files.length} 个文件`).join("\n")
      : "（无）";

  const javaInfo = data.javaVersion
    ? `Java版本：${data.javaVersion}\n内存配置：${data.jvmArgs?.length ? data.jvmArgs.join(" ") : "未检测"}`
    : "Java信息：未获取";

  return `## 整合包诊断数据

- 实例名称：${data.instanceId}
- Minecraft 版本：${data.minecraftVersion}
- Loader：${data.loader || "未知"}
- 模组数量：${data.modCount}
- Java 信息：${javaInfo}

## 模组冲突 (${data.conflicts.length} 个)
${conflictLines}

## 崩溃报告 (${data.crashes.length} 个)
${crashLines}

## 目录清洁度 (${data.cleanIssues.length} 类)
${cleanLines}

## 补充信息
${data.logSummary || "暂无日志摘要"}

请分析以上诊断数据，给出专业的排查结论和优化建议。重点关注：
1. 是否存在致命冲突导致无法启动？
2. 性能优化方向有哪些？
3. 崩溃报告的根因是什么？
4. 整体健康评分（1-10分）及理由`;
}
