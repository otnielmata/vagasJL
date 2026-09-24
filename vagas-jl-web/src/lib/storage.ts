/**
 * Persistencia leve no navegador. Tudo protegido por try/catch: modo privado,
 * SSR ou storage bloqueado nao podem quebrar a aplicacao.
 */
const TOKEN_KEY = 'vjl.token';
const USER_KEY = 'vjl.user';
const CANDIDATE_KEY = 'vjl.candidateId';
const COMPANY_KEY = 'vjl.companyId';

function read(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (typeof window === 'undefined') return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage indisponivel */
  }
}

export const tokenStorage = {
  get: () => read(TOKEN_KEY),
  set: (v: string | null) => write(TOKEN_KEY, v),
};

export const userStorage = {
  get: <T>(): T | null => {
    const raw = read(USER_KEY);
    try {
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set: (v: unknown | null) => write(USER_KEY, v === null ? null : JSON.stringify(v)),
};

/**
 * A API nao possui GET /candidatos/me nem vinculo empresa<-usuario consultavel
 * (docs/API-GAPS.md). Guardamos os IDs conhecidos no dispositivo como ponte.
 */
export const linkStorage = {
  getCandidateId: () => read(CANDIDATE_KEY),
  setCandidateId: (v: string | null) => write(CANDIDATE_KEY, v),
  getCompanyId: () => read(COMPANY_KEY),
  setCompanyId: (v: string | null) => write(COMPANY_KEY, v),
  clear: () => {
    write(CANDIDATE_KEY, null);
    write(COMPANY_KEY, null);
  },
};
