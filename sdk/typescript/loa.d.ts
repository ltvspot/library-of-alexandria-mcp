export const DEFAULT_BASE_URL: 'https://api.libraryofalexandria.com';
export const API_VERSION: '2026-10-25';

export interface LoaOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  userAgent?: string;
  headers?: HeadersInit;
}

export interface LoaErrorProps {
  status?: number;
  code?: string;
  title?: string;
  detail?: string;
  type?: string;
  retryAfter?: number | null;
}

export class LoaError extends Error {
  constructor(message: string, props?: LoaErrorProps);
  name: string;
  status: number;
  code: string;
  title: string;
  detail: string;
  type: string;
  retryAfter: number | null;
}

export interface SearchBooksArgs {
  query: string;
  language?: string;
  limit?: number;
}
export interface GetBookArgs { id: string; language?: string; }
export interface GetSummaryArgs { id: string; language?: string; part?: number; }
export interface GetSampleArgs { id: string; language?: string; page?: number; }
export interface ListFreeShelfArgs {
  language?: string;
  subject?: string;
  limit?: number;
}
export interface ReadFreeChapterArgs {
  id: string;
  chapter?: number;
  page?: number;
  language?: string;
}
export interface GetPrintOptionsArgs { id: string; language?: string; }

export interface SearchResult {
  id: string;
  line?: 'top3500' | 'forbidden';
  number?: number;
  title: string;
  subtitle?: string;
  author?: string;
  author_url?: string;
  original_title?: string;
  language: string;
  languages?: string[];
  print_editions?: string;
  free_shelf?: boolean;
  url: string;
  cover_url?: string;
}
export interface PrintBlock {
  edition: 'standard' | 'large_print';
  label?: string;
  product_title?: string;
  status: string;
  url: string;
  formats?: { format?: string; price_usd?: string }[];
}
export interface SearchBooksResult {
  query: string;
  language: string;
  count: number;
  results: SearchResult[];
  message?: string;
}
export interface BookResult {
  id: string;
  line?: 'top3500' | 'forbidden';
  number?: number;
  language: string;
  title: string;
  subtitle?: string;
  author?: string;
  author_url?: string;
  original_title?: string;
  publisher: string;
  url: string;
  catalogue_page_url?: string;
  cover_url?: string;
  cover_language?: string;
  print_editions: string;
  print: PrintBlock[];
  free_shelf: boolean;
  languages: { language?: string; name?: string; title?: string; url?: string }[];
  not_available_yet: string[];
}
/** The answer of get_summary, get_sample and read_free_chapter: `available` true carries `text`; false carries `status` (opens_soon, opens_in_library, out_of_range, not_on_free_shelf, not_in_free_part, no_free_part, daily_limit, hourly_limit) and a `message`. */
export interface TextToolResult {
  id: string;
  language: string;
  title: string;
  author?: string;
  available: boolean;
  status?: string;
  message?: string;
  url: string;
  book_url?: string;
  text?: string;
  words?: number;
  truncated?: boolean;
  paragraph_ids?: string[];
  heading?: string;
  part?: number;
  parts_total?: number;
  short_answer?: string;
  contents?: { part: number; heading?: string }[];
  languages_available?: string[];
  chapter?: number;
  chapter_title?: string;
  chapters_total?: number;
  page?: number;
  pages_in_free_part?: number;
  pages_in_chapter?: number;
  next_page?: number;
  next?: { chapter: number; page: number };
  summary_available?: boolean;
  sample_available?: boolean;
  retry_after_s?: number;
  budget?: { words_left_today: number; resets_at: string };
}
export interface UnavailableResult {
  id: string;
  language: string;
  title: string;
  author?: string;
  available: boolean;
  message: string;
  url: string;
}
export interface FreeShelfResult {
  language: string;
  subject?: string;
  available: boolean;
  count: number;
  total?: number;
  titles: SearchResult[];
  message?: string;
}
export interface PrintOptionsResult {
  id: string;
  language: string;
  title: string;
  author?: string;
  status: string;
  editions: PrintBlock[];
  currency: string;
  note?: string;
}
export interface PublisherInfo {
  name: string;
  description: string;
  languages: { code?: string; name?: string; native_name?: string; dir?: string }[];
  website: string;
  terms_url: string;
  privacy_url: string;
}
export class Loa {
  constructor(options?: LoaOptions);
  baseUrl: string;
  call(tool: string, args?: Record<string, unknown>): Promise<any>;
  tools(format?: string): Promise<unknown[]>;
  openapi(): Promise<Record<string, any>>;
  searchBooks(args: SearchBooksArgs): Promise<SearchBooksResult>;
  getBook(args: GetBookArgs): Promise<BookResult>;
  getSummary(args: GetSummaryArgs): Promise<TextToolResult>;
  getSample(args: GetSampleArgs): Promise<TextToolResult>;
  listFreeShelf(args?: ListFreeShelfArgs): Promise<FreeShelfResult>;
  readFreeChapter(args: ReadFreeChapterArgs): Promise<TextToolResult>;
  getPrintOptions(args: GetPrintOptionsArgs): Promise<PrintOptionsResult>;
  getPublisherInfo(): Promise<PublisherInfo>;
}
