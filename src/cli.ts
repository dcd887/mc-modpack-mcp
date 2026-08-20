const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");

// ANSI color codes
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};
const useColor = process.stdout.isTTY !== false;
const colorize = (str, color) => useColor ? `${color}${str}${C.reset}` : str;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise<string>((resolve) => rl.question(question, (ans: string) => resolve(ans)));
}

function section(title) {
  console.log(`\n${colorize("═".repeat(50), C.cyan)}`);
  console.log(`  ${colorize(title, C.bold)}`);
  console.log(colorize("═".repeat(50), C.cyan));
}

function sub(title) {
  console.log(`\n  ▸ ${colorize(title, C.yellow)}`);
}

function exit(msg) {
  console.log(`\n${msg || "退出。"}`);
  process.exit(0);
}

function detectMcDir() {
  const candidates = [];
  const profile = process.env.USERPROFILE;
  if (profile) candidates.push(path.join(profile, ".minecraft"));
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, ".minecraft"));
  candidates.push(path.join(process.cwd(), ".minecraft"));
  for (const p of candidates) { if (fs.existsSync(p)) return p; }
  return null;
}

function detectInstances(mcDir) {
  const versionsDir = path.join(mcDir, "versions");
  if (!fs.existsSync(versionsDir)) return [];
  return fs.readdirSync(versionsDir).filter((f) => fs.existsSync(path.join(versionsDir, f, `${f}.json`)));
}

async function loadRules() {
  try {
    const rulesPath = path.join(__dirname, "rules.json");
    return JSON.parse(fs.readFileSync(rulesPath, "utf-8"));
  } catch {
    return {};
  }
}

async function runConflictCheck(mcDir, instanceId, rules) {
  sub("模组冲突检测");
  const modsDir = path.join(mcDir, "versions", instanceId, "mods");
  if (!fs.existsSync(modsDir)) { console.log("  ❌ mods 目录不存在\n"); return; }
  const files = fs.readdirSync(modsDir).filter((f) => f.endsWith(".jar"));
  const findings = [];
  for (const rule of (rules.conflicts ?? [])) {
    const regex = new RegExp(rule.patterns.join("|"), "i");
    const matches = files.filter((f) => regex.test(f));
    if (rule.patterns.length === 1 && matches.length > 1) {
      findings.push({ ...rule, matches });
    } else if (rule.patterns.length > 1 && matches.length >= 2) {
      findings.push({ ...rule, matches });
    }
  }
  if (findings.length === 0) {
    console.log(`  ${colorize("✅", C.green)} 通过！共 ${files.length} 个模组，未发现已知冲突。`);
  } else {
    console.log(`  ${colorize("⚠️", C.yellow)} 发现 ${findings.length} 个问题：\n`);
    for (const f of findings) {
      const repls = (f.replacements ?? []).sort((a, b) => a.priority - b.priority);
      console.log(`  ${f.emoji || colorize("🔴", C.red)} ${colorize(`[${f.name}]`, C.bold)}`);
      console.log(`     文件：${f.matches.map((m) => m.replace(/\.jar$/i, "")).join(colorize("、", C.yellow))}`);
      console.log(`     建议：${colorize(f.solution, C.cyan)}`);
      if (repls.length > 0) {
        console.log(`     ${colorize("💡 推荐替换方案：", C.blue)}`);
        for (const r of repls) {
          console.log(`       ${r.priority}. ${r.project_id} — ${r.note}（${r.loader}）`);
        }
      }
      console.log("");
    }
  }
}

async function runCleanlinessCheck(mcDir, instanceId) {
  sub("目录整洁度检查");
  const modsDir = path.join(mcDir, "versions", instanceId, "mods");
  if (!fs.existsSync(modsDir)) { console.log("  ❌ mods 目录不存在\n"); return; }
  const files = fs.readdirSync(modsDir);
  const nonJar = files.filter((f) => !f.endsWith(".jar") && !f.endsWith(".jar.lock") && !f.startsWith("."));
  const srcJars = files.filter((f) => f.endsWith("-sources.jar"));
  const scripts = files.filter((f) => f.endsWith(".ps1") || f.endsWith(".bat") || f.endsWith(".cmd"));
  const issues = [];
  if (nonJar.length > 0) issues.push(`非 JAR 文件：${nonJar.join(", ")}`);
  if (srcJars.length > 0) issues.push(`Source JAR：${srcJars.join(", ")}`);
  if (scripts.length > 0) issues.push(`脚本文件（危险）：${scripts.join(", ")}`);
  if (issues.length === 0) {
    console.log(`  ✅ 整洁！共 ${files.length} 个文件，全部为正常模组 JAR 包。`);
  } else {
    console.log(`  ⚠️  发现 ${issues.length} 类异常：\n`);
    for (const iss of issues) console.log(`  - ${iss}`);
  }
}

