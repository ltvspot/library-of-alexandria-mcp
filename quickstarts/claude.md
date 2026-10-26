# Claude

**claude.ai and the desktop app:** open **Settings > Connectors**, choose **Add custom connector**, and enter `https://mcp.libraryofalexandria.com/mcp`. The library needs no sign-in.

**Claude Code:**

```bash
claude mcp add --transport http library-of-alexandria https://mcp.libraryofalexandria.com/mcp
```

**Claude Desktop with the stdio bridge** (for setups that cannot reach a remote server): add this to `claude_desktop_config.json`, with the path to `mcp-bridge/loa-mcp.mjs` of this kit.

```json
{
  "mcpServers": {
    "library-of-alexandria": {
      "command": "node",
      "args": ["/path/to/mcp-bridge/loa-mcp.mjs"]
    }
  }
}
```

**Claude API (MCP connector):** pass the address as a remote MCP server in your request; the tools are read-only and need no authorization token. A plain alternative is the tool file `function-tools/anthropic.json`, which you pass as `tools` and answer with the Python client or the REST API.
