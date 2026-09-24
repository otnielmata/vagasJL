import type { ApiErrorBody } from './types';
import { tokenStorage } from '@/lib/storage';

/** URL base da API. Pode ser absoluta (http://localhost:3000) ou relativa ao proxy (/backend). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '/backend').replace(/\/$/, '');
export const API_MOCK = process.env.NEXT_PUBLIC_API_MOCK === 'true';

/** Erro padronizado a partir do contrato `Error` da API ({ message, errors[] }). */
export class ApiError extends Error {
  readonly status: number;
  readonly errors: ApiErrorBody['errors'];

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || 'Erro inesperado');
    this.name = 'ApiError';
    this.status = status;
    this.errors = body.errors;
  }

  /** Mensagem do campo, quando a API devolve erros de validacao por campo. */
  fieldError(field: string): string | undefined {
    return this.errors?.find((e) => e.field === field)?.message;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

/** Callback registrado pelo AuthProvider para encerrar a sessao em 401. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  if (API_MOCK) {
    const { mockRequest } = await import('./mock');
    return mockRequest<T>(method, path, opts);
  }

  const url = new URL(API_URL + path, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  Object.entries(opts.query ?? {}).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, String(v)));

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = tokenStorage.get();
  if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, { message: 'Não foi possível conectar à API. Verifique sua conexão.' });
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && opts.auth !== false) onUnauthorized?.();
    throw new ApiError(res.status, data as ApiErrorBody);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, { ...opts, body }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
};
