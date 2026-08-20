# mc-modpack-mcp

MCP (Model Context Protocol) server for Minecraft modpack diagnostics. Supports Fabric/Forge mod conflict detection, log analysis, crash reports, and dependency lookup. `get_java_versions` requires PCL launcher on Windows; all other tools work cross-platform.

## Features

- **Java version detection** — reads PCL config to list all available Java runtimes
- **Version info** — parses instance JSON to extract Minecraft version, loader, Java requirements, JVM args
- **Conflict detection** — finds known problematic mod combinations (renderers, UI libs, JEI, Fabric API)
- **Cleanliness scan** — detects non-JAR files, source jars, scripts in mods/ directory
- **Log analysis** — reads latest.log with level filtering (INFO/WARN/ERROR) and keyword search
- **Crash report analysis** — finds and parses crash-reports, extracts exception type and summary
- **Dependency lookup** — queries Modrinth API for mod version and dependency info

## Tools

| Tool | Description |
|------|-------------|
| `get_java_versions` | List all Java runtimes from PCL config |
| `get_version_info` | Read instance metadata (version, loader, Java, JVM args, mod count) |
| `list_mods` | Scan mods/ directory, optionally filter by regex |
| `detect_conflicts` | Detect known mod conflicts (Sodium/Embeddium, Iris, UI Lib, JEI, Fabric API) |
| `scan_cleanliness` | Find non-JAR files, source jars, scripts in mods/ |
| `read_log` | Read latest.log with level/keyword/tail filtering |
| `find_crash_reports` | List all crash reports in crash-reports/ |
| `analyze_crash` | Parse a crash report, extract exception type and summary |
| `check_mod_dependencies` | Query Modrinth API for mod deps and compatibility |

## Installation

### Prerequisites

- Node.js 18+
- npm
- A Minecraft instance (any launcher — macOS/Linux users must pass `mc_dir` explicitly for all tools)

> **Note:** `get_java_versions` reads PCL launcher config and works on Windows only. All other tools are cross-platform.

### Build

```bash
cd mc-modpack-mcp
npm install
npm run build
```

### Run as standalone MCP server

```bash
node dist/index.js
```

The server communicates via stdio (JSON-RPC 2.0). It can be consumed by any MCP-compatible client.

### Configuration for MCP clients

Add to your MCP client config (e.g., `.mcp.json` or equivalent):

```json
{
  "mcpServers": {
    "mc-modpack": {
      "command": "node",
      "args": ["/absolute/path/to/mc-modpack-mcp/dist/index.js"]
    }
  }
}
```

## Usage Examples

### Get Java versions from PCL

```json
{
  "name": "get_java_versions",
  "arguments": {
    "mc_dir": "{your_minecraft_directory}"
  }
}
```

### Detect conflicts in an instance

```json
{
  "name": "detect_conflicts",
  "arguments": {
    "mc_dir": "{your_minecraft_directory}",
    "instance_id": "rpg"
  }
}
```

### Read WARN logs (last 50 lines)

```json
{
  "name": "read_log",
  "arguments": {
    "mc_dir": "{your_minecraft_directory}",
    "instance_id": "rpg",
    "level": "WARN",
    "tail": 50
  }
}
```

### Check mod dependencies via Modrinth

```json
{
  "name": "check_mod_dependencies",
  "arguments": {
    "project_id": "sodium",
    "mc_version": "1.20.1",
    "loader": "fabric"
  }
}
```

## Architecture

```
mc-modpack-mcp/
├── src/
│   └── index.ts        # All tool implementations + MCP server setup
├── dist/               # Compiled JavaScript (output of tsc)
├── skills/
│   └── mc-modpack-helper/
│       └── SKILL.md    # Trae Work skill for modpack diagnostics
├── package.json        # Node.js dependencies (@modelcontextprotocol/sdk, zod)
├── tsconfig.json       # TypeScript config (CommonJS output)
├── .gitignore
├── test.js             # Integration test runner
├── test_logs/          # Test output logs (gitignored)
└── backups/            # Backup snapshots from tests (gitignored)
```

The MCP uses the official `@modelcontextprotocol/sdk` v1.x with `McpServer` and `StdioServerTransport`. All tools use `server.tool()` registration pattern compatible with the MCP SDK specification.

## Skills

This repository also includes a Trae Work skill for modpack diagnostics. After cloning, copy the skill to your Trae Work skills directory:

**Windows (PowerShell):**
```powershell
copy skills\mc-modpack-helper\SKILL.md "$env:USERPROFILE\.trae\skills\mc-modpack-helper\SKILL.md"
```

**macOS / Linux:**
```bash
mkdir -p ~/.trae/skills/mc-modpack-helper
cp skills/mc-modpack-helper/SKILL.md ~/.trae/skills/mc-modpack-helper/SKILL.md
```

See [SKILL.md](./skills/mc-modpack-helper/SKILL.md) for the full skill documentation with 8-phase diagnostic workflow.

## Testing

```bash
npm run build
MC_DIR=/path/to/your/.minecraft node test.js
```

Or on Windows (PowerShell):

```powershell
$env:MC_DIR="C:\path\to\your\.minecraft"; node test.js
```

Tests create backups before running and log results to `test_logs/`. See individual test log files for detailed output.

## Platform Compatibility

| Tool | Windows | macOS | Linux |
|------|---------|-------|-------|
| `get_java_versions` | ✅ Full | ⚠️ PCL-only | ⚠️ PCL-only |
| `get_version_info` | ✅ | ✅ | ✅ |
| `list_mods` | ✅ | ✅ | ✅ |
| `detect_conflicts` | ✅ | ✅ | ✅ |
| `scan_cleanliness` | ✅ | ✅ | ✅ |
| `read_log` | ✅ | ✅ | ✅ |
| `find_crash_reports` | ✅ | ✅ | ✅ |
| `analyze_crash` | ✅ | ✅ | ✅ |
| `check_mod_dependencies` | ✅ | ✅ | ✅ |

All tools accept `mc_dir` as an explicit path. `get_java_versions` auto-detects PCL on Windows; on other platforms it returns a clear message when PCL config is absent.

## License

MIT