async function runCrashCheck(mcDir) {
  sub("崩溃报告检查");
  const crashDir = path.join(mcDir, "crash-reports");
  if (!fs.existsSync(crashDir)) { console.log(`  ${colorize("✅", C.green)} 无崩溃报告，运行状态良好。`); return; }
  const files = fs.readdirSync(crashDir).filter((f) => f.endsWith(".txt")).sort((a, b) => b.localeCompare(a));
  if (files.length === 0) { console.log(`  ${colorize("✅", C.green)} crash-reports 目录为空。`); return; }
  console.log(`  📋 共 ${files.length} 个崩溃报告（最新 3 个）：\n`);
  for (const f of files.slice(0, 3)) {
    const s = fs.statSync(path.join(crashDir, f));
    console.log(`  📄 ${f}（${s.mtime.toISOString().slice(0, 10)}，${Math.round(s.size / 1024)}KB）`);
  }
  if (files.length > 0) {
    const choice = await ask(`\n  要分析最新的崩溃报告吗？(y/N) `);
    if (choice.trim().toLowerCase() === "y") {
      console.log(`\n  分析：${files[0]}\n`);
      const crashPath = path.join(crashDir, files[0]);
      const content = fs.readFileSync(crashPath, "utf-8");
      const lines = content.split("\n");
      const mcVersion = (lines.find((l) => l.includes("Minecraft Version:")) ?? "").replace("Minecraft Version:", "").trim() || "unknown";
      let exceptionType = "";
      const exMatch = content.match(/Exception of type\s+(\S+)\swas\s+thrown/);
      if (exMatch) exceptionType = exMatch[1];
      const causedBy = content.match(/Caused by:\s*(.+)$/m);
      if (causedBy) exceptionType = causedBy[1].trim();
      let errorMsg = "";
      for (const line of lines) {
        if (line.includes(": ") && /Exception|Error|error/.test(line)) { errorMsg = line.trim(); break; }
      }
      console.log(`  MC 版本：${mcVersion}`);
      console.log(`  异常类型：${exceptionType || "未识别"}`);
      console.log(`  错误信息：${errorMsg || "无"}`);
      const lower = (exceptionType + " " + errorMsg).toLowerCase();
      if (lower.includes("outofmemory")) console.log(`  🔍 建议：堆内存不足，请增加 -Xmx 到 4GB 以上。`);
      else if (lower.includes("nosuchmethod")) console.log(`  🔍 建议：模组与 MC 版本不兼容，请更新模组。`);
      else if (lower.includes("noclassdeffound")) console.log(`  🔍 建议：缺少依赖模组，请安装缺失的依赖。`);
      else console.log(`  🔍 建议：查看详细日志或向模组作者提交 issue。`);
      console.log("\n" + content.slice(0, 2000));
    }
  }
}

async function runJavaCheck(mcDir) {
  sub("Java 运行时检测");
  const appdata = process.env.APPDATA || path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming");
  const configPath = path.join(appdata, "PCL", "config.json");
  if (!fs.existsSync(configPath)) {
    console.log("  ⚠️  未找到 PCL 配置文件，跳过 Java 检测。");
    console.log("  💡 提示：如需检测 Java，请确保已安装 PCL (Plain Craft Launcher)。");
    return;
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const list = config.JavaList ?? [];
    if (list.length === 0) { console.log("  ⚠️  PCL 中未配置任何 Java 版本。"); return; }
    console.log(`  检测到 ${list.length} 个 Java 版本：\n`);
    for (const item of list) {
      const ver = item.Version ? `${item.Version.Major}.${item.Version.Minor}.${item.Version.Build}` : "未知";
      const icon = item.Version?.Major >= 17 ? "✅" : item.Version?.Major >= 8 ? "⚠️" : "❌";
      console.log(`  ${icon} Java ${ver} → ${item.Folder || "(路径未知)"}`);
    }
  } catch (e) {
    console.log(`  ❌ 解析 PCL 配置失败：${e}\n`);
  }
}

