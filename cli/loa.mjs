#!/usr/bin/env node
import process from 'node:process';
import { Loa, LoaError, DEFAULT_BASE_URL } from '../sdk/typescript/loa.mjs';

const usage = `Usage: loa [options] <command>

Commands:
  search <words...>     Search the catalogue
  book <id>             Show book facts
  summary <id>          Read a summary
  sample <id>           Read sample pages
  free list             List the shelf
  free read <id>        Read a chapter
  print options <id>    Show editions
  publisher             Show publisher information
  tools                 Read the tool document
  openapi               Read the API document
  help                  Show this help

Options:
  --lang <code>         Set the language
  --limit <n>           Set the result limit
  --subject <word>      Select a subject
  --chapter <n>         Select a chapter
  --page <n>            Select a page
  --part <n>            Select a key idea of a summary
  --format <name>       Set the tools format (default: mcp)
  --base-url <url>      Set the library address
  --json                Print JSON
  --help, -h            Show this help
  --version             Show the version
  --                    End options

Environment:
  LOA_API_URL           Set the library address
  Default: ${DEFAULT_BASE_URL}

Exit codes:
  0 done
  1 wrong use
  2 the library refused the request
  3 the library could not be reached or failed
`;

class UsageError extends Error {}
const fail = (message) => { throw new UsageError(message); };
const valueOptions = new Set(['lang', 'limit', 'subject', 'chapter', 'page', 'part', 'format', 'base-url']);
const numberOptions = new Set(['limit', 'chapter', 'page', 'part']);

function parse(tokens) {
  const options = {};
  const words = [];
  let ended = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (ended) { words.push(token); continue; }
    if (token === '--') { ended = true; continue; }
    if (token === '-h') { options.help = true; continue; }
    if (!token.startsWith('-')) { words.push(token); continue; }
    const name = token.slice(2);
    if (token.startsWith('--') && ['help', 'version', 'json'].includes(name)) {
      options[name] = true;
      continue;
    }
    if (!token.startsWith('--') || !valueOptions.has(name)) fail(`Unknown option ${token}.`);
    const value = tokens[++i];
    if (value === undefined || value.startsWith('--')) fail(`${token} needs a value.`);
    if (numberOptions.has(name)) {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
        fail(`${token} must be a whole number above 0.`);
      }
      options[name] = Number(value);
    } else {
      options[name] = value;
    }
  }
  return { options, words };
}

const list = (value) => Array.isArray(value) ? value : [];
const text = (value) => value == null ? '' : String(value);
const heading = (d) => [d.title, d.author ? `by ${d.author}` : ''].filter(Boolean).join(' ');
function resultBlock(d = {}) {
  return [
    [d.id, [heading(d), d.language ? `[${d.language}]` : ''].filter(Boolean).join(' ')].filter(Boolean).join('  '),
    d.url ? `  ${d.url}` : '',
  ].filter(Boolean);
}
function editionBlock(d = {}, currency = 'USD') {
  const formats = list(d.formats).map((f) =>
    [f?.format, f?.price_usd != null ? `${currency} ${f.price_usd}` : ''].filter(Boolean).join(' ')
  ).filter(Boolean);
  const content = formats.length ? formats.join(', ') : text(d.status);
  return [d.label || d.edition, content].filter(Boolean).join(': ');
}
function render(command, data) {
  const d = data ?? {};
  const lines = [];
  const add = (v) => { if (v !== undefined && v !== null && v !== '') lines.push(String(v)); };
  if (command === 'search') {
    if (!list(d.results).length) {
      add('No titles matched.');
      add(d.message);
    } else {
      add(`${d.count ?? d.results.length} result(s) for "${text(d.query)}"`);
      for (const r of list(d.results)) lines.push(...resultBlock(r));
    }
  } else if (command === 'book') {
    add(d.title);
    add(d.subtitle);
    if (d.author) add(`by ${d.author}`);
    if (d.id) add(`Id: ${d.id}`);
    if (d.url) add(`Page: ${d.url}`);
    for (const p of list(d.print)) add(editionBlock(p));
    const codes = list(d.languages).map((l) => l?.language).filter(Boolean);
    if (codes.length) add(`Languages: ${codes.join(', ')}`);
  } else if (command === 'free list') {
    if (d.available === false) add(d.message);
    else {
      add(`${d.count ?? list(d.titles).length} title(s)`);
      for (const r of list(d.titles)) lines.push(...resultBlock(r));
    }
  } else if (command === 'print options') {
    add(heading(d));
    if (d.status) add(`Status: ${d.status}`);
    for (const p of list(d.editions)) add(editionBlock(p, d.currency || 'USD'));
    add(d.note);
  } else if (command === 'publisher') {
    add(d.name);
    add(d.description);
    if (d.website) add(`Website: ${d.website}`);
    if (d.terms_url) add(`Terms: ${d.terms_url}`);
    if (d.privacy_url) add(`Privacy: ${d.privacy_url}`);
    if (Array.isArray(d.languages)) {
      add(`Languages: ${d.languages.length} (${d.languages.map((l) => l?.name).filter(Boolean).join(', ')})`);
    }
  } else {
    add(heading(d));
    add(d.available === false ? d.message : d.text);
    add(d.url);
  }
  return lines.join('\n');
}

