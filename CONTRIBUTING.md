# Contributing to mc-modpack-mcp

Thanks for your interest in contributing! This document outlines the process for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<username>/mc-modpack-mcp.git`
3. Install dependencies: `npm install`
4. Build: `npm run build`
5. Run tests: `node test.js`
6. Try the CLI: `npm run diagnose`

## Current Priority Needs 🎯

We welcome contributions in these areas, listed by priority:

### 🔴 High Priority — Missing Rule Coverage

- **Additional mod conflicts**: Add new conflict rules to `src/rules.json`. Common examples:
  - OptiFine + Sodium/Fabric API
  - Duplicate mod loaders (Fabric API + Forge)
  - Known broken mod pairs from community reports
- **Java version table expansion**: `javaVersionMap` in `src/rules.json` currently covers 1.12.2–1.21.x. Add missing ranges or fix incorrect entries.
- **Crash analysis patterns**: Add new keyword-to-solution mappings in `crashAnalysisPatterns` based on real crash reports.

### 🟡 Medium Priority — Tool Improvements

- **New MCP tools**: Examples:
  - `scan_mod_metadata` — parse mod.jar files for mod IDs and versions
  - `check_mod_compatibility` — bulk check multiple mods against a target MC version
  - `export_report` — generate a formatted diagnosis report as text/markdown
- **Cross-platform testing**: Help verify tools work on macOS and Linux, especially `get_java_versions` and `detectMcDir`.
- **Localization**: Translate user-facing strings (currently Chinese-only) to English or other languages.

### 🟢 Nice to Have

- **Modrinth/curseforge badge display** in dependency check output
- **Offline mode**: Cache Modrinth API results for repeated checks
- **CI pipeline**: GitHub Actions for automated testing on push

## Adding a New Tool

All tools are registered in `src/index.ts` using the `server.tool()` pattern:

```typescript
server.tool(
  "tool_name",
  "Tool description for the AI agent.",
  {
    param1: z.string(),
    param2: z.string().optional(),
  },
  (params) => {
    // Tool implementation
    return { content: [{ type: "text", text: "result" }] };
  }
);
```

Guidelines:
- Keep tool descriptions clear and specific — agents use them to decide when to call
- Return results with both human-readable text and JSON: `readable + "\n\n--- JSON ---\n" + JSON.stringify(...)`
- Handle errors gracefully — always return a text response with 💡 tips, never throw
- Add corresponding tests in `test.js`
- If your tool uses configurable data, add it to `src/rules.json`

## Adding Conflict Rules

To add a new conflict rule, edit `src/rules.json`:

```json
{
  "id": "unique-rule-id",
  "name": "中文规则名称",
  "patterns": ["keyword1", "keyword2"],
  "severity": "error",
  "solution": "具体的修复建议，告诉用户该怎么做。",
  "emoji": "🔴"
}
```

Severity levels:
- `"error"` (🔴) — Game will crash or break; must fix
- `"warning"` (🟡) — May cause issues; should fix
- `"info"` (ℹ️) — Unusual but may be intentional; for awareness

## Code Style

- TypeScript strict mode is disabled (`"strict": false`) to allow `require()` calls
- Use CommonJS module format (`"module": "CommonJS"`)
- No comments in code unless documenting non-obvious logic
- All paths should handle both Windows (`\`) and POSIX (`/`) separators
- Human-readable output uses emoji and Chinese text; JSON section always follows after `--- JSON ---`

## Testing

Before submitting changes:

```bash
npm run build && node test.js
```

Check `test_logs/` for the latest test output. All 9 tools should pass.

## Pull Request Process

1. Create a feature branch (`git checkout -b feature/new-tool`)
2. Make changes and run tests
3. Update README.md if adding new tools or changing behavior
4. Submit a PR with a clear description of what and why
