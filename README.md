# Library of Alexandria for developers

The library's catalogue, its free shelf and its print editions, as one small set of **read-only tools** that any program, assistant or model can call. There is no key and nothing to sign up for. The tools never sign anyone in, take a payment or change anything; every title they return carries the address of its page on libraryofalexandria.com, where a person reads, listens, prints or starts.

Three doors lead to the same eight tools:

| Door | Address | For |
|---|---|---|
| **MCP** (Streamable HTTP) | `https://mcp.libraryofalexandria.com/mcp` | Claude, ChatGPT, Gemini, Grok, Copilot, Perplexity, Le Chat, LM Studio, Open WebUI, Cursor, VS Code, Goose and every other MCP client |
| **REST + OpenAPI 3.1** | `POST https://api.libraryofalexandria.com/v1/<tool>` and `GET .../v1/openapi.json` | scripts, automation tools (n8n, Zapier, Make, Dify, Flowise), Open WebUI tool servers, Copilot Studio |
| **Tool files** for model makers | `GET .../v1/tools?format=openai|openai-chat|anthropic|gemini|ollama|mcp` | any program that passes tool definitions to a model |

## The eight tools

| Tool | What it does |
|---|---|
| `search_books` | find titles by words from a title, an author or a topic, in any language of the catalogue |
| `get_book` | the facts of one title: author, original title, cover, print editions, its page in each language |
| `get_summary` | the first key idea of the 15-minute summary of one title in full, and the headings of the others (`part` chooses one) |
| `get_sample` | the free opening of one title, in pages of at most 400 words (`page` chooses one) |
| `list_free_shelf` | the titles on the free shelf, by language and subject |
| `read_free_chapter` | one chapter of a free-shelf title, in pages of at most 400 words |
| `get_print_options` | the print editions of one title (standard and large print; paperback or hardcover) with the list price in US dollars |
| `get_publisher_info` | who publishes the library, the languages, the terms and privacy pages |

A summary, a sample page or a free-shelf chapter that is not open yet (a title, a language, or all texts before they go online) answers plainly that it "opens here soon"; the tools then fill in without any change on your side. The text tools count the words they hand out for each client (72,000 a day and 48,000 an hour) and show what is left in `budget`.

## Try it in a minute

```bash
curl -s https://api.libraryofalexandria.com/v1/search_books \
  -H 'content-type: application/json' -d '{"query":"moby dick","limit":3}'
```

The answer is `{"ok": true, "data": {...}, "source": "Library of Alexandria, libraryofalexandria.com"}`. A problem comes back as `application/problem+json` (RFC 9457) with a stable `code`; see `openapi/loa-api.openapi.json`.

## What is in this folder

| Path | What |
|---|---|
| `openapi/loa-api.openapi.json` | the OpenAPI 3.1 file (also served live at `/v1/openapi.json`) |
| `function-tools/*.json` | the eight tools in the shapes of OpenAI (Responses and Chat Completions), Anthropic, Gemini, Ollama and MCP |
| `cli/loa.mjs` | the command line `loa` (Node 18 or newer, no dependencies) |
| `sdk/typescript/loa.mjs`, `loa.d.ts` | the JavaScript and TypeScript client (no dependencies; browsers, Node, Deno, Bun, Workers) |
| `sdk/python/loa_library.py` | the Python client (standard library only) |
| `sdk/python/loa_tools.py` | one plain Python function per tool, for Ollama and any framework that builds tool schemas from type hints |
| `mcp-bridge/loa-mcp.mjs` | a stdio bridge for MCP clients that cannot reach a remote server |
| `quickstarts/` | how to connect LM Studio, Open WebUI, Ollama, Goose, Claude, ChatGPT, Cursor, VS Code, LangChain and the OpenAI Agents SDK |
| `AGENTS.md`, `SKILL.md` | instructions for coding agents and for assistants that help a person with the library |
| `tests/` | the tests of this kit (`node --test tests/*.test.mjs` and `python3 tests/test_python.py`) |

The generated files (`openapi/`, `function-tools/`) are made from the service's own code; a test in the service fails when they are out of date.

## Rules of the library, for everyone who quotes it

- Say what the answer says; use the `url` of a title as given; never invent a price or an offer.
- The library is **not** the ancient library of Alexandria and not the Bibliotheca Alexandrina.
- Payments and sign-up happen on libraryofalexandria.com only; a tool can hand over a link, never take a payment.
- Please keep to a few requests a second and send a `User-Agent` that names your program.

## Versions

The API version is a date, sent back in the `LOA-Version` header (`2026-10-25`). Changes are announced on the developer page.

## Licence

MIT, see [LICENSE](LICENSE). The library's tools return catalogue facts, short summaries and free parts as the service allows; the licence covers this code and these documents, not the books.

## Registry entry

The description of the server for the official MCP Registry is in [server.json](server.json).
