// A small client for the library REST API.
// const { Loa } = await import('./loa.mjs');
// const library = new Loa();
// const books = await library.searchBooks({ query: 'Moby Dick' });

export const DEFAULT_BASE_URL = 'https://api.libraryofalexandria.com';
export const API_VERSION = '2026-10-25';

export class LoaError extends Error {
  constructor(message, props = {}) {
    super(props.detail || props.title || message);
    this.name = 'LoaError';
    this.status = props.status ?? 0;
    this.code = props.code || 'error';
    this.title = props.title || '';
    this.detail = props.detail || '';
    this.type = props.type || '';
    this.retryAfter = props.retryAfter ?? null;
  }
}

export class Loa {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl ?? globalThis.process?.env?.LOA_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 20000;
    this.headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'LOA-Version': API_VERSION,
    });
    if (options.userAgent) this.headers.set('User-Agent', options.userAgent);
    new Headers(options.headers).forEach((value, key) => this.headers.set(key, value));
  }

  async request(path, method, body, shape) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      let response;
      try {
        response = await this.fetch(`${this.baseUrl}/v1/${path}`, {
          method, headers: this.headers, body, signal: controller.signal,
        });
      } catch {
        throw new LoaError(timedOut ? `The request to ${this.baseUrl} timed out.` : `Could not reach ${this.baseUrl}.`, {
          code: timedOut ? 'timeout' : 'network',
        });
      }
      const rawRetry = response.headers.get('Retry-After');
      const retryAfter = rawRetry !== null && rawRetry.trim() !== '' && Number.isFinite(Number(rawRetry))
        ? Number(rawRetry) : null;
      const bad = () => new LoaError('The library returned an invalid answer.', {
        code: 'bad_response', status: response.status, retryAfter,
      });
      let json;
      try {
        json = await response.json();
      } catch {
        if (timedOut) throw new LoaError('The request timed out.', { code: 'timeout' });
        throw bad();
      }
      if (json && typeof json.status === 'number' && typeof json.title === 'string') {
        throw new LoaError('The request failed.', { ...json, retryAfter });
      }
      if (response.ok) {
        if (shape === 'data' && json?.ok === true && Object.hasOwn(json, 'data')) return json.data;
        if (shape === 'array' && Array.isArray(json)) return json;
        if (shape === 'object' && json && typeof json === 'object' && !Array.isArray(json)) return json;
      }
      throw bad();
    } finally {
      clearTimeout(timer);
    }
  }

  async call(tool, args = {}) {
    if (typeof tool !== 'string' || !/^[a-z0-9_]{1,64}$/.test(tool)) {
      throw new TypeError('The tool name must use lowercase letters, digits or underscores.');
    }
    return this.request(tool, 'POST', JSON.stringify(args), 'data');
  }

  async tools(format = 'mcp') {
    return this.request(`tools?format=${encodeURIComponent(format)}`, 'GET', undefined, 'array');
  }

  async openapi() {
    return this.request('openapi.json', 'GET', undefined, 'object');
  }

  async searchBooks(args) { return this.call('search_books', args); }
  async getBook(args) { return this.call('get_book', args); }
  async getSummary(args) { return this.call('get_summary', args); }
  async getSample(args) { return this.call('get_sample', args); }
  async listFreeShelf(args = {}) { return this.call('list_free_shelf', args); }
  async readFreeChapter(args) { return this.call('read_free_chapter', args); }
  async getPrintOptions(args) { return this.call('get_print_options', args); }
  async getPublisherInfo() { return this.call('get_publisher_info'); }
}
