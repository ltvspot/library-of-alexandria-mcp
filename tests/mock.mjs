// Test helper of the developer kit: a small local HTTP server that answers like the library's API (POST /v1/<tool>, GET /v1/tools, GET /v1/openapi.json, POST /mcp), and records every request.
import http from 'node:http';

export const FIXTURE = {
  search_books: {
    query: 'moby dick',
    language: 'en',
    count: 1,
    results: [
      {
        id: 'top3500-00002', line: 'top3500', number: 2, title: 'Moby-Dick', subtitle: 'The Great White Whale', author: 'Herman Melville', language: 'en',
        languages: ['en', 'es', 'de'], print_editions: 'available', free_shelf: false, url: 'https://libraryofalexandria.com/products/moby-dick-or-the-whale',
        cover_url: 'https://example.test/cover.jpg',
      },
    ],
  },
  get_book: {
    id: 'top3500-00002', line: 'top3500', number: 2, language: 'en', title: 'Moby-Dick', subtitle: 'The Great White Whale', author: 'Herman Melville', original_title: 'Moby-Dick',
    publisher: 'Library of Alexandria Press', url: 'https://libraryofalexandria.com/products/moby-dick-or-the-whale', print_editions: 'available',
    print: [
      { edition: 'standard', label: 'Standard print', product_title: 'Moby-Dick', status: 'available', url: 'https://libraryofalexandria.com/products/moby-dick-or-the-whale', formats: [{ format: 'Paperback', price_usd: '18.95' }, { format: 'Hardcover', price_usd: '27.95' }] },
      { edition: 'large_print', label: 'Large print', product_title: 'Moby-Dick (Large Print)', status: 'not available yet', url: 'https://libraryofalexandria.com/products/moby-dick-large-print' },
    ],
    free_shelf: false,
    languages: [{ language: 'en', name: 'English', title: 'Moby-Dick', url: 'https://libraryofalexandria.com/products/moby-dick-or-the-whale' }, { language: 'es', name: 'Spanish', title: 'Moby Dick', url: 'https://libraryofalexandria.com/es/products/moby-dick-es' }],
    not_available_yet: ['summary', 'sample pages'],
  },
  get_summary: { id: 'top3500-00002', language: 'en', title: 'Moby-Dick', author: 'Herman Melville', available: false, message: 'The summary of this title is not available yet.', url: 'https://libraryofalexandria.com/products/moby-dick-or-the-whale' },
  get_sample: { id: 'top3500-00002', language: 'en', title: 'Moby-Dick', author: 'Herman Melville', available: false, message: 'The sample pages of this title are not available yet.', url: 'https://libraryofalexandria.com/products/moby-dick-or-the-whale' },
  list_free_shelf: {
    language: 'es', subject: 'philosophy', available: true, count: 1, total: 200,
    titles: [{ id: 'top3500-00013', title: 'Meditaciones', author: 'Marco Aurelio', language: 'es', url: 'https://libraryofalexandria.com/es/products/meditaciones' }],
  },
  read_free_chapter: { id: 'top3500-00013', language: 'en', title: 'Meditations', author: 'Marcus Aurelius', available: false, message: 'Free-shelf chapters are not available yet.', url: 'https://libraryofalexandria.com/products/meditations' },
  get_print_options: {
    id: 'top3500-00002', language: 'en', title: 'Moby-Dick', author: 'Herman Melville', status: 'available', currency: 'USD', note: 'ISBN-13 and page counts are not available yet.',
    editions: [{ edition: 'standard', label: 'Standard print', status: 'available', url: 'https://libraryofalexandria.com/products/moby-dick-or-the-whale', formats: [{ format: 'Paperback', price_usd: '18.95' }] }],
  },
  get_publisher_info: {
    name: 'Library of Alexandria Press', description: "Library of Alexandria Press is a publisher of the world's classic books in today's language, in 25 languages.",
    languages: [{ code: 'en', name: 'English', native_name: 'English', dir: 'ltr' }], website: 'https://libraryofalexandria.com',
    terms_url: 'https://libraryofalexandria.com/policies/terms-of-service', privacy_url: 'https://libraryofalexandria.com/policies/privacy-policy',
  },
};

export const TOOL_NAMES = Object.keys(FIXTURE);
export const PROBLEM_TYPE = 'https://libraryofalexandria.com/pages/developers#errors';
export const problem = (status, code, title, detail, headers = {}) => ({ status, type: 'application/problem+json; charset=utf-8', headers, json: { type: PROBLEM_TYPE, title, status, detail, code } });

/** The library's own answers: the fixture for a known tool, problem+json for an unknown one. */
export function fakeLibrary(rec) {
  const url = new URL(rec.url, 'http://x');
  const m = url.pathname.match(/^\/v1\/([a-z0-9_]+)$/);
  if (rec.method === 'POST' && m && FIXTURE[m[1]]) return { json: { ok: true, data: FIXTURE[m[1]], source: 'Library of Alexandria, libraryofalexandria.com' } };
  if (rec.method === 'POST' && m) return problem(404, 'unknown_tool', 'Unknown tool', `Unknown tool '${m[1]}'. Read /v1/openapi.json.`);
  if (rec.method === 'GET' && url.pathname === '/v1/tools') return { json: [{ name: 'search_books', format: url.searchParams.get('format') || 'mcp' }] };
  if (rec.method === 'GET' && url.pathname === '/v1/openapi.json') return { json: { openapi: '3.1.0', info: { title: 'Library of Alexandria API' }, paths: {} } };
  if (rec.method === 'POST' && url.pathname === '/mcp') return mcpAnswer(rec);
  return { status: 404, json: { error: 'Not found' } };
}

/** A tiny MCP server: initialize, ping, tools/list, tools/call (the fixture as structuredContent), notifications get 202. */
export function mcpAnswer(rec) {
  let msg;
  try { msg = JSON.parse(rec.body); } catch { return { status: 400, json: { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } } }; }
  const one = (m) => {
    if (!('id' in m)) return null;
    if (m.method === 'initialize') return { jsonrpc: '2.0', id: m.id, result: { protocolVersion: m.params?.protocolVersion || '2025-11-25', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'mock', version: '1' } } };
    if (m.method === 'ping') return { jsonrpc: '2.0', id: m.id, result: {} };
    if (m.method === 'tools/list') return { jsonrpc: '2.0', id: m.id, result: { tools: TOOL_NAMES.map((name) => ({ name, title: name, description: name, inputSchema: { type: 'object' } })) } };
    if (m.method === 'tools/call') {
      const data = FIXTURE[m.params?.name];
      return data ? { jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false } } : { jsonrpc: '2.0', id: m.id, error: { code: -32602, message: 'Unknown tool' } };
    }
    return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Method not found' } };
  };
  if (Array.isArray(msg)) {
    const outs = msg.map(one).filter(Boolean);
    return outs.length ? { json: outs } : { status: 202, text: '' };
  }
  const out = one(msg);
  return out ? { json: out } : { status: 202, text: '' };
}

export async function startMock(handler = fakeLibrary) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const rec = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
    requests.push(rec);
    let out;
    try { out = (await handler(rec)) ?? { status: 404, json: {} }; } catch (e) { out = { status: 500, type: 'text/plain', text: String(e) }; }
    res.writeHead(out.status ?? 200, { 'content-type': out.type ?? 'application/json; charset=utf-8', ...(out.headers ?? {}) });
    res.end(out.text !== undefined ? out.text : JSON.stringify(out.json));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }) };
}

/** An address on which nothing listens (for network errors). */
export async function deadAddress() {
  const s = await startMock();
  const url = s.url;
  await s.close();
  return url;
}
