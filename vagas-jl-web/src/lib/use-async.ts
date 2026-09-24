'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';

export interface AsyncState<T> {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (data: T) => void;
}

/** Carrega dados de forma declarativa, com estado de loading/erro e recarga. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], enabled = true): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<ApiError>();
  const [loading, setLoading] = useState(enabled);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const run = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setData(await fnRef.current());
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, { message: 'Erro inesperado' }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Busca de dados: setState ocorre apos a Promise (padrao aceito).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (enabled) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  return { data, error, loading, reload: run, setData };
}
