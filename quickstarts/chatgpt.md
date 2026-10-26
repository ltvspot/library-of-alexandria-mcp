# ChatGPT and the OpenAI API

**In ChatGPT:** open [ChatGPT Plugins](https://chatgpt.com/plugins), choose the plus button and **Add custom MCP server**, enter `https://mcp.libraryofalexandria.com/mcp`, confirm the warning ("I understand and want to continue") and choose **Create as a plugin**. Install it and ask for a book. The library needs no sign-in. (The same address works where your plan allows custom MCP servers.)

**Responses API:**

```python
from openai import OpenAI

client = OpenAI()
response = client.responses.create(
    model="gpt-6.1-sol",
    input="Find Pride and Prejudice and give me the address of its page.",
    tools=[{
        "type": "mcp",
        "server_label": "library",
        "server_url": "https://mcp.libraryofalexandria.com/mcp",
        "allowed_tools": ["search_books", "get_book"],
        "require_approval": "never",
    }],
)
print(response.output_text)
```

All eight tools only read, so `require_approval: "never"` is safe here. **Function calling without MCP:** pass `function-tools/openai.json` as `tools` and answer the calls with the REST API or the clients of this kit.
