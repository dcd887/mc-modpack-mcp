"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const server = new mcp_js_1.McpServer({
    name: "mc-modpack-mcp",
    version: "1.1.0",
});
const fs = require("node:fs");
const path = require("node:path");
// ── Load external rules ──────────────────────────────────────────────
let rules;
try {
    const rulesPath = path.join(__dirname, "rules.json");
    rules = JSON.parse(fs.readFileSync(rulesPath, "utf-8"));
}
catch {
    rules = {};
}
const CONFLICT_RULES = (rules.conflicts ?? []);
const JAVA_VERSION_MAP = (rules.javaVersionMap ?? []);
const CRASH_PATTERNS = (rules.crashAnalysisPatterns ?? []);
const CLEANLINESS_RULES = (rules.cleanlinessRules ?? {});
// ── Schema helpers ────────────────────────────────────────────────────
const Str = zod_1.z.string();
const OptStr = zod_1.z.string().optional();
const OptInt = zod_1.z.number().optional();
// ── Human-readable output helpers ────────────────────────────────────
function severityEmoji(severity) {
    return severity === "error" ? "🔴" : severity === "warning" ? "🟡" : "ℹ️";
}
function humanReadableConflicts(findings, totalMods) {
    if (findings.length === 0)
        return `✅ 模组检查通过！共扫描 ${totalMods} 个模组，未发现已知冲突。`;
    const lines = [`⚠️  发现 ${findings.length} 个问题（共 ${totalMods} 个模组）：\n`];
    for (const f of findings) {
        const name = f.name || f.pattern;
        const mods = f.matches.map((m) => m.file.replace(/\.jar$/i, "")).join("、");
        lines.push(`${severityEmoji(f.severity)} [${name}]`);
        lines.push(`   涉及文件：${mods}`);
        lines.push(`   建议：${f.solution}`);
        lines.push("");
    }
    return lines.join("\n").trim();
}
function humanReadableCleanliness(issues, totalFiles) {
    if (issues.length === 0)
        return `✅ 目录整洁！共 ${totalFiles} 个文件，全部为正常模组 JAR 包。`;
    const lines = [`⚠️  发现 ${issues.length} 类异常文件（共 ${totalFiles} 个文件）：\n`];
    for (const issue of issues) {
        lines.push(`[${issue.type}] ${issue.files.length} 个文件`);
        for (const f of issue.files.slice(0, 5))
            lines.push(`  - ${f}`);
        if (issue.files.length > 5)
            lines.push(`  ... 还有 ${issue.files.length - 5} 个，请查看完整列表`);
        lines.push("");
    }
    return lines.join("\n").trim();
}
function humanReadableJava(javaVersions, mcVersion) {
    if (javaVersions.length === 0)
        return "❌ 未找到任何 Java 运行时。请安装 Java 或确认 PCL 已配置 Java。";
    const lines = [`检测到 ${javaVersions.length} 个 Java 版本：\n`];
    for (const j of javaVersions) {
        const ver = j.java_version || "未知";
        lines.push(`  ${j.major_version >= 17 ? "✅" : j.major_version >= 8 ? "⚠️" : "❌"} ${ver} → ${j.path || "(路径未知)"}`);
    }
    if (mcVersion) {
        const required = resolveJavaForMC(mcVersion);
        if (required)
            lines.push(`\n📋 Minecraft ${mcVersion} 推荐 Java ${required.recommendedJava}（最低 ${required.minJava}）`);
    }
    return lines.join("\n").trim();
}
function resolveJavaForMC(mcVersion) {
    const num = parseFloat(mcVersion.replace(/[^\d.]/g, "").slice(0, 4));
    if (isNaN(num))
        return null;
    for (const entry of JAVA_VERSION_MAP) {
        const from = parseFloat(entry.mcFrom);
        const to = entry.mcTo ? parseFloat(entry.mcTo) : Infinity;
        if (num >= from && num <= to)
            return entry;
    }
    return null;
}
// ── Tool: get_java_versions ──────────────────────────────────────────
server.tool("get_java_versions", "读取 PCL launcher 配置文件，列出所有可用的 Java 运行时版本及其路径。不传 mc_dir 时自动探测常见位置。", { mc_dir: OptStr, mc_version: OptStr }, (params) => {
    const mcDir = params.mc_dir ?? detectMcDir();
    const configPath = detectPclConfig(mcDir);
    if (!configPath) {
        const suggestion = process.platform === "win32"
            ? "请在 Windows 上安装 PCL (Plain Craft Launcher)，或手动传入 mc_dir 参数。"
            : "当前平台不支持自动检测 Java，请传入 mc_dir 参数指定 Minecraft 安装目录。";
        return {
            content: [{
                    type: "text",
                    text: `❌ 未找到 PCL 配置文件。\n\n📁 搜索目录：${mcDir}\n💡 ${suggestion}`
                }]
        };
    }
    try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        const list = config.JavaList ?? [];
        const entries = list.map((item) => ({
            id: item.Folder || item.Id || "unknown",
            path: item.Folder || "",
            java_version: item.Version ? `${item.Version.Major}.${item.Version.Minor}.${item.Version.Build}` : null,
            major_version: item.Version ? item.Version.Major : 0,
        }));
        const readable = humanReadableJava(entries, params.mc_version);
        return {
            content: [{
                    type: "text",
                    text: readable + "\n\n--- JSON ---\n" + JSON.stringify({ mc_dir: mcDir, java_versions: entries }, null, 2)
                }]
        };
    }
    catch (e) {
        return {
            content: [{ type: "text", text: `❌ 解析 PCL 配置文件失败：${e}\n请确认配置文件格式正确，或尝试重新安装 PCL。` }]
        };
    }
});
// ── Tool: get_version_info ───────────────────────────────────────────
server.tool("get_version_info", "读取指定 Minecraft 版本的 version.json，返回游戏版本、Loader 版本、Java 要求、JVM 参数、模组数量等元数据。", { mc_dir: Str, instance_id: Str }, (params) => {
    const { mc_dir, instance_id } = params;
    const versionDir = path.join(mc_dir, "versions", instance_id);
    const versionJsonPath = path.join(versionDir, `${instance_id}.json`);
    if (!fs.existsSync(versionJsonPath)) {
        return {
            content: [{
                    type: "text",
                    text: `❌ 未找到版本文件：${versionJsonPath}\n\n💡 请确认 instance_id 正确。可用 get_java_versions 查看已安装的实例列表。`
                }]
        };
    }
    let versionData = {};
    let instanceConfig = {};
    try {
        versionData = JSON.parse(fs.readFileSync(versionJsonPath, "utf-8"));
    }
    catch {
        return { content: [{ type: "text", text: `❌ 解析 ${versionJsonPath} 失败，文件格式可能损坏。` }] };
    }
    const cfgPaths = [
        path.join(versionDir, `${instance_id}.json`),
        path.join(mc_dir, "instances", instance_id, `${instance_id}.json`),
        path.join(versionDir, "instance.json"),
    ];
    for (const cp of cfgPaths) {
        if (fs.existsSync(cp)) {
            try {
                instanceConfig = JSON.parse(fs.readFileSync(cp, "utf-8"));
                break;
            }
            catch { /* skip */ }
        }
    }
    const jvmArgs = [];
    const argsObj = instanceConfig.arguments ?? {};
    if (Array.isArray(argsObj.jvm)) {
        for (const item of argsObj.jvm) {
            if (typeof item === "string")
                jvmArgs.push(item);
        }
    }
    const modsDir = path.join(mc_dir, "versions", instance_id, "mods");
    const modCount = fs.existsSync(modsDir) ? fs.readdirSync(modsDir).filter((f) => f.endsWith(".jar")).length : 0;
    const javaReq = instanceConfig.javaVersion;
    const javaInfo = typeof javaReq === "object" ? javaReq.MinimumVersion : null;
    const mcVer = String(versionData.id ?? "unknown");
    const javaRequirement = resolveJavaForMC(mcVer);
    const statusLine = javaRequirement
        ? `Java要求：≥${javaRequirement.minJava}（推荐${javaRequirement.recommendedJava}）${javaReq ? `(实例配置: ${JSON.stringify(javaReq)})` : ""}`
        : "Java要求：未知（无法解析 MC 版本）";
    const readable = [
        `📦 实例：${instance_id}`,
        `  游戏版本：${mcVer}`,
        `  ${statusLine}`,
        `  JVM 参数：${jvmArgs.length > 0 ? jvmArgs.join(" ") : "（无）"}`,
        `  模组数量：${modCount} 个`,
        `  模组目录：${modsDir}`,
    ].join("\n");
    const result = {
        instance_id,
        minecraft_version: mcVer,
        assets: versionData.assets ?? "unknown",
        java_requirement: javaReq,
        java_recommendation: javaRequirement ? { min: javaRequirement.minJava, recommended: javaRequirement.recommendedJava } : null,
        jvm_args: jvmArgs,
        has_mods_directory: fs.existsSync(modsDir),
        mod_count: modCount,
        version_json_path: versionJsonPath,
    };
    return {
        content: [{
                type: "text",
                text: readable + "\n\n--- JSON ---\n" + JSON.stringify(result, null, 2)
            }]
    };
});
// ── Tool: list_mods ──────────────────────────────────────────────────
server.tool("list_mods", "扫描指定实例的 mods/ 目录，列出所有 JAR 文件及其基本信息。支持按名称过滤（filter 参数，支持正则）。", { mc_dir: Str, instance_id: Str, filter: OptStr }, (params) => {
    const modsDir = path.join(params.mc_dir, "versions", params.instance_id, "mods");
    if (!fs.existsSync(modsDir)) {
        return { content: [{ type: "text", text: `❌ mods 目录不存在：${modsDir}\n\n💡 请确认 instance_id 是否正确，或检查路径参数。` }] };
    }
    const files = fs.readdirSync(modsDir);
    const pattern = params.filter ? new RegExp(params.filter, "i") : null;
    const jars = files
        .filter((f) => f.endsWith(".jar") && !f.endsWith("-sources.jar") && !f.endsWith("-dev.jar"))
        .map((f) => {
        const s = fs.statSync(path.join(modsDir, f));
        return { filename: f, size_bytes: s.size, size_kb: Math.round(s.size / 1024), modified: s.mtime.toISOString() };
    })
        .sort((a, b) => a.filename.localeCompare(b.filename));
    const filtered = pattern ? jars.filter((m) => pattern.test(m.filename)) : jars;
    const preview = filtered.slice(0, 20).map((m) => `  ${m.filename} (${m.size_kb}KB)`).join("\n");
    const summary = `📦 实例 ${params.instance_id}：共 ${jars.length} 个模组${pattern ? `，过滤后 ${filtered.length} 个` : ""}\n\n${preview}${jars.length > 20 ? `\n...(还有 ${jars.length - 20} 个，详见 JSON)` : ""}`;
    return {
        content: [{
                type: "text",
                text: summary + "\n\n--- JSON ---\n" + JSON.stringify({ instance: params.instance_id, total_jars: jars.length, filtered_count: filtered.length, mods: filtered }, null, 2)
            }]
    };
});
// ── Tool: detect_conflicts ───────────────────────────────────────────
server.tool("detect_conflicts", "扫描 mods/ 目录中的已知冲突组合：渲染器冲突（sodium+embeddium+iris）、UI Lib 重复、JEI 重复、Fabric API 重复等。", { mc_dir: Str, instance_id: Str }, (params) => {
    const modsDir = path.join(params.mc_dir, "versions", params.instance_id, "mods");
    if (!fs.existsSync(modsDir)) {
        return { content: [{ type: "text", text: `❌ mods 目录不存在：${modsDir}` }] };
    }
    const files = fs.readdirSync(modsDir).filter((f) => f.endsWith(".jar"));
    const findings = [];
    for (const rule of CONFLICT_RULES) {
        const regex = new RegExp(rule.patterns.join("|"), "i");
        const matches = files.filter((f) => regex.test(f));
        if (rule.patterns.length === 1 && matches.length > 1) {
            findings.push({ ...rule, matches: matches.map((m) => ({ file: m })) });
        }
        else if (rule.patterns.length > 1 && matches.length >= 2) {
            findings.push({ ...rule, matches: matches.map((m) => ({ file: m })) });
        }
    }
    const readable = humanReadableConflicts(findings.map((f) => ({ pattern: f.id, name: f.name, severity: f.severity, matches: f.matches, solution: f.solution })), files.length);
    return {
        content: [{
                type: "text",
                text: readable + "\n\n--- JSON ---\n" + JSON.stringify({ instance: params.instance_id, total_mods: files.length, conflicts_found: findings.length, findings }, null, 2)
            }]
    };
});
// ── Tool: scan_cleanliness ───────────────────────────────────────────
server.tool("scan_cleanliness", "扫描 mods/ 目录中的非 JAR 文件：.ps1/.bat 脚本、.txt 文本、source-jar、dev jar 等。", { mc_dir: Str, instance_id: Str }, (params) => {
    const modsDir = path.join(params.mc_dir, "versions", params.instance_id, "mods");
    if (!fs.existsSync(modsDir)) {
        return { content: [{ type: "text", text: `❌ mods 目录不存在：${modsDir}` }] };
    }
    const files = fs.readdirSync(modsDir);
    const issues = [];
    const nonJar = files.filter((f) => !f.endsWith(".jar") && !f.endsWith(".jar.lock") && !f.startsWith("."));
    if (nonJar.length > 0)
        issues.push({ type: "非 JAR 文件", files: nonJar });
    const srcJars = files.filter((f) => f.endsWith("-sources.jar"));
    if (srcJars.length > 0)
        issues.push({ type: "Source JAR（开发包）", files: srcJars });
    const scripts = files.filter((f) => f.endsWith(".ps1") || f.endsWith(".bat") || f.endsWith(".cmd"));
    if (scripts.length > 0)
        issues.push({ type: "脚本文件（危险）", files: scripts });
    const txts = files.filter((f) => f.endsWith(".txt"));
    if (txts.length > 0)
        issues.push({ type: "文本文件", files: txts });
    const readable = humanReadableCleanliness(issues, files.length);
    return {
        content: [{
                type: "text",
                text: readable + "\n\n--- JSON ---\n" + JSON.stringify({ instance: params.instance_id, total_files: files.length, issues_found: issues.length, issues }, null, 2)
            }]
    };
});
// ── Tool: read_log ───────────────────────────────────────────────────
server.tool("read_log", "读取 Minecraft 实例的 latest.log，支持按日志级别（INFO/WARN/ERROR）和关键词过滤。", { mc_dir: Str, instance_id: Str, level: zod_1.z.enum(["INFO", "WARN", "ERROR", "FATAL"]).optional(), keyword: OptStr, tail: OptInt }, (params) => {
    const logPath = path.join(params.mc_dir, "versions", params.instance_id, "logs", "latest.log");
    if (!fs.existsSync(logPath)) {
        return {
            content: [{
                    type: "text",
                    text: `❌ 日志文件不存在：${logPath}\n\n💡 请确认实例已运行过至少一次，或检查 instance_id 是否正确。`
                }]
        };
    }
    let lines = [];
    try {
        lines = fs.readFileSync(logPath, "utf-8").split("\n").filter((l) => l.trim());
    }
    catch {
        lines = fs.readFileSync(logPath, "latin1").split("\n").filter((l) => l.trim());
    }
    if (lines.length === 0) {
        lines = fs.readFileSync(logPath, "latin1").split("\n").filter((l) => l.trim());
    }
    let filtered = lines;
    if (params.level) {
        filtered = filtered.filter((l) => new RegExp("\\[.*?\\b" + params.level + "\\b.*?\\]", "i").test(l));
    }
    if (params.keyword) {
        try {
            filtered = filtered.filter((l) => new RegExp(params.keyword, "i").test(l));
        }
        catch {
            filtered = filtered.filter((l) => l.toLowerCase().includes(params.keyword.toLowerCase()));
        }
    }
    if (params.tail && params.tail > 0)
        filtered = filtered.slice(-params.tail);
    const header = params.level ? `[${params.level}] ` : "";
    const summary = `${header}共 ${filtered.length} 行日志${params.keyword ? `，关键词 "${params.keyword}"` : ""}${params.tail ? `，最后 ${params.tail} 行` : ""}`;
    return {
        content: [{
                type: "text",
                text: summary + "\n" + filtered.join("\n") + "\n\n--- JSON ---\n" + JSON.stringify({ log_path: logPath, total_lines: lines.length, matched_lines: filtered.length, preview: filtered.join("\n") }, null, 2)
            }]
    };
});
// ── Tool: find_crash_reports ─────────────────────────────────────────
server.tool("find_crash_reports", "列出 crash-reports/ 目录中的所有崩溃报告，返回文件名和修改时间。", { mc_dir: Str }, (params) => {
    const crashDir = path.join(params.mc_dir, "crash-reports");
    if (!fs.existsSync(crashDir)) {
        return { content: [{ type: "text", text: `✅ 未发现崩溃报告目录：${crashDir}\n\n你的 Minecraft 运行状态良好，无需担心崩溃问题。` }] };
    }
    const files = fs.readdirSync(crashDir)
        .filter((f) => f.endsWith(".txt"))
        .map((f) => {
        const s = fs.statSync(path.join(crashDir, f));
        return { filename: f, modified: s.mtime.toISOString(), size_bytes: s.size };
    })
        .sort((a, b) => b.modified.localeCompare(a.modified));
    if (files.length === 0) {
        return { content: [{ type: "text", text: `✅ crash-reports 目录为空，未检测到崩溃。` }] };
    }
    const recent = files.slice(0, 3).map((f) => `  📄 ${f.filename}（${f.modified.slice(0, 10)}，${Math.round(f.size_bytes / 1024)}KB）`).join("\n");
    const summary = `📋 共 ${files.length} 个崩溃报告\n最近 3 个：\n${recent}\n\n💡 使用 analyze_crash 工具可以详细分析具体某个崩溃报告。`;
    return {
        content: [{
                type: "text",
                text: summary + "\n\n--- JSON ---\n" + JSON.stringify({ crash_dir: crashDir, total_crashes: files.length, reports: files }, null, 2)
            }]
    };
});
// ── Tool: analyze_crash ──────────────────────────────────────────────
server.tool("analyze_crash", "解析单个崩溃报告，提取 Minecraft 版本、异常类型、错误消息、堆栈顶部信息和综合摘要。", { mc_dir: Str, crash_file: Str }, (params) => {
    const crashPath = path.join(params.mc_dir, "crash-reports", params.crash_file);
    if (!fs.existsSync(crashPath)) {
        return {
            content: [{
                    type: "text",
                    text: `❌ 崩溃报告不存在：${crashPath}\n\n💡 请使用 find_crash_reports 查看可用的崩溃报告列表。`
                }]
        };
    }
    const content = fs.readFileSync(crashPath, "utf-8");
    const lines = content.split("\n");
    const mcVersion = (lines.find((l) => l.includes("Minecraft Version:")) ?? "").replace("Minecraft Version:", "").trim() || "unknown";
    let exceptionType = "";
    const exMatch = content.match(/Exception of type\s+(\S+)\swas\s+thrown/);
    if (exMatch)
        exceptionType = exMatch[1];
    const causedBy = content.match(/Caused by:\s*(.+)$/m);
    if (causedBy)
        exceptionType = causedBy[1].trim();
    let errorMsg = "";
    for (const line of lines) {
        if (line.includes(": ") && /Exception|Error|error/.test(line)) {
            errorMsg = line.trim();
            break;
        }
    }
    const stackLines = lines.filter((l) => l.includes("at ") && !l.includes("java.") && !l.includes("sun.") && l.length < 200);
    const stackTop = stackLines.slice(0, 5).join("\n") || "无可用堆栈";
    const exitCode = (content.match(/Exit Code:\s*(\d+)/) ?? [])[1] ?? null;
    let category = "unknown";
    let autoSolution = "请查看详细错误信息，或向模组作者提交 issue。";
    for (const p of CRASH_PATTERNS) {
        if (p.keywords.some((kw) => (exceptionType + " " + errorMsg).toLowerCase().includes(kw))) {
            category = p.category;
            autoSolution = p.solution;
            break;
        }
    }
    const categoryLabels = {
        "version-mismatch": "版本不兼容",
        "missing-dependency": "缺少依赖",
        "memory-issue": "内存不足",
        "mod-load-failed": "模组加载失败",
        "config-error": "配置文件错误",
        "runtime-bug": "模组 Bug",
        "corrupted-mod": "模组文件损坏",
        "unknown": "未知原因",
    };
    const readable = [
        `💥 崩溃分析报告`,
        `  文件：${params.crash_file}`,
        `  MC 版本：${mcVersion}`,
        `  异常类型：${exceptionType || "未识别"}`,
        `  分类：${categoryLabels[category] || category}`,
        ``,
        `📝 错误信息：`,
        `  ${errorMsg || "未识别到明确错误"}`,
        ``,
        `🔍 推荐操作：`,
        `  ${autoSolution}`,
        ``,
        `📌 堆栈（前 5 行）：`,
        `  ${stackTop.split("\n").join("\n  ")}`,
    ].join("\n");
    const result = {
        crash_file: params.crash_file,
        minecraft_version: mcVersion,
        exit_code: exitCode,
        exception_type: exceptionType || "未知",
        error_message: errorMsg || "未识别到明确错误",
        category,
        recommended_action: autoSolution,
        stack_trace_top: stackTop,
        summary: generateSummary(exceptionType, errorMsg, exitCode),
    };
    return {
        content: [{
                type: "text",
                text: readable + "\n\n--- JSON ---\n" + JSON.stringify(result, null, 2)
            }]
    };
});
// ── Tool: check_mod_dependencies ─────────────────────────────────────
server.tool("check_mod_dependencies", "通过 Modrinth API 查询模组的依赖信息：最新兼容版本、required/optional 依赖、MC 版本兼容列表。", { project_id: Str, mc_version: Str, loader: OptStr }, async (params) => {
    const { project_id, mc_version, loader } = params;
    const API = "https://api.modrinth.com/v2";
    try {
        const projResp = await fetch(`${API}/project/${project_id}`);
        if (!projResp.ok) {
            return {
                content: [{
                        type: "text",
                        text: `❌ 无法获取模组信息（HTTP ${projResp.status}）\n\n💡 请确认 project_id 正确（可在 modrinth.com 上查找）。常见 ID 示例：\n  - fabric-api → fabric-api\n  - sodium → sodium\n  - jei → jei`
                    }]
            };
        }
        const project = await projResp.json();
        const verUrl = new URL(`${API}/project/${project_id}/version`);
        verUrl.searchParams.set("game_version", mc_version);
        if (loader)
            verUrl.searchParams.set("loader", loader);
        verUrl.searchParams.set("status", "released");
        verUrl.searchParams.set("limit", "10");
        const verResp = await fetch(verUrl.toString());
        if (!verResp.ok) {
            return {
                content: [{
                        type: "text",
                        text: `❌ 获取版本列表失败（HTTP ${verResp.status}）\n\n💡 请确认 mc_version 格式正确（如 "1.20.1"），且 loader 与模组匹配（Fabric 或 Forge）。`
                    }]
            };
        }
        const versions = await verResp.json();
        const matching = versions.find((v) => {
            const loaders = v.loaders ?? [];
            const gameVersions = v.game_versions ?? [];
            return loaders.includes(loader ?? "") && gameVersions.includes(mc_version);
        });
        const latest = matching ?? versions[0] ?? {};
        const deps = latest.dependencies ?? [];
        const requiredDeps = deps.filter((d) => d.required).map((d) => d.project_id);
        const optionalDeps = deps.filter((d) => !d.required).map((d) => d.project_id);
        const cat = project.categories.includes("fabric") ? "fabric" : project.categories.includes("forge") ? "forge" : "unknown";
        const readable = [
            `📦 模组信息`,
            `  名称：${project.title}`,
            `  Project ID：${project_id}`,
            `  最新兼容版本：${latest.version_number ?? "未知"}`,
            `  加载器：${cat}`,
            `  兼容性：${(latest.game_versions ?? []).join(", ") || "未知"}`,
            ``,
            requiredDeps.length > 0 ? `🔗 必需依赖：${requiredDeps.join(", ")}` : "",
            optionalDeps.length > 0 ? `📎 可选依赖：${optionalDeps.join(", ")}` : "",
        ].filter(Boolean).join("\n");
        const result = {
            project_id,
            title: project.title,
            latest_version: latest.version_number ?? "unknown",
            mc_version_compatible: latest.game_versions ?? [],
            loader: cat,
            side: { client: project.client_side, server: project.server_side },
            required_dependencies: requiredDeps,
            optional_dependencies: optionalDeps,
        };
        return {
            content: [{
                    type: "text",
                    text: readable + "\n\n--- JSON ---\n" + JSON.stringify(result, null, 2)
                }]
        };
    }
    catch (e) {
        return {
            content: [{
                    type: "text",
                    text: `❌ 查询失败：${e instanceof Error ? e.message : String(e)}\n\n💡 请检查网络连接，确认 Modrinth API 可访问。`
                }]
        };
    }
});
// ── Helpers ──────────────────────────────────────────────────────────
function detectMcDir() {
    const candidates = [];
    const profile = process.env.USERPROFILE;
    if (profile)
        candidates.push(path.join(profile, ".minecraft"));
    if (process.env.APPDATA)
        candidates.push(path.join(process.env.APPDATA, ".minecraft"));
    candidates.push(path.join(process.cwd(), ".minecraft"));
    for (const p of candidates) {
        if (fs.existsSync(p))
            return p;
    }
    return candidates[0] ?? ".minecraft";
}
function detectPclConfig(mcDir) {
    const appdata = process.env.APPDATA || path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming");
    const candidates = [
        path.join(appdata, "PCL", "config.json"),
        path.join(mcDir, "..", "PCL", "config.json"),
        path.join(mcDir, "PCL", "config.json"),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p))
            return p;
    }
    return null;
}
function parseMajorVersion(javaVersion) {
    const m = javaVersion.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
}
function generateSummary(exceptionType, errorMsg, exitCode) {
    const lower = (exceptionType + " " + errorMsg).toLowerCase();
    if (exitCode === "1" && !exceptionType)
        return "退出码 1，无异常信息。通常由 Java 版本不匹配导致。";
    if (lower.includes("nosuchmethod"))
        return "NoSuchMethodError：模组与 MC 版本不兼容。";
    if (lower.includes("noclassdeffound"))
        return "ClassNotFoundException：缺少依赖模组。";
    if (lower.includes("outofmemory"))
        return "OutOfMemoryError：堆内存不足，请增加 -Xmx。";
    if (lower.includes("modloaderr"))
        return "ModLoadException：模组加载失败。";
    return `异常: ${exceptionType || "未知"}\n错误: ${errorMsg || "无"}`;
}
// ── Start ────────────────────────────────────────────────────────────
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
main().catch((error) => {
    console.error("MCP Server error:", error);
    process.exit(1);
});
