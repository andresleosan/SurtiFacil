// Type definitions for Cloudflare D1 and Pages Functions in web/functions

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: {
    duration?: number;
    rows_read?: number;
    rows_written?: number;
    changes?: number;
    last_row_id?: number;
  };
  error?: string;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec<T = unknown>(query: string): Promise<D1Result<T>>;
}

export interface Env {
  DB: D1Database;
  FIREBASE_PROJECT_ID?: string;
  DEEPSEEK_API_KEY?: string;
  ENVIRONMENT?: string;
  [key: string]: unknown;
}

export interface EventContext<Env, Params extends string = any, Data extends Record<string, unknown> = Record<string, unknown>> {
  request: Request;
  functionPath: string;
  waitUntil: (promise: Promise<unknown>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: Env;
  params: Record<Params, string | string[]>;
  data: Data;
}

export type PagesFunction<
  TEnv = Env,
  Params extends string = any,
  Data extends Record<string, unknown> = Record<string, unknown>
> = (context: EventContext<TEnv, Params, Data>) => Response | Promise<Response>;

