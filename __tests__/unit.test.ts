const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const mod = require("../dist/index");
const rules = require("../dist/rules.json");

// ── Helper: create a temp mods dir with controlled jar files ──────────

function createTempInstance(jarNames) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-"));
  const versionDir = path.join(tmpDir, "versions", "test-inst");
  const modsDir = path.join(versionDir, "mods");
  fs.mkdirSync(modsDir, { recursive: true });
  fs.writeFileSync(path.join(versionDir, "test-inst.json"), "{}");
  for (const name of jarNames) {
    fs.writeFileSync(path.join(modsDir, name), "fake-jar");
  }
  return { mcDir: tmpDir, instanceId: "test-inst", modsDir };
}

function destroyTemp(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── parseJavaVersion ──────────────────────────────────────────────────

describe("parseJavaVersion", () => {
  it("parses '17.0.15' correctly", () => {
    assert.deepEqual(mod.parseJavaVersion("17.0.15"), { major: 17, minor: 0, build: 15 });
  });

  it("parses '21.0.7' correctly", () => {
    assert.deepEqual(mod.parseJavaVersion("21.0.7"), { major: 21, minor: 0, build: 7 });
  });

  it("returns null for non-numeric strings", () => {
    assert.equal(mod.parseJavaVersion("unknown"), null);
    assert.equal(mod.parseJavaVersion("Java 17"), null);
  });

  it("returns null for empty string", () => {
    assert.equal(mod.parseJavaVersion(""), null);
  });

  it("handles version with pre-release suffix", () => {
    assert.deepEqual(mod.parseJavaVersion("17.0.15+8"), { major: 17, minor: 0, build: 15 });
  });
});

// ── detectConflicts ───────────────────────────────────────────────────

describe("detectConflicts", () => {
  it("returns empty array when no conflict jars exist", () => {
    const { mcDir, instanceId } = createTempInstance(["sodium.jar", "jei.jar"]);
    try {
      const result = mod.detectConflicts(mcDir, instanceId);
      assert.equal(result.length, 0, "should find no conflicts with single renderers");
    } finally { destroyTemp(mcDir); }
  });

  it("detects sodium + embeddium conflict (single-pattern rule)", () => {
    const { mcDir, instanceId } = createTempInstance(["sodium.jar", "embeddium.jar"]);
    try {
      const result = mod.detectConflicts(mcDir, instanceId);
      const rendererConflict = result.find((f) => f.id === "renderer-sodium-embeddium");
      assert.ok(rendererConflict, "should detect renderer conflict");
      assert.equal(rendererConflict.matches.length, 2);
      assert.equal(rendererConflict.severity, "error");
    } finally { destroyTemp(mcDir); }
  });

  it("detects iris + sodium conflict (multi-pattern rule)", () => {
    const { mcDir, instanceId } = createTempInstance(["iris.jar", "sodium.jar"]);
    try {
      const result = mod.detectConflicts(mcDir, instanceId);
      const irisSodium = result.find((f) => f.id === "renderer-iris-sodium");
      assert.ok(irisSodium, "should detect iris+sodium conflict");
      assert.equal(irisSodium.matches.length, 2);
    } finally { destroyTemp(mcDir); }
  });

  it("does not trigger single-pattern rules with only one match", () => {
    const { mcDir, instanceId } = createTempInstance(["sodium.jar"]);
    try {
      const result = mod.detectConflicts(mcDir, instanceId);
      const rendererConflict = result.find((f) => f.id === "renderer-sodium-embeddium");
      assert.equal(rendererConflict, undefined, "single sodium should not trigger conflict");
    } finally { destroyTemp(mcDir); }
  });

  it("returns empty array for missing mods dir", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-nomod-"));
    try {
      const result = mod.detectConflicts(tmpDir, "nonexistent");
      assert.deepEqual(result, []);
    } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
  });
});

// ── scanCleanliness ───────────────────────────────────────────────────

describe("scanCleanliness", () => {
  it("returns empty when only valid jars exist", () => {
    const { mcDir, instanceId } = createTempInstance(["sodium.jar", "jei.jar"]);
    try {
      const result = mod.scanCleanliness(mcDir, instanceId);
      assert.equal(result.length, 0);
    } finally { destroyTemp(mcDir); }
  });

  it("detects .ps1 script files as issue", () => {
    const { mcDir, instanceId } = createTempInstance(["sodium.jar", "setup.ps1"]);
    try {
      const result = mod.scanCleanliness(mcDir, instanceId);
      const scriptsIssue = result.find((i) => i.type === "脚本文件");
      assert.ok(scriptsIssue, "should detect .ps1 files");
      assert.deepEqual(scriptsIssue.files, ["setup.ps1"]);
    } finally { destroyTemp(mcDir); }
  });

  it("detects source jars as issue", () => {
    const { mcDir, instanceId } = createTempInstance(["sodium.jar", "sodium-sources.jar"]);
    try {
      const result = mod.scanCleanliness(mcDir, instanceId);
      const srcIssue = result.find((i) => i.type === "Source JAR");
      assert.ok(srcIssue, "should detect source jars");
      assert.deepEqual(srcIssue.files, ["sodium-sources.jar"]);
    } finally { destroyTemp(mcDir); }
  });

  it("ignores .jar.lock files", () => {
    const { mcDir, instanceId } = createTempInstance(["sodium.jar", "sodium.jar.lock"]);
    try {
      const result = mod.scanCleanliness(mcDir, instanceId);
      assert.equal(result.length, 0, ".jar.lock should be ignored");
    } finally { destroyTemp(mcDir); }
  });

  it("returns empty array for missing mods dir", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-noclean-"));
    try {
      const result = mod.scanCleanliness(tmpDir, "nonexistent");
      assert.deepEqual(result, []);
    } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
  });
});

// ── resolveJavaForMC ──────────────────────────────────────────────────

describe("resolveJavaForMC", () => {
  it("returns correct Java for MC 1.20.1", () => {
    const r = mod.resolveJavaForMC("1.20.1");
    assert.ok(r, "should resolve Java for 1.20.1");
    assert.equal(r.minJava, 17);
    assert.equal(r.recommendedJava, 17);
  });

  it("returns correct Java for MC 1.21", () => {
    const r = mod.resolveJavaForMC("1.21");
    assert.ok(r, "should resolve Java for 1.21");
    assert.equal(r.minJava, 21);
    assert.equal(r.recommendedJava, 21);
  });

  it("returns null for unknown version", () => {
    const r = mod.resolveJavaForMC("unknown");
    assert.equal(r, null);
  });
});

// ── generateSummary ───────────────────────────────────────────────────

describe("generateSummary", () => {
  it("identifies NoSuchMethodError", () => {
    const summary = mod.generateSummary("NoSuchMethodError", "", null);
    assert.match(summary, /模组与 MC 版本不兼容/i);
  });

  it("identifies ClassNotFoundException", () => {
    const summary = mod.generateSummary("ClassNotFoundException", "", null);
    assert.match(summary, /缺少依赖模组/i);
  });

  it("identifies OutOfMemoryError", () => {
    const summary = mod.generateSummary("OutOfMemoryError", "", null);
    assert.match(summary, /堆内存不足/i);
  });

  it("handles exit code 1 without exception", () => {
    const summary = mod.generateSummary("", "", "1");
    assert.match(summary, /退出码 1/i);
  });

  it("returns default message for unknown exception", () => {
    const summary = mod.generateSummary("WeirdException", "some error", null);
    assert.match(summary, /WeirdException/);
  });
});
