// Tests of the command line: cli/loa.mjs (built on sdk/typescript/loa.mjs). Run: node --test tests/cli.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { FIXTURE, deadAddress, problem, startMock } from './mock.mjs';

const CLI = fileURLToPath(new URL('../cli/loa.mjs', import.meta.url));

function run(args, { env = {}, input } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: { PATH: process.env.PATH, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input ?? '');
  });
}
const bodyOf = (rec) => JSON.parse(rec.body || '{}');

test('--help lists every command, the options, the environment variable and the exit codes, and exits 0', async () => {
  for (const flag of ['--help', '-h', 'help']) {
    const r = await run([flag]);
    assert.equal(r.code, 0, flag);
    for (const w of ['search', 'book', 'summary', 'sample', 'free list', 'free read', 'print options', 'publisher', 'tools', 'openapi', '--json', '--lang', '--limit', '--base-url', 'LOA_API_URL', 'Exit codes']) assert.ok(r.stdout.includes(w), `${flag}: ${w}`);
  }
});

test('--version prints the name and the version', async () => {
  const r = await run(['--version']);
  assert.equal(r.code, 0);
  assert.match(r.stdout.trim(), /^loa \d+\.\d+\.\d+$/);
});

test('no arguments: usage on stderr, exit 1, nothing on stdout; an unknown command: the same', async () => {
  const a = await run([]);
  assert.equal(a.code, 1);
  assert.equal(a.stdout, '');
  assert.ok(a.stderr.includes('search') && a.stderr.includes('Usage'));
  const b = await run(['frobnicate']);
  assert.equal(b.code, 1);
  assert.equal(b.stdout, '');
  assert.match(b.stderr, /frobnicate/);
});

test('search: the words become the query, --lang and --limit become language and limit, --json prints the data', async () => {
  const s = await startMock();
  try {
    const r = await run(['search', 'moby', 'dick', '--lang', 'de', '--limit', '3', '--json'], { env: { LOA_API_URL: s.url } });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), FIXTURE.search_books);
    assert.equal(s.requests[0].url, '/v1/search_books');
    assert.deepEqual(bodyOf(s.requests[0]), { query: 'moby dick', language: 'de', limit: 3 });
  } finally { await s.close(); }
});

test('search without --json prints one block per result with id, title, author and address', async () => {
  const s = await startMock();
  try {
    const r = await run(['search', 'moby'], { env: { LOA_API_URL: s.url } });
    assert.equal(r.code, 0, r.stderr);
    const t = FIXTURE.search_books.results[0];
    for (const w of [t.id, t.title, t.author, t.url]) assert.ok(r.stdout.includes(w), w);
    assert.equal(r.stderr, '');
  } finally { await s.close(); }
});

test('book: prints the facts and the print editions with prices; --json prints the data', async () => {
  const s = await startMock();
  try {
    const r = await run(['book', 'top3500-00002', '--lang', 'fr'], { env: { LOA_API_URL: s.url } });
    assert.equal(r.code, 0, r.stderr);
    for (const w of ['Moby-Dick', 'Herman Melville', 'top3500-00002', 'https://libraryofalexandria.com/products/moby-dick-or-the-whale', 'Paperback', '18.95', 'Hardcover', '27.95']) assert.ok(r.stdout.includes(w), w);
    assert.deepEqual(bodyOf(s.requests[0]), { id: 'top3500-00002', language: 'fr' });
    const j = await run(['book', 'top3500-00002', '--json'], { env: { LOA_API_URL: s.url } });
    assert.deepEqual(JSON.parse(j.stdout), FIXTURE.get_book);
  } finally { await s.close(); }
});

test('summary and sample: call their tools and print the message when the text is not there yet', async () => {
  const s = await startMock();
  try {
    const a = await run(['summary', 'top3500-00002'], { env: { LOA_API_URL: s.url } });
    const b = await run(['sample', 'top3500-00002', '--lang', 'es'], { env: { LOA_API_URL: s.url } });
    assert.equal(a.code, 0); assert.equal(b.code, 0);
    assert.ok(a.stdout.includes('not available yet'));
    assert.ok(b.stdout.includes('not available yet'));
    assert.deepEqual(s.requests.map((r) => r.url), ['/v1/get_summary', '/v1/get_sample']);
    assert.deepEqual(bodyOf(s.requests[1]), { id: 'top3500-00002', language: 'es' });
  } finally { await s.close(); }
});

test('free list and free read pass their options as numbers and words', async () => {
  const s = await startMock();
  try {
    const a = await run(['free', 'list', '--lang', 'es', '--subject', 'philosophy', '--limit', '5'], { env: { LOA_API_URL: s.url } });
    assert.equal(a.code, 0, a.stderr);
    assert.ok(a.stdout.includes('Meditaciones') && a.stdout.includes('Marco Aurelio'));
    assert.deepEqual(bodyOf(s.requests[0]), { language: 'es', subject: 'philosophy', limit: 5 });
    const b = await run(['free', 'read', 'top3500-00013', '--chapter', '2', '--page', '3', '--lang', 'en'], { env: { LOA_API_URL: s.url } });
    assert.equal(b.code, 0, b.stderr);
    assert.equal(s.requests[1].url, '/v1/read_free_chapter');
    assert.deepEqual(bodyOf(s.requests[1]), { id: 'top3500-00013', chapter: 2, page: 3, language: 'en' });
  } finally { await s.close(); }
});

