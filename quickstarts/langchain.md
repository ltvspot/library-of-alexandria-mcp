# LangChain and LangGraph

`langchain-mcp-adapters` loads the library's tools as LangChain tools.

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient

async def main():
    client = MultiServerMCPClient({
        "library": {"transport": "streamable_http", "url": "https://mcp.libraryofalexandria.com/mcp"},
    })
    tools = await client.get_tools()          # the eight tools
    search = next(t for t in tools if t.name == "search_books")
    print(await search.ainvoke({"query": "Meditations", "limit": 3}))

asyncio.run(main())
```

Pass `tools` to your agent as usual (for example `create_react_agent(model, tools)` in LangGraph). Without MCP, use the REST API through `loa_library.Loa` (see `sdk/python`).
