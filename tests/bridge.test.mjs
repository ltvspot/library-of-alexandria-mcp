// Tests of the stdio bridge: mcp-bridge/loa-mcp.mjs. A client that only speaks stdio (Claude Desktop, an editor) starts it; it forwards every JSON-RPC line to the library's remote MCP endpoint.
// Run: node --test tests/bridge.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { FIXTURE, TOOL_NAMES, deadAddress, mcpAnswer, startMock } from './mock.mjs';

const BRIDGE = fileURLToPath(new URL('../mcp-bridge/loa-mcp.mjs', import.meta.url));

/** Start the bridge, write the lines, close stdin, wait for it to end; returns stdout lines, stderr and the exit code. */
function run(lines, { args = [], env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BRIDGE, ...args], { env: { PATH: process.env.PATH, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, lines: stdout.split('\n').filter((l) => l !== ''), raw: stdout, stderr }));
    for (const l of lines) child.stdin.write((typeof l === 'string' ? l : JSON.stringify(l)) + '\n');
    child.stdin.end();
  });
}
const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });

test('initialize, tools/list and tools/call are forwarded to /mcp and each answer is exactly one line on stdout', async () => {
  const s = await startMock();
  try {
    const r = await run(
      [rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } }), rpc(2, 'tools/list'), rpc('abc', 'tools/call', { name: 'get_publisher_info', arguments: {} })],
      { args: ['--url', s.url + '/mcp'] },
    );
    assert.equal(r.code, 0, r.stderr);
    const out = r.lines.map((l) => JSON.parse(l));
    assert.equal(out.length, 3);
    const byId = Object.fromEntries(out.map((o) => [o.id, o]));
    assert.equal(byId[1].result.protocolVersion, '2025-06-18');
    assert.deepEqual(byId[2].result.tools.map((t) => t.name), TOOL_NAMES);
    assert.deepEqual(byId.abc.result.structuredContent, FIXTURE.get_publisher_info);
    assert.ok(out.every((o) => o.jsonrpc === '2.0'));
    assert.equal(s.requests.length, 3);
    for (const q of s.requests) {
      assert.equal(q.method, 'POST');
      assert.equal(q.url, '/mcp');
      assert.match(q.headers['content-type'], /^application\/json/);
      assert.match(q.headers.accept, /application\/json/);
      assert.match(q.headers['user-agent'], /loa-mcp/);
    }
    assert.deepEqual(JSON.parse(s.requests[1].body), rpc(2, 'tools/list'));
  } finally { await s.close(); }
});

test('a notification (no id) is forwarded and produces no output; the 202 answer is silent', async () => {
  const s = await startMock();
  try {
    const r = await run([{ jsonrpc: '2.0', method: 'notifications/initialized' }, rpc(7, 'ping')], { args: ['--url', s.url + '/mcp'] });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.lines.length, 1);
    assert.equal(JSON.parse(r.lines[0]).id, 7);
    assert.equal(s.requests.length, 2);
    assert.equal(JSON.parse(s.requests[0].body).method, 'notifications/initialized');
  } finally { await s.close(); }
});

test('the id comes back unchanged, as a number or a string, in the order the answers arrive', async () => {
  const s = await startMock();
  try {
    const r = await run([rpc(41, 'ping'), rpc('x-9', 'ping'), rpc(0, 'ping')], { args: ['--url', s.url + '/mcp'] });
    const ids = r.lines.map((l) => JSON.parse(l).id).sort((a, b) => String(a).localeCompare(String(b)));
    assert.deepEqual(ids, [0, 41, 'x-9']);
  } finally { await s.close(); }
});

test('a server error becomes a JSON-RPC error with the same id; the bridge keeps running', async () => {
  const s = await startMock((rec) => (JSON.parse(rec.body).id === 1 ? { status: 500, type: 'text/plain', text: 'boom' } : mcpAnswer(rec)));
  try {
    const r = await run([rpc(1, 'ping'), rpc(2, 'ping')], { args: ['--url', s.url + '/mcp'] });
    const out = Object.fromEntries(r.lines.map((l) => JSON.parse(l)).map((o) => [o.id, o]));
    assert.equal(out[1].error.code, -32000);
    assert.match(out[1].error.message, /500/);
    assert.deepEqual(out[2].result, {});
    assert.equal(r.code, 0);
  } finally { await s.close(); }
});

