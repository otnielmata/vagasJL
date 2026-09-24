/**
 * Modo demonstracao (NEXT_PUBLIC_API_MOCK=true).
 * Simula os contratos da API em memoria para desenvolver e revisar telas sem
 * backend. Nao e usado em producao. Qualquer senha funciona; o papel e
 * inferido pelo e-mail: empresa@... -> company, admin@... -> admin.
 */
import { ApiError, type RequestOptions } from './client';
import { linkStorage, userStorage } from '@/lib/storage';
import type {
  Candidate,
  CandidateMatchProfile,
  MatchDetail,
  Role,
  User,
  Vacancy,
  VacancyRankingItem,
} from './types';

const now = new Date().toISOString();
const audit = { evaluationId: 'demo', executionId: 'demo', algorithmVersion: 'MATCH_V1', calculatedAt: now };

function vacancy(id: string, title: string, company: string, city: string, type: string, level: string, tools: string[]): Vacancy {
  return {
    _id: id,
    reference: `REF-${id.slice(-4)}`,
    title,
    description: `${company} busca pessoa ${title} para atuar em squad de produto.`,
    company,
    origin: id.endsWith('1') ? 'IMPORTED' : 'COMPANY',
    status: 'active',
    location: { city, state: 'SP', country: 'Brasil' },
    applicationChannel: { type: 'https_url', value: 'https://jobs.example.com/vaga' },
    matchProfile: {
      configurationVersion: 1,
      values: { type: [type], level: [level], testAutomationTechnologies: tools, apiTesting: true },
    },
    createdAt: now,
    updatedAt: now,
  };
}

const VACANCIES: Vacancy[] = [
  vacancy('66f000000000000000000001', 'QA Engineer — Automação Web', 'Nuvem Pay', 'São Paulo', 'remote', 'mid', ['cypress', 'playwright', 'postman']),
  vacancy('66f000000000000000000002', 'Analista de Testes Pleno', 'Rota Logística', 'Campinas', 'hybrid', 'mid', ['selenium', 'postman']),
  vacancy('66f000000000000000000003', 'SDET Sênior', 'Banco Horizonte', 'São Paulo', 'remote', 'senior', ['playwright', 'k6', 'restassured']),
  vacancy('66f000000000000000000004', 'QA Mobile', 'AppFit', 'Curitiba', 'remote', 'mid', ['appium', 'cypress']),
  vacancy('66f000000000000000000005', 'QA Júnior — API', 'EduTech Lab', 'Belo Horizonte', 'onsite', 'junior', ['postman']),
  vacancy('66f000000000000000000006', 'QA Performance', 'Varejo Mais', 'Recife', 'remote', 'senior', ['jmeter', 'k6', 'gatling']),
];
const PERCENTS = [94, 88, 81, 76, 67, 61];

const state = {
  user: null as User | null,
  candidate: null as Candidate | null,
  profile: null as CandidateMatchProfile | null,
};

function makeUser(email: string, name?: string): User {
  const role: Role = email.startsWith('empresa') ? 'company' : email.startsWith('admin') ? 'admin' : 'candidate';
  return { _id: '66a0000000000000000000aa', name: name ?? (role === 'company' ? 'Recrutadora Demo' : role === 'admin' ? 'Admin Demo' : 'Maria Silva'), email, role, status: 'active' };
}

function makeCandidate(): Candidate {
  return {
    _id: '66b0000000000000000000bb',
    user: state.user?._id ?? '',
    name: state.user?.name ?? 'Maria Silva',
    email: state.user?.email ?? 'maria@example.com',
    city: 'São Paulo',
    state: 'SP',
    country: 'Brasil',
    linkedinUrl: 'https://linkedin.com/in/maria',
    githubUrl: 'https://github.com/maria',
    professionalSummary: 'QA com foco em automação web e testes de API.',
    availability: 'available',
    availableForOpportunities: true,
    status: 'active',
    eligibility: { status: 'approved', method: 'email', lastAttemptAt: now, approvedAt: now },
    visibleToCompanies: true,
    createdAt: now,
    updatedAt: now,
  };
}

function makeProfile(values: CandidateMatchProfile['values']): CandidateMatchProfile {
  const keys = Object.keys(values).filter((k) => values[k as keyof typeof values] !== null);
  const total = 22;
  return {
    _id: 'profile',
    candidate: state.candidate?._id ?? '',
    configurationVersion: 1,
    revision: (state.profile?.revision ?? 0) + 1,
    values,
    answers: {},
    completion: { percentage: Math.round((keys.length / total) * 100), answeredFields: keys.length, totalEligibleFields: total },
    pendingFields: [],
    matchEligible: true,
    createdAt: now,
    updatedAt: new Date().toISOString(),
  };
}