async function runAIDiagnose(mcDir, instanceId, _rules) {
  if (!process.env.DASHSCOPE_API_KEY) {
    console.log("\n  ⚠️  未设置 DASHSCOPE_API_KEY，跳过 AI 诊断");
    console.log("  💡 请获取 API Key 后设置：export DASHSCOPE_API_KEY='sk-xxx'");
    return;
  }
  console.log("\n  🤖 AI 智能诊断中...（可能需要 10-30 秒）");
  try {
    const process2 = spawn("node", [path.join(__dirname, "index.js"), "--mc-dir", mcDir, "--instance-id", instanceId], {
      env: { ...process.env, MCP_SERVER_DEBUG: "false" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    const sendToolCall = (data) => JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: data }) + "\n";
    process2.stdin.write(sendToolCall({ name: "ai_diagnose", arguments: { mc_dir: mcDir, instance_id: instanceId } }));
    const deadline = Date.now() + 60_000;
    for await (const chunk of process2.stdout) {
      for (const line of String(chunk).split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.result?.content?.[0]?.type === "text") {
            const text = parsed.result.content[0].text;
            const sepIndex = text.indexOf("\n\n--- JSON ---\n");
            if (sepIndex !== -1) {
              console.log(text.slice(0, sepIndex));
            } else {
              console.log(text);
            }
          }
        } catch {}
      }
      if (Date.now() > deadline) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    process2.kill();
  } catch (e) {
    console.log(`  ❌ AI 诊断失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  const rules = await loadRules();
  const mcDir = process.env.MC_DIR || detectMcDir();

  console.log(`\n  ${colorize("╔══════════════════════════════════════════════╗", C.cyan)}`);
  console.log(`  ${colorize("║     Minecraft Modpack Diagnostic Tool v1.3   ║", C.cyan)}`);
  console.log(`  ${colorize("╚══════════════════════════════════════════════╝", C.cyan)}`);

  if (!mcDir) {
    console.log(`\n  ❌ 未找到 .minecraft 目录`);
    console.log(`  💡 请设置环境变量 MC_DIR 指向你的 Minecraft 安装目录`);
    console.log(`     Windows: set MC_DIR=C:\\path\\to\\.minecraft`);
    console.log(`     macOS/Linux: export MC_DIR=/path/to/.minecraft`);
    process.exit(1);
  }
  console.log(`\n  📁 Minecraft 目录：${mcDir}`);

  const instances = detectInstances(mcDir);
  if (instances.length === 0) {
    console.log(`\n  ⚠️  未找到任何游戏实例`);
    process.exit(0);
  }

  let instanceId;
  if (instances.length === 1) {
    instanceId = instances[0];
  } else {
    console.log(`\n  检测到 ${instances.length} 个实例：`);
    instances.forEach((id, i) => console.log(`    ${i + 1}. ${id}`));
    const idx = parseInt(await ask(`\n  选择实例编号 (1-${instances.length})：`), 10);
    instanceId = instances[isNaN(idx) ? 1 : idx - 1] ?? instances[0];
  }
  console.log(`  ✅ 使用实例：${instanceId}`);

  section("开始诊断");
  await runJavaCheck(mcDir);
  await runConflictCheck(mcDir, instanceId, rules);
  await runCleanlinessCheck(mcDir, instanceId);
  await runCrashCheck(mcDir);

  const aiChoice = await ask(`\n  🤖 是否运行 AI 智能诊断？(y/N) `);
  if (aiChoice.trim().toLowerCase() === "y") {
    section("AI 智能诊断");
    await runAIDiagnose(mcDir, instanceId, rules);
  }

  section("诊断完成");
  console.log(`  📋 实例：${instanceId}`);
  console.log(`  📁 目录：${mcDir}`);
  console.log(`\n  💡 更多高级功能请使用 MCP 工具集（list_mods, read_log, analyze_crash 等）\n`);
}

main().catch((e) => {
  console.error(`\n❌ 错误：${e.message}`);
  process.exit(1);
});
