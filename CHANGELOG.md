# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