state.profile = makeProfile({
  type: ['remote', 'hybrid'], yearsOfExperience: 4, agile: true, programming: true, automation: true,
  webTesting: true, apiTesting: true, continuousIntegration: true, english: 'advanced',
  testAutomationTechnologies: ['cypress', 'postman', 'selenium'], programmingLanguages: ['javascript', 'typescript'],
  level: 'mid', role: 'qa_engineer', specialization: 'test_automation',
});

function detail(v: Vacancy, pct: number): MatchDetail {
  const crit = (id: string, label: string, field: MatchDetail['metCriteria'][number]['field'], status: 'met' | 'gap', pts: number, importance: 'required' | 'desirable' = 'required') => ({
    field, id, label, importance, status, possiblePoints: pts, earnedPoints: status === 'met' ? pts : 0, lostPoints: status === 'gap' ? pts : 0,
  });
  const below = pct < 65;
  return {
    vacancy: { _id: v._id, title: v.title },
    indicator: { dimension: 'technical_match', label: 'Match tecnico', percentage: pct, status: below ? 'below_threshold' : 'eligible' },
    audit,
    resultState: below ? 'below_threshold' : 'eligible',
    resultLabel: below ? 'Compatibilidade baixa' : 'Compatível',
    calculationStatus: 'calculable',
    percentage: pct,
    earnedPoints: pct,
    possiblePoints: 100,
    configurationVersion: 1,
    multipliersVersion: 1,
    minimumMatchPercentage: 60,
    rankingThresholdVersion: 1,
    eligibility: { eligible: true, reason: null },
    metCriteria: [
      crit('cypress', 'Cypress', 'testAutomationTechnologies', 'met', 10),
      crit('javascript', 'JavaScript', 'programmingLanguages', 'met', 9),
      crit('true', 'API Testing', 'apiTesting', 'met', 7),
      crit('true', 'CI/CD', 'continuousIntegration', 'met', 6),
      crit('true', 'Agile', 'agile', 'met', 4, 'desirable'),
      crit('advanced', 'Inglês', 'english', 'met', 7),
    ],
    gaps: [crit('playwright', 'Playwright', 'testAutomationTechnologies', 'gap', 10), crit('true', 'Mobile Testing', 'mobileTesting', 'gap', 2.5, 'desirable')],
    availableCriteria: [],
    diagnostics: [],
  };
}

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

