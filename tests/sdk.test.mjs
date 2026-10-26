// Tests of the TypeScript/JavaScript client: sdk/typescript/loa.mjs (zero dependencies). Run: node --test tests/sdk.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIXTURE, PROBLEM_TYPE, TOOL_NAMES, deadAddress, problem, startMock } from './mock.mjs';
import { API_VERSION, DEFAULT_BASE_URL, Loa, LoaError } from '../sdk/typescript/loa.mjs';

const bodyOf = (rec) => JSON.parse(rec.body || '{}');

test('exports: the default address is the live reading service, the API version is the date of the OpenAPI file', () => {
  assert.equal(DEFAULT_BASE_URL, 'https://api.libraryofalexandria.com');
  assert.equal(API_VERSION, '2026-10-25');
  assert.equal(typeof Loa, 'function');
  assert.ok(new LoaError('x') instanceof Error);
});

test('call posts the arguments as JSON to /v1/<tool> and returns the data of the envelope', async () => {
  const s = await startMock();
  try {
    const loa = new Loa({ baseUrl: s.url });
    const data = await loa.call('search_books', { query: 'moby dick', limit: 3 });
    assert.deepEqual(data, FIXTURE.search_books);
    assert.equal(s.requests.length, 1);
    const r = s.requests[0];
    assert.equal(r.method, 'POST');
    assert.equal(r.url, '/v1/search_books');
    assert.match(r.headers['content-type'], /^application\/json/);
    assert.match(r.headers.accept, /application\/json/);
    assert.equal(r.headers['loa-version'], API_VERSION);
    assert.deepEqual(bodyOf(r), { query: 'moby dick', limit: 3 });
  } finally { await s.close(); }
});

test('the base address loses trailing slashes; LOA_API_URL is the default; without both it is the live address', async () => {
  const s = await startMock();
  try {
    assert.equal(new Loa({ baseUrl: s.url + '///' }).baseUrl, s.url);
    await new Loa({ baseUrl: s.url + '/' }).call('get_publisher_info');
    assert.equal(s.requests[0].url, '/v1/get_publisher_info');
    const keep = process.env.LOA_API_URL;
    process.env.LOA_API_URL = s.url;
    assert.equal(new Loa().baseUrl, s.url);
    delete process.env.LOA_API_URL;
    assert.equal(new Loa().baseUrl, DEFAULT_BASE_URL);
    if (keep !== undefined) process.env.LOA_API_URL = keep;
  } finally { await s.close(); }
});

test('undefined arguments are left out and a call without arguments sends an empty object', async () => {
  const s = await startMock();
  try {
    const loa = new Loa({ baseUrl: s.url });
    await loa.call('get_book', { id: 'top3500-00002', language: undefined });
    await loa.call('get_publisher_info');
    assert.deepEqual(bodyOf(s.requests[0]), { id: 'top3500-00002' });
    assert.deepEqual(bodyOf(s.requests[1]), {});
  } finally { await s.close(); }
});

const WRAPPERS = [
  ['searchBooks', 'search_books', { query: 'moby', language: 'de', limit: 2 }],
  ['getBook', 'get_book', { id: 'top3500-00002', language: 'fr' }],
  ['getSummary', 'get_summary', { id: 'top3500-00002', language: 'es' }],
  ['getSample', 'get_sample', { id: 'top3500-00002' }],
  ['listFreeShelf', 'list_free_shelf', { language: 'es', subject: 'philosophy', limit: 5 }],
  ['readFreeChapter', 'read_free_chapter', { id: 'top3500-00013', chapter: 2, page: 3, language: 'en' }],
  ['getPrintOptions', 'get_print_options', { id: 'top3500-00002' }],
  ['getPublisherInfo', 'get_publisher_info', undefined],
];
for (const [method, tool, args] of WRAPPERS) {
  test(`${method}() calls ${tool} with the same arguments and returns its data`, async () => {
    const s = await startMock();
    try {
      const loa = new Loa({ baseUrl: s.url });
      assert.equal(typeof loa[method], 'function');
      const data = await (args === undefined ? loa[method]() : loa[method](args));
      assert.deepEqual(data, FIXTURE[tool]);
      assert.equal(s.requests[0].url, '/v1/' + tool);
      assert.deepEqual(bodyOf(s.requests[0]), args ?? {});
    } finally { await s.close(); }
  });
}

test('every tool of the fixture has a wrapper (a new tool needs a new method)', () => {
  assert.deepEqual(WRAPPERS.map((w) => w[1]).sort(), [...TOOL_NAMES].sort());
});

test('a tool name that is not snake_case is refused before any request', async () => {
  const s = await startMock();
  try {
    const loa = new Loa({ baseUrl: s.url });
    for (const bad of ['', 'Search_Books', 'a/b', '../x', 'x'.repeat(65), 'search books']) {
      await assert.rejects(() => loa.call(bad, {}), TypeError);
    }
    assert.equal(s.requests.length, 0);
  } finally { await s.close(); }
});

test('a problem+json answer becomes a LoaError with status, code, title, detail and type', async () => {
  const s = await startMock();
  try {
    const loa = new Loa({ baseUrl: s.url });
    await assert.rejects(() => loa.call('no_such_tool', {}), (e) => {
      assert.ok(e instanceof LoaError && e instanceof Error);
      assert.equal(e.name, 'LoaError');
      assert.equal(e.status, 404);
      assert.equal(e.code, 'unknown_tool');
      assert.equal(e.title, 'Unknown tool');
      assert.match(e.detail, /no_such_tool/);
      assert.equal(e.type, PROBLEM_TYPE);
      assert.equal(e.message, e.detail);
      assert.equal(e.retryAfter, null);
      return true;
    });
  } finally { await s.close(); }
});

