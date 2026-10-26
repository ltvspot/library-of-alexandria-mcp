# AGENTS.md: the developer kit of Library of Alexandria

For coding agents (Codex, Claude Code, Cursor, Copilot's agent, Gemini CLI, Jules, Windsurf, Aider, Goose, Warp and others) that work in this folder or build something that calls the library.

## What this is
A small kit around one read-only API: eight tools that look up books, the free shelf and print editions of Library of Alexandria Press. Three doors, one implementation: MCP (`/mcp`), REST (`POST /v1/<tool>`, OpenAPI 3.1 at `/v1/openapi.json`), tool files per model maker (`/v1/tools?format=`). Base address today: `https://api.libraryofalexandria.com`. No key, no sign-in, read only.

## Layout
- `openapi/` and `function-tools/`: generated from the service's code. Never edit by hand; the service's test `ailist1-kit-drift` fails when they are out of date, and the writer is `service/tools/ailist1_snapshot.test.ts`.
- `sdk/typescript/loa.mjs` (+ `loa.d.ts`), `cli/loa.mjs`, `mcp-bridge/loa-mcp.mjs`: Node 18 or newer, ES modules, **no dependencies, no build step**. Keep it that way.
- `sdk/python/loa_library.py`, `sdk/python/loa_tools.py`: Python 3.10 or newer, **standard library only**.
- `tests/`: `node --test tests/sdk.test.mjs tests/cli.test.mjs tests/bridge.test.mjs`, `python3 -I tests/test_python.py`, `node --test tests/kit.test.mjs`. They start local fake servers on 127.0.0.1 and need no network.

## Commands
```
node --test tests/*.test.mjs        # JavaScript side
python3 -I tests/test_python.py     # Python side
node cli/loa.mjs search "moby dick" --json
```

## Rules for changes
1. One tool = one method in each client (`searchBooks` / `search_books`), one function in `loa_tools.py`, one entry in the generated files. A new tool means: the service first, then regenerate, then the clients.
2. Errors are problem+json with a stable `code`; clients raise `LoaError` (`status`, `code`, `title`, `detail`, `retryAfter`). Do not invent new codes in a client.
3. Never add a tool that downloads, exports or lists whole texts. The library's tools return small, limited pieces; that is a rule of the service, not a missing feature.
4. Texts a person reads (help, errors, docs) follow the library's own wording: "200,000+" for the size of the library and no other count of titles; the only amounts are the US dollar prices of printed copies that a tool returns; no offers; no word about how the books are made; nothing that sends a reader to another edition or another source.
5. Never log or print what a person asked. The service counts clients by name and version only.

## How to call it (copy and paste)
```bash
curl -s https://api.libraryofalexandria.com/v1/get_book \
  -H 'content-type: application/json' -d '{"id":"top3500-00002","language":"en"}'
```
```js
import { Loa } from './sdk/typescript/loa.mjs';
const library = new Loa();
const { results } = await library.searchBooks({ query: 'Meditations', language: 'en', limit: 3 });
```
```python
from loa_library import Loa
print(Loa().search_books('Meditations', language='en', limit=3)['results'][0]['url'])
```

## Quoting the library in an answer
Use the `title`, `author` and `url` of a result as given. Say that something "opens here soon" when a tool says so. Do not promise anything the tool did not return (no price you were not given, no offer, no delivery date). Payments and sign-up happen on libraryofalexandria.com only.
