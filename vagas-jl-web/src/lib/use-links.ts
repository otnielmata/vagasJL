'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { linkStorage } from '@/lib/storage';

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const emit = () => listeners.forEach((l) => l());

/** IDs locais de candidato/empresa, seguros para SSR (null no servidor). */
export function useCandidateId() {
  const id = useSyncExternalStore(subscribe, linkStorage.getCandidateId, () => null);
  const set = useCallback((v: string | null) => {
    linkStorage.setCandidateId(v);
    emit();
  }, []);
  return [id, set] as const;
}

export function useCompanyId() {
  const id = useSyncExternalStore(subscribe, linkStorage.getCompanyId, () => null);
  const set = useCallback((v: string | null) => {
    linkStorage.setCompanyId(v);
    emit();
  }, []);
  return [id, set] as const;
}

const VACANCIES_KEY = 'vjl.companyVacancies';
export interface LocalVacancyRef {
  _id: string;
  title: string;
  reference: string;
  createdAt: string;
}

let cachedRaw: string | null = null;
let cachedList: LocalVacancyRef[] = [];
const EMPTY: LocalVacancyRef[] = [];

function readVacancies(): LocalVacancyRef[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(VACANCIES_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  try {
    cachedList = raw ? (JSON.parse(raw) as LocalVacancyRef[]) : EMPTY;
  } catch {
    cachedList = EMPTY;
  }
  return cachedList;
}

/**
 * Vagas criadas neste dispositivo pela empresa. Ponte ate existir
 * GET /empresas/{id}/vagas na API (docs/API-GAPS.md).
 */
export function useCompanyVacancies() {
  const list = useSyncExternalStore(subscribe, readVacancies, () => EMPTY);
  const add = useCallback((v: LocalVacancyRef) => {
    const next = [v, ...readVacancies().filter((x) => x._id !== v._id)].slice(0, 50);
    try {
      window.localStorage.setItem(VACANCIES_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    emit();
  }, []);
  return [list, add] as const;
}