test('Retry-After becomes retryAfter in seconds', async () => {
  const s = await startMock(() => problem(429, 'rate_limited', 'Too many requests', 'Slow down.', { 'retry-after': '7' }));
  try {
    await assert.rejects(() => new Loa({ baseUrl: s.url }).call('search_books', { query: 'x' }), (e) => e.status === 429 && e.code === 'rate_limited' && e.retryAfter === 7);
  } finally { await s.close(); }
});

test('an answer that is not JSON is a LoaError with code bad_response and the HTTP status', async () => {
  const s = await startMock(() => ({ status: 502, type: 'text/html', text: '<html>Bad gateway</html>' }));
  const s2 = await startMock(() => ({ status: 200, type: 'text/html', text: 'hello' }));
  const s3 = await startMock(() => ({ status: 200, json: { unexpected: true } }));
  try {
    await assert.rejects(() => new Loa({ baseUrl: s.url }).call('search_books', { query: 'x' }), (e) => e.code === 'bad_response' && e.status === 502);
    await assert.rejects(() => new Loa({ baseUrl: s2.url }).call('search_books', { query: 'x' }), (e) => e.code === 'bad_response' && e.status === 200);
    await assert.rejects(() => new Loa({ baseUrl: s3.url }).call('search_books', { query: 'x' }), (e) => e.code === 'bad_response');
  } finally { await s.close(); await s2.close(); await s3.close(); }
});

test('a server that cannot be reached is a LoaError with code network and status 0', async () => {
  const dead = await deadAddress();
  await assert.rejects(() => new Loa({ baseUrl: dead }).call('search_books', { query: 'x' }), (e) => e instanceof LoaError && e.code === 'network' && e.status === 0);
});

test('timeoutMs ends a slow answer with code timeout', async () => {
  const s = await startMock(async () => { await new Promise((r) => setTimeout(r, 400)); return { json: { ok: true, data: {}, source: 'x' } }; });
  try {
    const started = Date.now();
    await assert.rejects(() => new Loa({ baseUrl: s.url, timeoutMs: 60 }).call('search_books', { query: 'x' }), (e) => e.code === 'timeout' && e.status === 0);
    assert.ok(Date.now() - started < 380);
  } finally { await s.close(); }
});

test('a fetch function can be passed in (browsers, Workers, tests) and gets the full address and the request', async () => {
  const seen = [];
  const fetchStub = async (url, init) => {
    seen.push([String(url), init]);
    return new Response(JSON.stringify({ ok: true, data: { hello: 1 }, source: 'x' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const loa = new Loa({ baseUrl: 'https://api.example.test/', fetch: fetchStub });
  assert.deepEqual(await loa.call('get_publisher_info'), { hello: 1 });
  assert.equal(seen[0][0], 'https://api.example.test/v1/get_publisher_info');
  assert.equal(seen[0][1].method, 'POST');
  assert.equal(seen[0][1].body, '{}');
});

test('userAgent and extra headers are sent when given', async () => {
  const s = await startMock();
  try {
    const loa = new Loa({ baseUrl: s.url, userAgent: 'my-app/2.0', headers: { 'x-extra': 'yes' } });
    await loa.call('get_publisher_info');
    assert.equal(s.requests[0].headers['user-agent'], 'my-app/2.0');
    assert.equal(s.requests[0].headers['x-extra'], 'yes');
  } finally { await s.close(); }
});

test('tools(format) reads /v1/tools?format= (default mcp) and openapi() reads /v1/openapi.json', async () => {
  const s = await startMock();
  try {
    const loa = new Loa({ baseUrl: s.url });
    assert.deepEqual(await loa.tools(), [{ name: 'search_books', format: 'mcp' }]);
    assert.deepEqual(await loa.tools('openai'), [{ name: 'search_books', format: 'openai' }]);
    assert.equal((await loa.openapi()).openapi, '3.1.0');
    assert.deepEqual(s.requests.map((r) => [r.method, r.url]), [['GET', '/v1/tools?format=mcp'], ['GET', '/v1/tools?format=openai'], ['GET', '/v1/openapi.json']]);
  } finally { await s.close(); }
});

test('an unknown tools format is the server\'s problem, as a LoaError', async () => {
  const s = await startMock(() => problem(400, 'unknown_format', 'Unknown format', 'Use one of these formats: mcp, openai.'));
  try {
    await assert.rejects(() => new Loa({ baseUrl: s.url }).tools('banana'), (e) => e.status === 400 && e.code === 'unknown_format');
  } finally { await s.close(); }
});

test('the module is plain ESM with no imports of its own (zero dependencies)', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const text = readFileSync(fileURLToPath(new URL('../sdk/typescript/loa.mjs', import.meta.url)), 'utf8');
  assert.equal(/^\s*import\s/m.test(text), false);
  assert.equal(/require\(/.test(text), false);
  assert.ok(text.length < 12000);
});

test('loa.d.ts declares the classes and one method per tool', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const d = readFileSync(fileURLToPath(new URL('../sdk/typescript/loa.d.ts', import.meta.url)), 'utf8');
  for (const word of ['class Loa', 'class LoaError', 'DEFAULT_BASE_URL', 'API_VERSION', 'call(', 'tools(', 'openapi(']) assert.ok(d.includes(word), word);
  for (const [method] of WRAPPERS) assert.ok(d.includes(method + '('), method);
  for (const name of ['SearchBooksArgs', 'GetBookArgs', 'ListFreeShelfArgs', 'ReadFreeChapterArgs', 'SearchResult', 'PrintBlock']) assert.ok(d.includes(name), name);
});
