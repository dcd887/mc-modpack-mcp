const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// ── Config ────────────────────────────────────────────────────────────
// Use MC_DIR env var, or replace with your own Minecraft directory
const mcDir = process.env.MC_DIR || path.join(os.homedir(), ".minecraft");
const mcpPath = path.join(__dirname, "dist", "index.js");
const logDir = path.join(__dirname, "test_logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");
const LOG_FILE = path.join(logDir, `test_${TIMESTAMP}.log`);
const BACKUP_DIR = path.join(__dirname, "backups");

// ── Logging helpers ───────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toLocaleTimeString("zh-CN")}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

// ── Backup ────────────────────────────────────────────────────────────
function createBackup() {
  log("=== 创建备份 ===");
  const backupPath = path.join(BACKUP_DIR, `backup_${TIMESTAMP}`);
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  try {
    fs.cpSync(path.join(mcDir, "versions", "rpg"), backupPath, { recursive: true, force: false });
    log(`备份成功: ${backupPath}`);
    return backupPath;
  } catch (e) {
    log(`备份失败: ${e.message}`);
    return null;
  }
}

// ── Run MCP ───────────────────────────────────────────────────────────
log(`MCP 测试启动 | 时间: ${new Date().toLocaleString("zh-CN")}`);
log(`MC 目录: ${mcDir}`);
log(`日志文件: ${LOG_FILE}`);

createBackup();

const proc = spawn("node", [mcpPath], { stdio: ["pipe", "pipe", "pipe"] });

let output = "";
let buffer = "";

proc.stdout.on("data", (data) => {
  const chunk = data.toString();
  output += chunk;
  // Process complete JSON-RPC lines
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line) {
      try {
        const parsed = JSON.parse(line);
        log(`[OUT] ${JSON.stringify(parsed).slice(0, 300)}`);
      } catch {
        log(`[RAW OUT] ${line.slice(0, 200)}`);
      }
    }
  }
});

proc.stderr.on("data", (data) => {
  const s = data.toString();
  process.stderr.write("STDERR: " + s);
  log(`[STDERR] ${s.trim()}`);
});

proc.on("error", (e) => log(`进程启动失败: ${e.message}`));
proc.on("close", (code) => log(`MCP 进程退出码: ${code}`));

function send(id, method, params) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  log(`→ 发送工具调用 id=${id} method=${method}`);
  proc.stdin.write(msg + "\n");
}

function waitForOutput(timeout = 3000) {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

async function runTest(id, method, params, description) {
  log(`\n--- 测试 ${id}: ${description} ---`);
  send(id, method, params);
  await waitForOutput(2000);
}

(async () => {
  try {
    // Wait for MCP to initialize
    await waitForOutput(1500);

    // Test 1: get_java_versions
    await runTest(
      1,
      "tools/call",
      { name: "get_java_versions", arguments: { mc_dir: mcDir } },
      "读取 Java 版本列表"
    );

    // Test 2: get_version_info
    await runTest(
      2,
      "tools/call",
      { name: "get_version_info", arguments: { mc_dir: mcDir, instance_id: "rpg" } },
      "读取整合包版本信息"
    );

    // Test 3: detect_conflicts
    await runTest(
      3,
      "tools/call",
      { name: "detect_conflicts", arguments: { mc_dir: mcDir, instance_id: "rpg" } },
      "检测模组冲突"
    );

    // Test 4: scan_cleanliness
    await runTest(
      4,
      "tools/call",
      { name: "scan_cleanliness", arguments: { mc_dir: mcDir, instance_id: "rpg" } },
      "扫描 mods 目录整洁度"
    );

    // Test 5: read_log (WARN only)
    await runTest(
      5,
      "tools/call",
      { name: "read_log", arguments: { mc_dir: mcDir, instance_id: "rpg", level: "WARN", tail: 30 } },
      "读取 WARN 级别日志（最后30行）"
    );

    // Test 6: read_log (full)
    await runTest(
      6,
      "tools/call",
      { name: "read_log", arguments: { mc_dir: mcDir, instance_id: "rpg" } },
      "读取完整 latest.log"
    );

    // Test 7: list_mods
    await runTest(
      7,
      "tools/call",
      { name: "list_mods", arguments: { mc_dir: mcDir, instance_id: "rpg", filter: ".*sodium.*" } },
      "过滤 sodium 相关模组"
    );

    // Test 8: find_crash_reports
    await runTest(
      8,
      "tools/call",
      { name: "find_crash_reports", arguments: { mc_dir: mcDir } },
      "查找崩溃报告"
    );

    // Test 9: check_mod_dependencies
    await runTest(
      9,
      "tools/call",
      { name: "check_mod_dependencies", arguments: { project_id: "sodium", mc_version: "1.20.1", loader: "fabric" } },
      "查询 Sodium 依赖信息（Modrinth API）"
    );

    log("\n=== 所有测试完成 ===");
    log(`完整输出已保存到: ${LOG_FILE}`);
    proc.kill();
  } catch (e) {
    log(`测试异常: ${e.message}`);
    proc.kill();
  }
  process.exit(0);
})();
