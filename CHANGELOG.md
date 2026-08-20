# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-08-20

### Added
- **External rules engine**: All conflict rules, Java version table, and crash analysis patterns moved to `src/rules.json` — users can now edit rules without touching code
- **Human-readable output**: Every tool now returns friendly text with emojis and actionable tips, followed by `--- JSON ---` for programmatic parsing
- **Error resolution tips**: Failed calls now include 💡 suggestions (e.g., "Please install PCL" or "Check your MC version format")
- **CLI diagnostic tool**: New `npm run diagnose` command for interactive diagnosis without MCP — supports conflict check, cleanliness scan, crash analysis, and Java detection
- **9 new conflict rules** in `rules.json`: OptiFine + Fabric, Cloth Config, Architectury API, plus expanded mod crash pattern recognition

### Changed
- `analyze_crash`: Now matches crash patterns from `rules.json` instead of hardcoded logic
- `detect_conflicts`: Uses externalized `conflicts` array from `rules.json`
- `get_version_info`: Shows recommended Java version based on MC version from `javaVersionMap`

## [1.0.2] - 2026-08-20

### Fixed
- **Cross-platform fix**: `detectMcDir()` no longer creates invalid paths on macOS/Linux by only using `APPDATA` when it actually exists
- **README**: Added per-tool platform compatibility table clarifying that `get_java_versions` is Windows/PCL-only while other 8 tools work on all platforms
- **README**: Updated description to accurately reflect Windows-first, cross-platform scope
- **README**: Clarified prerequisites — any launcher supported, `mc_dir` must be passed on non-Windows

## [1.0.1] - 2026-08-20

### Fixed
- **README**: Clarified cross-platform support — tools work on macOS/Linux when `mc_dir` is passed explicitly
- **README**: Added Skills section with Trae Work skill installation instructions
- **test.js**: Replaced hardcoded personal path with `MC_DIR` environment variable (defaults to `~/.minecraft`)
- **package.json**: Added `keywords`, `license`, `engines` fields; converted to CommonJS for MCP SDK compatibility
- **get_java_versions**: Fixed PCL config field mapping (`Folder` + `Version.Major` instead of `Path` + `JavaVersion`)
- **read_log**: Fixed level filter regex to match `[main/WARN]` log format
- **check_mod_dependencies**: Added loader-filtered version lookup from Modrinth API
- Added `skills/mc-modpack-helper/SKILL.md` — Trae Work skill for modpack diagnostics
- Added `.mcp.example.json` — ready-to-use MCP client configuration template
- Added `CONTRIBUTING.md` — contributor guidelines
- Added compiled `dist/index.js` to repo so users can run directly without building

### Changed
- Switched from ESM to CommonJS module system for better MCP SDK compatibility
- Simplified dist output (single `dist/index.js` instead of separate tool files)

## [1.0.0] - 2026-08-19

### Added
- Initial release of mc-modpack-mcp
- **9 MCP tools**: `get_java_versions`, `get_version_info`, `list_mods`, `detect_conflicts`, `scan_cleanliness`, `read_log`, `find_crash_reports`, `analyze_crash`, `check_mod_dependencies`
- Integration test suite (`test.js`) with backup and logging
- Full TypeScript source in `src/index.ts`
- README with installation, usage examples, and architecture docs
- MIT License
- Test coverage: all 9 tools verified against an actual PCL-managed Minecraft instance
