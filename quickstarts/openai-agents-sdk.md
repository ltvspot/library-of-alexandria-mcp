# OpenAI Agents SDK

```python
import asyncio
from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp

async def main():
    async with MCPServerStreamableHttp(
        name="Library of Alexandria",
        params={"url": "https://mcp.libraryofalexandria.com/mcp"},
        cache_tools_list=True,
    ) as library:
        agent = Agent(
            name="Reading guide",
            instructions="Help people find classic books. Quote the address of each title as the tools give it.",
            mcp_servers=[library],
        )
        result = await Runner.run(agent, "Which of Jane Austen's books is on the free shelf in English?")
        print(result.final_output)

asyncio.run(main())
```

The tools only read and need no key. For a program without MCP, the REST API and `function-tools/openai.json` do the same.
