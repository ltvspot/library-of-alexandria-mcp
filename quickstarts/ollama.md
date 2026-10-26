# Ollama (and any local model with tool calling)

Ollama has no MCP manager of its own: the program that calls the model runs the tools. Ollama's Python client accepts ordinary Python functions as tools and builds the schema from their type hints and docstrings. `sdk/python/loa_tools.py` holds one such function per tool (standard library only).

```python
import ollama
import loa_tools                      # from sdk/python

messages = [{"role": "user", "content": "Find Moby-Dick and give me the address of its page."}]
reply = ollama.chat(model="qwen3", messages=messages, tools=loa_tools.TOOLS)

for call in reply.message.tool_calls or []:
    fn = getattr(loa_tools, call.function.name)
    result = fn(**call.function.arguments)          # a dict; a problem comes back as {"error": ..., "code": ...}
    messages += [reply.message, {"role": "tool", "tool_name": call.function.name, "content": str(result)}]

print(ollama.chat(model="qwen3", messages=messages).message.content)
```

Small models do best with a short list: pass only the tools the task needs, for example `tools=[loa_tools.search_books, loa_tools.get_book]`. For frameworks that want JSON tool definitions, `function-tools/ollama.json` has the same eight tools in the Chat Completions shape.