export async function mockRequest<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
  await delay();
  const body = (opts.body ?? {}) as Record<string, unknown>;
  const route = `${method} ${path.replace(/[a-f0-9]{24}/g, ':id')}`;

  switch (route) {
    case 'POST /login': {
      state.user = makeUser(String(body.email ?? 'maria@example.com'));
      if (state.user.role === 'candidate') {
        state.candidate = makeCandidate();
        linkStorage.setCandidateId(state.candidate._id);
      }
      if (state.user.role === 'company') linkStorage.setCompanyId('66d0000000000000000000dd');
      return { user: state.user, token: 'demo-token' } as T;
    }
    case 'POST /usuarios':
      return { user: makeUser(String(body.email), String(body.name)) } as T;
    case 'GET /api/users/me':
      // Recarregar a pagina zera a memoria: reaproveita o usuario da sessao local.
      if (!state.user) state.user = userStorage.get<User>() ?? makeUser('maria@example.com');
      return { user: state.user } as T;
    case 'GET /api/health':
      return { status: 'ok', timestamp: now } as T;
    case 'POST /candidatos':
      state.candidate = { ...makeCandidate(), ...(body as Partial<Candidate>) };
      return { candidate: state.candidate } as T;
    case 'GET /candidatos/:id':
    case 'PATCH /candidatos/:id':
      state.candidate = { ...(state.candidate ?? makeCandidate()), ...(body as Partial<Candidate>) };
      return { candidate: state.candidate } as T;
    case 'GET /candidatos/me/perfil-match':
      if (!state.profile) throw new ApiError(404, { message: 'Perfil de Match nao encontrado' });
      return { profile: state.profile } as T;
    case 'POST /candidatos/me/perfil-match':
    case 'PATCH /candidatos/me/perfil-match':
      state.profile = makeProfile({ ...(state.profile?.values ?? {}), ...(body.values as object) });
      return { profile: state.profile } as T;
    case 'GET /candidatos/me/vagas/ranking': {
      const limit = Number(opts.query?.limit ?? 10);
      const items: VacancyRankingItem[] = VACANCIES.slice(0, limit).map((v, i) => ({
        vacancy: v, percentage: PERCENTS[i], earnedPoints: PERCENTS[i], possiblePoints: 100,
        matchedRequiredCount: 6 - i, configurationVersion: 1, multipliersVersion: 1, audit,
      }));
      return {
        recommendationStatus: 'available',
        profileCompletion: { ...state.profile!.completion, pendingFields: ['mobileTesting', 'spanish'] },
        items, total: VACANCIES.length, page: 1, limit, pages: 1,
        minimumMatchPercentage: 60, rankingThresholdVersion: 1,
        minimumProfileCompletionPercentage: 50, completionThresholdVersion: 1,
      } as T;
    }
    case 'GET /candidatos/me/vagas/:id/match': {
      const idx = Math.max(0, VACANCIES.findIndex((v) => path.includes(v._id)));
      return detail(VACANCIES[idx], PERCENTS[idx]) as T;
    }
    case 'POST /candidatos/me/vagas/:id/candidatura':
      return {
        application: {
          state: 'redirect_ready', applicationConfirmed: false,
          channel: { type: 'https_url', url: 'https://jobs.example.com/vaga' },
          referral: { id: 'ref', recordedAt: now },
          matchAdvisory: { blocksApplication: false, eligibility: { eligible: true, reason: null } },
        },
      } as T;
    case 'GET /candidatos/me/engajamento':
      return {
        engagement: {
          status: 'available', readOnly: true,
          indicator: { dimension: 'training_engagement', label: 'Engajamento na formacao', category: 'Alto', displayValue: 'Alto', categorySource: 'official', availability: 'available' },
          data: {
            engagementLevel: 'Alto', cohort: 'Turma 12 — Mentoria QA', challengesCompleted: 18, totalChallenges: 22, score: 1840, participation: '92%',
            history: [
              { type: 'challenge', title: 'Desafio API com Postman', status: 'Concluído', occurredAt: '2026-09-10', score: 120 },
              { type: 'challenge', title: 'Pipeline CI com GitHub Actions', status: 'Concluído', occurredAt: '2026-08-28', score: 150 },
              { type: 'challenge', title: 'E2E com Cypress', status: 'Concluído', occurredAt: '2026-08-12', score: 140 },
            ],
            projects: [{ name: 'Automação e-commerce', description: 'Suite E2E com Cypress + CI', status: 'Entregue', url: 'https://github.com/maria/ecommerce-e2e' }],
          },
          referenceAt: now, retrievedAt: now, cache: { hit: false, ttlSeconds: 300 },
        },
      } as T;
    case 'PATCH /candidatos/me/disponibilidade':
      return { availability: { availableForOpportunities: Boolean(body.availableForOpportunities), changedAt: now, candidateStatus: 'active', visibleToCompanies: Boolean(body.availableForOpportunities) } } as T;
    case 'PATCH /candidatos/me/permissoes-exibicao':
      return { permissions: { contact: body.contact ?? [], formation: body.formation ?? [], changedAt: now } } as T;
    case 'PATCH /candidatos/me/perfil-publico':
      return { publicProfile: { enabled: Boolean(body.enabled), fields: body.fields ?? [], effectiveFields: body.fields ?? [], consentedAt: now, revokedAt: null } } as T;
    case 'GET /vagas/:id/candidatos/ranking':
      return {
        items: ['Maria Silva', 'João Pereira', 'Ana Costa', 'Lucas Rocha', 'Beatriz Lima'].map((name, i) => ({
          candidate: { _id: `66c00000000000000000000${i}`, name }, percentage: PERCENTS[i], earnedPoints: PERCENTS[i], possiblePoints: 100,
          matchedRequiredCount: 5 - i, configurationVersion: 1, multipliersVersion: 1, audit,
        })),
        total: 5, page: 1, limit: 10, pages: 1, minimumMatchPercentage: 60, rankingThresholdVersion: 1,
      } as T;
    case 'POST /empresas/:id/vagas':
      return { vacancy: { ...VACANCIES[0], ...(body as object), _id: '66f0000000000000000000ff', status: 'pending', origin: 'COMPANY' } } as T;
    case 'GET /empresas/:id/cadastro':
      return {
        company: { _id: path.split('/')[2], legalName: 'Nuvem Pay Tecnologia LTDA', tradeName: 'Nuvem Pay', city: 'São Paulo', state: 'SP', country: 'Brasil', responsibleName: 'Recrutadora Demo', email: 'rh@nuvempay.example', status: 'active', segment: 'Fintech', website: 'https://nuvempay.example' },
        usuarios: [{ _id: 'u1', name: 'Recrutadora Demo', email: 'empresa@example.com' }],
      } as T;
    default:
      if (method !== 'GET') return { ok: true, changed: true } as T;
      throw new ApiError(404, { message: `Rota de demonstração não simulada: ${route}` });
  }
}
