// Consistency tests of the developer kit: one place per tool in every client and every document, one address everywhere, the house words in every text. Run: node --test tests/kit.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => readFileSync(root + rel, 'utf8');
const json = (rel) => JSON.parse(read(rel));
const tools = json('function-tools/mcp.json').map((t) => t.name);
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const BASE = 'https://api.libraryofalexandria.com';
const MCP = 'https://mcp.libraryofalexandria.com';   // DISCO-1 (D253 (4)): the MCP endpoint has its own hostname; the REST door and the OpenAPI file are on api.

const DOCS = ['README.md', 'AGENTS.md', 'SKILL.md', 'docs-page/developers.html', ...readdirSync(root + 'quickstarts').map((f) => 'quickstarts/' + f)];
// words that never appear in a text the library publishes about itself
// (the names of free sources are written in two pieces so that this public file does not spell them; DEV-3, 26 Oct 2026)
const FORBIDDEN = new RegExp(['public[\\s-]*domain', 'guten' + 'berg', 'wiki' + 'source', 'sacred' + '-texts', '\\btrials?\\b', 'discount', 'subscri', 'per (month|year)', 'a (month|year)\\b', 'membership', 'modern english'].join('|'), 'i');

test('the eight tools of the tool files are the eight tools this kit documents', () => {
  assert.equal(tools.length, 8);
  assert.deepEqual(tools, ['search_books', 'get_book', 'get_summary', 'get_sample', 'list_free_shelf', 'read_free_chapter', 'get_print_options', 'get_publisher_info']);
});

test('every tool has a method in the JavaScript client and its types, and in the Python client and its plain functions', () => {
  const js = read('sdk/typescript/loa.mjs'), dts = read('sdk/typescript/loa.d.ts'), py = read('sdk/python/loa_library.py'), fn = read('sdk/python/loa_tools.py');
  for (const t of tools) {
    assert.ok(js.includes(`async ${camel(t)}(`), `loa.mjs ${t}`);
    assert.ok(dts.includes(`${camel(t)}(`), `loa.d.ts ${t}`);
    assert.ok(py.includes(`def ${t}(`), `loa_library.py ${t}`);
    assert.ok(fn.includes(`def ${t}(`), `loa_tools.py ${t}`);
  }
});

test('every tool is named in the README, the skill and the developer page', () => {
  for (const file of ['README.md', 'SKILL.md', 'docs-page/developers.html']) {
    const text = read(file);
    for (const t of tools) assert.ok(text.includes(t), `${file} names ${t}`);
  }
});

test('the command line offers a command for every tool', () => {
  const help = read('cli/loa.mjs');
  for (const c of ['search <words...>', 'book <id>', 'summary <id>', 'sample <id>', 'free list', 'free read <id>', 'print options <id>', 'publisher']) assert.ok(help.includes(c), c);
});

test('one address everywhere: the clients, the bridge, the OpenAPI file, the documents', () => {
  assert.ok(read('sdk/typescript/loa.mjs').includes(`'${BASE}'`));
  assert.ok(read('sdk/python/loa_library.py').includes(`"${BASE}"`));
  assert.ok(read('mcp-bridge/loa-mcp.mjs').includes(`${MCP}/mcp`));
  assert.equal(json('openapi/loa-api.openapi.json').servers[0].url, BASE);
  for (const f of ['README.md', 'AGENTS.md', 'docs-page/developers.html', ...DOCS.filter((d) => d.startsWith('quickstarts/'))]) {
    const text = read(f);
    for (const m of text.matchAll(/https:\/\/[a-z0-9.-]*workers\.dev/g)) assert.fail(`${f}: ${m[0]}`);
  }
});

test('the generated files list the same eight tools in every shape', () => {
  for (const f of ['openai', 'openai-chat', 'anthropic', 'gemini', 'ollama']) {
    const j = json(`function-tools/${f}.json`);
    const names = f === 'gemini' ? j[0].function_declarations.map((d) => d.name) : j.map((t) => t.name ?? t.function.name);
    assert.deepEqual(names, tools, f);
  }
  const ops = Object.values(json('openapi/loa-api.openapi.json').paths).map((p) => p.post.operationId);
  assert.deepEqual(ops, tools);
});

test('no document uses a word the library never publishes about itself', () => {
  for (const f of DOCS) {
    const hit = read(f).match(FORBIDDEN);
    assert.equal(hit, null, `${f}: ${hit && hit[0]}`);
  }
});

test('the ten quick-start pages exist and each gives an address a person can paste', () => {
  const files = readdirSync(root + 'quickstarts').sort();
  assert.deepEqual(files, ['chatgpt.md', 'claude.md', 'cursor.md', 'goose.md', 'langchain.md', 'lm-studio.md', 'ollama.md', 'open-webui.md', 'openai-agents-sdk.md', 'vscode.md']);
  for (const f of files) {
    const text = read('quickstarts/' + f);
    assert.ok(text.startsWith('# '), f);
    if (f !== 'ollama.md') assert.ok(text.includes(`${MCP}/mcp`), f);
    assert.ok(text.length > 300 && text.length < 3500, `${f} size ${text.length}`);
  }
});

test('the developer page is plain, safe HTML: no script, headings with ids, code blocks that scroll instead of widening the page, lists instead of tables', () => {
  const html = read('docs-page/developers.html');
  assert.equal(/<script|<iframe|<img|javascript:|onerror=/i.test(html), false);
  assert.equal(/<h1/i.test(html), false);
  const h2 = [...html.matchAll(/<h2 id="([a-z-]+)">/g)].map((m) => m[1]);
  assert.deepEqual(h2, ['doors', 'quick', 'tools', 'mcp', 'rest', 'files', 'errors', 'use', 'privacy', 'versions']);
  assert.equal((html.match(/<h2/g) || []).length, h2.length);
  const pres = html.match(/<pre[^>]*>/g) || [];
  assert.ok(pres.length >= 3);
  for (const p of pres) assert.match(p, /overflow-x:auto/);
  assert.equal(/<table/i.test(html), false);
  assert.ok(html.length < 14000);
});

test('the package files are valid and name their entry points', () => {
  const sdk = json('sdk/typescript/package.json'), cli = json('cli/package.json'), br = json('mcp-bridge/package.json');
  assert.equal(sdk.main, './loa.mjs');
  assert.equal(sdk.types, './loa.d.ts');
  assert.equal(cli.bin.loa, './loa.mjs');
  assert.equal(br.bin['loa-mcp'], './loa-mcp.mjs');
  for (const p of [sdk, cli, br]) { assert.equal(p.type, 'module'); assert.match(p.version, /^\d+\.\d+\.\d+$/); assert.ok(p.name.startsWith('@libraryofalexandria/')); }
  assert.ok(existsSync(root + 'sdk/python/pyproject.toml'));
});