test('an address that cannot be reached becomes a JSON-RPC error with the id', async () => {
  const dead = await deadAddress();
  const r = await run([rpc(5, 'tools/list')], { args: ['--url', dead + '/mcp'] });
  assert.equal(r.code, 0);
  const o = JSON.parse(r.lines[0]);
  assert.equal(o.id, 5);
  assert.equal(o.error.code, -32000);
  assert.match(o.error.message, /reach|connect|network/i);
});

test('a line that is not JSON is answered with a parse error (id null) and nothing is forwarded', async () => {
  const s = await startMock();
  try {
    const r = await run(['this is not json', '{"broken":', rpc(3, 'ping')], { args: ['--url', s.url + '/mcp'] });
    const out = r.lines.map((l) => JSON.parse(l));
    assert.equal(out.filter((o) => o.error?.code === -32700 && o.id === null).length, 2);
    assert.ok(out.some((o) => o.id === 3 && o.result));
    assert.equal(s.requests.length, 1);
  } finally { await s.close(); }
});

test('a batch (JSON array) is forwarded as one request and answered as one array line; blank lines are ignored', async () => {
  const s = await startMock();
  try {
    const r = await run(['', [rpc(1, 'ping'), rpc(2, 'tools/list')], '   '], { args: ['--url', s.url + '/mcp'] });
    assert.equal(r.lines.length, 1);
    const arr = JSON.parse(r.lines[0]);
    assert.ok(Array.isArray(arr) && arr.length === 2);
    assert.equal(s.requests.length, 1);
    assert.ok(Array.isArray(JSON.parse(s.requests[0].body)));
  } finally { await s.close(); }
});

test('the address comes from --url, else LOA_MCP_URL, else the live reading service (named in --help)', async () => {
  const s = await startMock();
  const t = await startMock();
  try {
    const a = await run([rpc(1, 'ping')], { env: { LOA_MCP_URL: s.url + '/mcp' } });
    assert.equal(a.code, 0, a.stderr);
    assert.equal(s.requests.length, 1);
    const b = await run([rpc(1, 'ping')], { args: ['--url', t.url + '/mcp'], env: { LOA_MCP_URL: s.url + '/mcp' } });
    assert.equal(b.code, 0, b.stderr);
    assert.equal(t.requests.length, 1);
    assert.equal(s.requests.length, 1);
    const h = await run([], { args: ['--help'] });
    assert.equal(h.code, 0);
    assert.ok(h.raw.includes('mcp.libraryofalexandria.com/mcp') && h.raw.includes('LOA_MCP_URL') && h.raw.includes('--url'));
  } finally { await s.close(); await t.close(); }
});

test('stdout carries only JSON-RPC lines: nothing else is ever printed there (logs go to stderr)', async () => {
  const s = await startMock();
  try {
    const r = await run([rpc(1, 'tools/list'), 'garbage', { jsonrpc: '2.0', method: 'notifications/initialized' }], { args: ['--url', s.url + '/mcp'] });
    for (const l of r.lines) assert.doesNotThrow(() => JSON.parse(l), l);
    assert.ok(r.raw.endsWith('\n'));
  } finally { await s.close(); }
});

test('the bridge ends by itself when stdin ends, after the last answer was written', async () => {
  const s = await startMock(async (rec) => { await new Promise((r) => setTimeout(r, 150)); return mcpAnswer(rec); });
  try {
    const r = await run([rpc(1, 'ping')], { args: ['--url', s.url + '/mcp'] });
    assert.equal(r.code, 0);
    assert.equal(r.lines.length, 1);
  } finally { await s.close(); }
});

test('the file starts with a node shebang, has no imports besides node: modules and stays small', async () => {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(BRIDGE, 'utf8');
  assert.ok(text.startsWith('#!/usr/bin/env node'));
  const imports = [...text.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  for (const i of imports) assert.ok(i.startsWith('node:'), i);
  assert.ok(text.length < 9000);
});