test('print options and publisher', async () => {
  const s = await startMock();
  try {
    const a = await run(['print', 'options', 'top3500-00002'], { env: { LOA_API_URL: s.url } });
    assert.equal(a.code, 0, a.stderr);
    assert.ok(a.stdout.includes('Paperback') && a.stdout.includes('18.95') && a.stdout.includes('USD'));
    const b = await run(['publisher'], { env: { LOA_API_URL: s.url } });
    assert.equal(b.code, 0, b.stderr);
    assert.ok(b.stdout.includes('Library of Alexandria Press') && b.stdout.includes('https://libraryofalexandria.com'));
    assert.deepEqual(s.requests.map((r) => r.url), ['/v1/get_print_options', '/v1/get_publisher_info']);
  } finally { await s.close(); }
});

test('tools --format and openapi print the documents as JSON', async () => {
  const s = await startMock();
  try {
    const a = await run(['tools', '--format', 'openai'], { env: { LOA_API_URL: s.url } });
    assert.equal(a.code, 0, a.stderr);
    assert.deepEqual(JSON.parse(a.stdout), [{ name: 'search_books', format: 'openai' }]);
    const b = await run(['openapi'], { env: { LOA_API_URL: s.url } });
    assert.equal(JSON.parse(b.stdout).openapi, '3.1.0');
    const c = await run(['tools'], { env: { LOA_API_URL: s.url } });
    assert.equal(JSON.parse(c.stdout)[0].format, 'mcp');
  } finally { await s.close(); }
});

test('an answer that is a problem: exit 2, the detail on stderr, nothing on stdout', async () => {
  const s = await startMock(() => problem(404, 'not_found', 'Not found', "No title found for id 'top3500-99999'. Use search_books to find the id."));
  try {
    const r = await run(['book', 'top3500-99999'], { env: { LOA_API_URL: s.url } });
    assert.equal(r.code, 2);
    assert.equal(r.stdout, '');
    assert.ok(r.stderr.includes('No title found') && r.stderr.startsWith('loa:'));
  } finally { await s.close(); }
});

test('a server that cannot be reached, or that fails with 5xx: exit 3', async () => {
  const dead = await deadAddress();
  const a = await run(['publisher'], { env: { LOA_API_URL: dead } });
  assert.equal(a.code, 3);
  assert.match(a.stderr, /^loa:/);
  assert.equal(a.stdout, '');
  const s = await startMock(() => problem(500, 'internal', 'Internal error', 'The library could not answer just now. Try again in a moment.'));
  try {
    const b = await run(['publisher'], { env: { LOA_API_URL: s.url } });
    assert.equal(b.code, 3);
    assert.ok(b.stderr.includes('could not answer'));
  } finally { await s.close(); }
});

test('missing or wrong arguments: exit 1 with a sentence that names what is missing', async () => {
  const s = await startMock();
  try {
    const a = await run(['book'], { env: { LOA_API_URL: s.url } });
    assert.equal(a.code, 1);
    assert.match(a.stderr, /\bid\b/i);
    const b = await run(['search'], { env: { LOA_API_URL: s.url } });
    assert.equal(b.code, 1);
    assert.match(b.stderr, /words|query/i);
    const c = await run(['search', 'x', '--limit', 'abc'], { env: { LOA_API_URL: s.url } });
    assert.equal(c.code, 1);
    assert.match(c.stderr, /--limit/);
    const d = await run(['search', 'x', '--lang'], { env: { LOA_API_URL: s.url } });
    assert.equal(d.code, 1);
    assert.equal(s.requests.length, 0);
  } finally { await s.close(); }
});

test('--base-url wins over LOA_API_URL; the default is the live reading service (shown by --help)', async () => {
  const s = await startMock();
  const t = await startMock();
  try {
    const r = await run(['publisher', '--base-url', s.url], { env: { LOA_API_URL: t.url } });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(s.requests.length, 1);
    assert.equal(t.requests.length, 0);
    const h = await run(['--help']);
    assert.ok(h.stdout.includes('api.libraryofalexandria.com'));
  } finally { await s.close(); await t.close(); }
});

test('the options may stand before or after the words, and -- ends the options', async () => {
  const s = await startMock();
  try {
    const r = await run(['--lang', 'it', 'search', 'divina', 'commedia', '--json'], { env: { LOA_API_URL: s.url } });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(bodyOf(s.requests[0]), { query: 'divina commedia', language: 'it' });
    const q = await run(['search', '--json', '--', '--limit', 'x'], { env: { LOA_API_URL: s.url } });
    assert.equal(q.code, 0, q.stderr);
    assert.deepEqual(bodyOf(s.requests[1]), { query: '--limit x' });
  } finally { await s.close(); }
});

test('the file starts with a node shebang and uses only the client of this kit', async () => {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(CLI, 'utf8');
  assert.ok(text.startsWith('#!/usr/bin/env node'));
  const imports = [...text.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  for (const i of imports) assert.ok(i.startsWith('node:') || i === '../sdk/typescript/loa.mjs', i);
  assert.ok(imports.includes('../sdk/typescript/loa.mjs'));
});