async function main() {
  const tokens = process.argv.slice(2);
  if (!tokens.length) {
    process.stderr.write(usage);
    process.exitCode = 1;
    return;
  }
  const { options: o, words } = parse(tokens);
  if (o.help || words[0] === 'help') { process.stdout.write(usage); return; }
  if (o.version) { console.log('loa 0.1.0'); return; }
  let command = words.shift();
  if (command === 'free' || command === 'print') command += ` ${words.shift() || ''}`;
  const methods = {
    search: 'searchBooks', book: 'getBook', summary: 'getSummary',
    sample: 'getSample', 'free list': 'listFreeShelf',
    'free read': 'readFreeChapter', 'print options': 'getPrintOptions',
    publisher: 'getPublisherInfo', tools: 'tools', openapi: 'openapi',
  };
  if (!Object.hasOwn(methods, command)) fail(`Unknown command ${command || '(missing)'}.`);
  const args = {};
  if (command === 'search') {
    if (!words.length) fail('Search needs words for the query.');
    args.query = words.join(' ');
  } else if (['book', 'summary', 'sample', 'free read', 'print options'].includes(command)) {
    if (!words.length) fail(`${command} needs an id.`);
    args.id = words.shift();
    if (words.length) fail(`Unexpected words for ${command}.`);
  } else if (words.length) {
    fail(`Unexpected words for ${command}.`);
  }
  const allowed = {
    search: ['language', 'limit'],
    book: ['language'], summary: ['language', 'part'], sample: ['language', 'page'],
    'free list': ['language', 'subject', 'limit'],
    'free read': ['chapter', 'page', 'language'],
    'print options': ['language'],
  };
  for (const key of allowed[command] || []) {
    const option = key === 'language' ? 'lang' : key;
    if (o[option] !== undefined) args[key] = o[option];
  }
  const client = new Loa({ baseUrl: o['base-url'] });
  let data;
  if (command === 'tools') data = await client.tools(o.format);
  else if (command === 'openapi') data = await client.openapi();
  else if (command === 'publisher') data = await client.getPublisherInfo();
  else data = await client[methods[command]](args);
  console.log(o.json || command === 'tools' || command === 'openapi'
    ? JSON.stringify(data, null, 2) : render(command, data));
}

try {
  await main();
} catch (error) {
  const message = text(error.message).replace(/[\r\n]+/g, ' ');
  process.stderr.write(`loa: ${message}\n`);
  if (error instanceof UsageError) {
    process.stderr.write('Run loa --help.\n');
    process.exitCode = 1;
  } else {
    process.exitCode = error instanceof LoaError && error.code !== 'bad_response'
      && error.status >= 400 && error.status <= 499 ? 2 : 3;
  }
}
