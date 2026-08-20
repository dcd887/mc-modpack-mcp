# Contributing to mc-modpack-mcp

Thanks for your interest in contributing! This document outlines the process for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<username>/mc-modpack-mcp.git`
3. Install dependencies: `npm install`
4. Build: `npm run build`
5. Run tests: `node test.js`

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
- Return results as `{ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }`
- Handle errors gracefully — always return a text response, never throw
- Add corresponding tests in `test.js`

## Code Style

- TypeScript strict mode is disabled (`"strict": false`) to allow `require()` calls
- Use CommonJS module format (`"module": "CommonJS"`)
- No comments in code unless documenting non-obvious logic
- All paths should handle both Windows (`\`) and POSIX (`/`) separators

## Testing

Before submitting changes:

```bash
npm run build && node test.js
```

Check `test_logs/` for the latest test output. All 9 tools should pass.

## Pull Request Process

1. Create a feature branch (`git checkout -b feature/new-tool`)
2. Make changes and run tests
3. Update README.md if adding new tools
4. Submit a PR with a clear description of what and why
