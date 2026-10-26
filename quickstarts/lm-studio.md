# LM Studio

LM Studio (0.3.17 or newer) can connect to a remote MCP server by its address. No key is needed.

1. Open the **Program** tab in the right-hand sidebar.
2. Click **Install**, then **Edit mcp.json**.
3. Add the library under `mcpServers`:

```json
{
  "mcpServers": {
    "library-of-alexandria": {
      "url": "https://mcp.libraryofalexandria.com/mcp"
    }
  }
}
```

4. Save. The eight tools show up in the tool list; switch them on for the chat.

Small local models cope better with a short tool list: if yours loses its way, ask the model to use only `search_books` and `get_book`, or call the tools from your own code with `loa_tools.py` (see the Ollama page).
