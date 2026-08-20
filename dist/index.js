"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const server = new mcp_js_1.McpServer({
    name: "mc-modpack-mcp",
    version: "1.0.0",
});
// ── Schema helpers ────────────────────────────────────────────────────
const Str = zod_1.z.string();
const OptStr = zod_1.z.string().optional();
const OptInt = zod_1.z.number().optional();
// ── Tool: get_java_versions ──────────────────────────────────────────
server.tool("get_java_versions", "读取 PCL launcher 配置文件，列出所有可用的 Java 运行时版本及其路径。不传 mc_dir 时自动探测常见位置。", { mc_dir: OptStr }, (params) => {
    const { readFileSync, existsSync } = require("node:fs");
    const { join } = require("node:path");
    const mcDir = params.mc_dir ?? detectMcDir();
    const configPath = detectPclConfig(mcDir);
    if (!configPath) {
        return { content: [{ type: "text", text: `未找到 PCL 配置文件。请传入 mc_dir 参数，或确认 PCL 已安装。` }] };
    }
    try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        const list = config.JavaList ?? [];
        const entries = list.map((item) => ({
            id: item.Folder || item.Id || "unknown",
            path: item.Folder || "",
            java_version: item.Version ? `${item.Version.Major}.${item.Version.Minor}.${item.Version.Build}` : null,
            major_version: item.Version ? item.Version.Major : 0,
        }));
        return { content: [{ type: "text", text: JSON.stringify({ mc_dir: mcDir, java_versions: entries }, null, 2) }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `解析失败: ${e}` }] };
    }
});
// ── Tool: get_version_info ───────────────────────────────────────────
server.tool("get_version_info", "读取指定 Minecraft 版本的 version.json，返回游戏版本、Loader 版本、Java 要求、JVM 参数、模组数量等元数据。", { mc_dir: Str, instance_id: Str }, (params) => {
    const { readFileSync, existsSync, readdirSync } = require("node:fs");
    const { join } = require("node:path");
    const { mc_dir, instance_id } = params;
    const versionDir = join(mc_dir, "versions", instance_id);
    const versionJsonPath = join(versionDir, `${instance_id}.json`);
    if (!existsSync(versionJsonPath)) {
        return { content: [{ type: "text", text: `未找到版本文件: ${versionJsonPath}` }] };
    }
    let versionData = {};
    let instanceConfig = {};
    try {
        versionData = JSON.parse(readFileSync(versionJsonPath, "utf-8"));
    }
    catch {
        return { content: [{ type: "text", text: `解析 ${versionJsonPath} 失败` }] };
    }
    const cfgPaths = [
        join(versionDir, `${instance_id}.json`),
        join(mc_dir, "instances", instance_id, `${instance_id}.json`),
        join(versionDir, "instance.json"),
    ];
    for (const cp of cfgPaths) {
        if (existsSync(cp)) {
            try {
                instanceConfig = JSON.parse(readFileSync(cp, "utf-8"));
                break;
            }
            catch { }
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
    const modsDir = join(mc_dir, "versions", instance_id, "mods");
    const modCount = existsSync(modsDir) ? readdirSync(modsDir).filter((f) => f.endsWith(".jar")).length : 0;
    const result = {
        instance_id,
        minecraft_version: versionData.id ?? "unknown",
        assets: versionData.assets ?? "unknown",
        java_requirement: instanceConfig.javaVersion,
        jvm_args: jvmArgs,
        has_mods_directory: existsSync(modsDir),
        mod_count: modCount,
        version_json_path: versionJsonPath,
    };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ── Tool: list_mods ──────────────────────────────────────────────────
server.tool("list_mods", "扫描指定实例的 mods/ 目录，列出所有 JAR 文件及其基本信息。支持按名称过滤（filter 参数，支持正则）。", { mc_dir: Str, instance_id: Str, filter: OptStr }, (params) => {
    const { readdirSync, existsSync, statSync } = require("node:fs");
    const { join } = require("node:path");
    const modsDir = join(params.mc_dir, "versions", params.instance_id, "mods");
    if (!existsSync(modsDir)) {
        return { content: [{ type: "text", text: `mods 目录不存在: ${modsDir}` }] };
    }
    const files = readdirSync(modsDir);
    const pattern = params.filter ? new RegExp(params.filter, "i") : null;
    const jars = files
        .filter((f) => f.endsWith(".jar") && !f.endsWith("-sources.jar") && !f.endsWith("-dev.jar"))
        .map((f) => {
        const s = statSync(join(modsDir, f));
        return { filename: f, size_bytes: s.size, size_kb: Math.round(s.size / 1024), modified: s.mtime.toISOString() };
    })
        .sort((a, b) => a.filename.localeCompare(b.filename));
    const filtered = pattern ? jars.filter((m) => pattern.test(m.filename)) : jars;
    return { content: [{ type: "text", text: JSON.stringify({ instance: params.instance_id, total_jars: jars.length, filtered_count: filtered.length, mods: filtered }, null, 2) }] };
});
// ── Tool: detect_conflicts ───────────────────────────────────────────
server.tool("detect_conflicts", "扫描 mods/ 目录中的已知冲突组合：渲染器冲突（sodium+embeddium+iris）、UI Lib 重复、JEI 重复、Fabric API 重复等。", { mc_dir: Str, instance_id: Str }, (params) => {
    const { readdirSync, existsSync } = require("node:fs");
    const { join } = require("node:path");
    const modsDir = join(params.mc_dir, "versions", params.instance_id, "mods");
    if (!existsSync(modsDir)) {
        return { content: [{ type: "text", text: `mods 目录不存在: ${modsDir}` }] };
    }
    const files = readdirSync(modsDir).filter((f) => f.endsWith(".jar"));
    const CONFLICTS = [
        { name: "渲染器冲突 (Sodium/Embeddium)", patterns: ["sodium", "embeddium"], severity: "error", solution: "Sodium 和 Embeddium 不能同时安装，推荐 Embeddium。" },
        { name: "Iris + Sodium", patterns: ["iris", "sodium"], severity: "warning", solution: "Iris 需配合 Sodium 或 Embeddium 使用。" },
        { name: "UI Lib 重复", patterns: ["uilib", "ui_lib", "ui-lib"], severity: "error", solution: "UI Lib 只能安装一个版本。" },
        { name: "JEI 重复", patterns: ["jei"], severity: "error", solution: "JEI 只能安装一个版本。" },
        { name: "Fabric API 重复", patterns: ["fabric-api"], severity: "error", solution: "Fabric API 只能安装一个版本。" },
        { name: "墓碑模组重复", patterns: ["gravestone", "gravestones"], severity: "warning", solution: "墓碑模组建议只保留一个版本。" },
    ];
    const findings = [];
    for (const rule of CONFLICTS) {
        const regex = new RegExp(rule.patterns.join("|"), "i");
        const matches = files.filter((f) => regex.test(f));
        if (rule.patterns.length === 1 && matches.length > 1) {
            findings.push({ pattern: rule.name, severity: rule.severity, matches: matches.map((m) => ({ file: m })), solution: rule.solution });
        }
        else if (rule.patterns.length > 1 && matches.length >= 2) {
            findings.push({ pattern: rule.name, severity: rule.severity, matches: matches.map((m) => ({ file: m })), solution: rule.solution });
        }
    }
    return { content: [{ type: "text", text: JSON.stringify({ instance: params.instance_id, total_mods: files.length, conflicts_found: findings.length, findings }, null, 2) }] };
});
// ── Tool: scan_cleanliness ───────────────────────────────────────────
server.tool("scan_cleanliness", "扫描 mods/ 目录中的非 JAR 文件：.ps1/.bat 脚本、.txt 文本、source-jar、dev jar 等。", { mc_dir: Str, instance_id: Str }, (params) => {
    const { readdirSync, existsSync } = require("node:fs");
    const { join } = require("node:path");
    const modsDir = join(params.mc_dir, "versions", params.instance_id, "mods");
    if (!existsSync(modsDir)) {
        return { content: [{ type: "text", text: `mods 目录不存在: ${modsDir}` }] };
    }
    const files = readdirSync(modsDir);
    const issues = [];
    const nonJar = files.filter((f) => !f.endsWith(".jar") && !f.endsWith(".jar.lock") && !f.startsWith("."));
    if (nonJar.length > 0)
        issues.push({ type: "非 JAR 文件", files: nonJar });
    const srcJars = files.filter((f) => f.endsWith("-sources.jar"));
    if (srcJars.length > 0)
        issues.push({ type: "Source JAR", files: srcJars });
    const scripts = files.filter((f) => f.endsWith(".ps1") || f.endsWith(".bat") || f.endsWith(".cmd"));
    if (scripts.length > 0)
        issues.push({ type: "脚本文件", files: scripts });
    const txts = files.filter((f) => f.endsWith(".txt"));
    if (txts.length > 0)
        issues.push({ type: "文本文件", files: txts });
    return { content: [{ type: "text", text: JSON.stringify({ instance: params.instance_id, total_files: files.length, issues_found: issues.length, issues }, null, 2) }] };
});
// ── Tool: read_log ───────────────────────────────────────────────────
server.tool("read_log", "读取 Minecraft 实例的 latest.log，支持按日志级别（INFO/WARN/ERROR）和关键词过滤。", { mc_dir: Str, instance_id: Str, level: zod_1.z.enum(["INFO", "WARN", "ERROR", "FATAL"]).optional(), keyword: OptStr, tail: OptInt }, (params) => {
    const { readFileSync, existsSync } = require("node:fs");
    const { join } = require("node:path");
    const logPath = join(params.mc_dir, "versions", params.instance_id, "logs", "latest.log");
    if (!existsSync(logPath)) {
        return { content: [{ type: "text", text: `日志文件不存在: ${logPath}` }] };
    }
    // Windows Chinese Minecraft logs are often GBK-encoded; try UTF-8 first, fallback to latin1 (raw bytes)
    let lines = [];
    try {
        lines = readFileSync(logPath, "utf-8").split("\n").filter((l) => l.trim());
    }
    catch {
        lines = readFileSync(logPath, "latin1").split("\n").filter((l) => l.trim());
    }
    if (lines.length === 0) {
        lines = readFileSync(logPath, "latin1").split("\n").filter((l) => l.trim());
    }
    if (params.level) {
        lines = lines.filter((l) => new RegExp("\\[.*?\\b" + params.level + "\\b.*?\\]", "i").test(l));
    }
    if (params.keyword) {
        try {
            lines = lines.filter((l) => new RegExp(params.keyword, "i").test(l));
        }
        catch {
            lines = lines.filter((l) => l.toLowerCase().includes(params.keyword.toLowerCase()));
        }
    }
    if (params.tail && params.tail > 0)
        lines = lines.slice(-params.tail);
    return { content: [{ type: "text", text: JSON.stringify({ log_path: logPath, total_lines: lines.length, preview: lines.join("\n") }, null, 2) }] };
});
// ── Tool: find_crash_reports ─────────────────────────────────────────
server.tool("find_crash_reports", "列出 crash-reports/ 目录中的所有崩溃报告，返回文件名和修改时间。", { mc_dir: Str }, (params) => {
    const { readdirSync, existsSync, statSync } = require("node:fs");
    const { join } = require("node:path");
    const crashDir = join(params.mc_dir, "crash-reports");
    if (!existsSync(crashDir)) {
        return { content: [{ type: "text", text: `崩溃报告目录不存在: ${crashDir}` }] };
    }
    const files = readdirSync(crashDir)
        .filter((f) => f.endsWith(".txt"))
        .map((f) => {
        const s = statSync(join(crashDir, f));
        return { filename: f, modified: s.mtime.toISOString(), size_bytes: s.size };
    })
        .sort((a, b) => b.modified.localeCompare(a.modified));
    return { content: [{ type: "text", text: JSON.stringify({ crash_dir: crashDir, total_crashes: files.length, reports: files }, null, 2) }] };
});
// ── Tool: analyze_crash ──────────────────────────────────────────────
server.tool("analyze_crash", "解析单个崩溃报告，提取 Minecraft 版本、异常类型、错误消息、堆栈顶部信息和综合摘要。", { mc_dir: Str, crash_file: Str }, (params) => {
    const { readFileSync, existsSync } = require("node:fs");
    const { join } = require("node:path");
    const crashPath = join(params.mc_dir, "crash-reports", params.crash_file);
    if (!existsSync(crashPath)) {
        return { content: [{ type: "text", text: `崩溃报告不存在: ${crashPath}` }] };
    }
    const content = readFileSync(crashPath, "utf-8");
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
    return { content: [{ type: "text", text: JSON.stringify({ crash_file: params.crash_file, minecraft_version: mcVersion, exit_code: exitCode, exception_type: exceptionType || "未知", error_message: errorMsg || "未识别到明确错误", stack_trace_top: stackTop, summary: generateSummary(exceptionType, errorMsg, exitCode) }, null, 2) }] };
});
// ── Tool: check_mod_dependencies ─────────────────────────────────────
server.tool("check_mod_dependencies", "通过 Modrinth API 查询模组的依赖信息：最新兼容版本、required/optional 依赖、MC 版本兼容列表。", { project_id: Str, mc_version: Str, loader: OptStr }, async (params) => {
    const { project_id, mc_version, loader } = params;
    const API = "https://api.modrinth.com/v2";
    try {
        const projResp = await fetch(`${API}/project/${project_id}`);
        if (!projResp.ok)
            return { content: [{ type: "text", text: `API 错误 ${projResp.status}: ${project_id}` }] };
        const project = await projResp.json();
        const verUrl = new URL(`${API}/project/${project_id}/version`);
        verUrl.searchParams.set("game_version", mc_version);
        if (loader)
            verUrl.searchParams.set("loader", loader);
        verUrl.searchParams.set("status", "released");
        verUrl.searchParams.set("limit", "10");
        const verResp = await fetch(verUrl.toString());
        if (!verResp.ok)
            return { content: [{ type: "text", text: `获取版本失败: ${verResp.status}` }] };
        const versions = await verResp.json();
        // Find the latest version matching both loader and game_version
        const matching = versions.find((v) => {
            const loaders = (v.loaders ?? []);
            const gameVersions = (v.game_versions ?? []);
            return loaders.includes(loader ?? "") && gameVersions.includes(mc_version);
        });
        const latest = matching ?? versions[0] ?? {};
        const deps = latest.dependencies ?? [];
        const requiredDeps = deps.filter((d) => d.required).map((d) => d.project_id);
        const optionalDeps = deps.filter((d) => !d.required).map((d) => d.project_id);
        const cat = project.categories.includes("fabric") ? "fabric" : project.categories.includes("forge") ? "forge" : "unknown";
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
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `查询失败: ${e instanceof Error ? e.message : String(e)}` }] };
    }
});
// ── Helpers ──────────────────────────────────────────────────────────
function detectMcDir() {
    const { join } = require("node:path");
    const { existsSync } = require("node:fs");
    const candidates = [
        join(process.env.USERPROFILE ?? "", ".minecraft"),
        join(process.env.APPDATA ?? "", ".minecraft"),
        join(process.cwd(), ".minecraft"),
    ];
    for (const p of candidates) {
        if (existsSync(p))
            return p;
    }
    return candidates[0] ?? ".minecraft";
}
function detectPclConfig(mcDir) {
    const { join } = require("node:path");
    const { existsSync } = require("node:fs");
    // PCL on Windows: %APPDATA%\PCL\config.json
    const appdata = process.env.APPDATA || join(process.env.USERPROFILE ?? "", "AppData", "Roaming");
    const candidates = [
        join(appdata, "PCL", "config.json"),
        join(mcDir, "..", "PCL", "config.json"),
        join(mcDir, "PCL", "config.json"),
    ];
    for (const p of candidates) {
        if (existsSync(p))
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
