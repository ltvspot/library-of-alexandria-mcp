#!/usr/bin/env node
// Stateless MCP stdio-to-HTTP bridge. Client configuration: command: node
// args: [path/to/loa-mcp.mjs]
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';

const defaultUrl = 'https://mcp.libraryofalexandria.com/mcp';
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`MCP stdio-to-HTTP bridge
Usage: node loa-mcp.mjs [--url <address>]
Address: --url, else LOA_MCP_URL, else ${defaultUrl}
Client configuration: {"command":"node","args":["path/to/loa-mcp.mjs"]}`);
  process.exit(0);
}
const urlIndex = args.indexOf('--url');
const url = urlIndex >= 0 ? args[urlIndex + 1] : process.env.LOA_MCP_URL || defaultUrl;
const write = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const hasId = (value) => value !== null && typeof value === 'object'
  && Object.hasOwn(value, 'id');
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const isObject = (value) => value !== null && typeof value === 'object';
const isRpcError = (value) => isObject(value) && value.jsonrpc === '2.0'
  && isObject(value.error) && !Array.isArray(value.error);

function fail(request, message) {
  const requests = Array.isArray(request) ? request : [request];
  const errors = requests.filter(hasId).map((item) => rpcError(item.id, -32000, message));
  if (errors.length) write(Array.isArray(request) ? errors : errors[0]);
  if (requests.some((item) => !hasId(item)) || !errors.length) {
    process.stderr.write(message + '\n');
  }
}

async function forward(request, body) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'User-Agent': 'loa-mcp-bridge/0.1.0',
      },
      body,
    });
  } catch (error) {
    fail(request, `Could not reach ${url}: ${error.message}`);
    return;
  }

  try {
    if (response.status === 202) {
      await response.body?.cancel();
      return;
    }
    const statusError = `HTTP status ${response.status}`;
    if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
      if (!response.body) return;
      const lines = createInterface({ input: Readable.fromWeb(response.body), crlfDelay: Infinity });
      for await (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        const value = JSON.parse(data);
        if (!isObject(value)) throw new Error('Expected a JSON object or array');
        write(value);
      }
      return;
    }

    const text = await response.text();
    if (!text.trim()) return;
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(response.ok ? 'Response body is not JSON' : statusError);
    }
    const errorBody = Array.isArray(value)
      ? value.length > 0 && value.every(isRpcError)
      : isRpcError(value);
    if (!response.ok && !errorBody) throw new Error(statusError);
    if (!isObject(value)) throw new Error('Response body is not a JSON object or array');
    write(value);
  } catch (error) {
    fail(request, response.ok ? error.message : `HTTP status ${response.status}: ${error.message}`);
  }
}

const pending = new Set();
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    write(rpcError(null, -32700, `Parse error: ${error.message}`));
    return;
  }
  const work = forward(request, line);
  pending.add(work);
  work.finally(() => pending.delete(work));
});
await new Promise((resolve) => input.once('close', resolve));
await Promise.all(pending);
