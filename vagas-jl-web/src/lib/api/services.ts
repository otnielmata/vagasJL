import { api } from './client';
import type {
  ApplicationReferral,
  AuthResponse,
  Candidate,
  CandidateInput,
  CandidateMatchProfile,
  CandidateRankingItem,
  CandidateStatus,
  CandidateVacancyRanking,
  Company,
  CompanyInput,
  CompanyStatus,
  CompanyVacancyInput,
  ContactDisplayField,
  DisplayPermissionsState,
  Engagement,
  FormationDisplayField,
  MatchDetail,
  MatchValues,
  OpportunityAvailabilityState,
  PublicProfileState,
  RankingPage,
  Role,
  User,
  Vacancy,
  VacancyRequirement,
  VacancyStatus,
} from './types';

/** Serviços por dominio. Cada funcao mapeia 1:1 um endpoint do Swagger. */

export const authService = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/login', { email, password }, { auth: false }),
  register: (input: { name: string; email: string; password: string; role: Exclude<Role, 'admin'> }) =>
    api.post<{ user: User }>('/usuarios', input, { auth: false }),
  me: () => api.get<{ user: User }>('/api/users/me'),
  health: () => api.get<{ status: string; timestamp: string }>('/api/health', { auth: false }),
};

export const userService = {
  update: (id: string, input: { name?: string; email?: string; password?: string }) =>
    api.put<{ user: User }>(`/usuarios/${id}`, input),
  remove: (id: string) => api.delete<void>(`/usuarios/${id}`),
};

export const candidateService = {
  create: (input: CandidateInput & { name: string; email: string }) =>
    api.post<{ candidate: Candidate }>('/candidatos', input),
  get: (id: string) => api.get<{ candidate: Candidate }>(`/candidatos/${id}`),
  update: (id: string, input: CandidateInput) => api.patch<{ candidate: Candidate }>(`/candidatos/${id}`, input),
  remove: (id: string) => api.delete<void>(`/candidatos/${id}`),
  validate: (id: string, input: { purchaseCode?: string; trustedIdentifier?: string }) =>
    api.post<{ candidate: Candidate }>(`/candidatos/${id}/validacao`, input),

  // Perfil de Match (VJ-29/30/72)
  getMatchProfile: () => api.get<{ profile: CandidateMatchProfile }>('/candidatos/me/perfil-match'),
  createMatchProfile: (values: MatchValues) =>
    api.post<{ profile: CandidateMatchProfile }>('/candidatos/me/perfil-match', { values }),
  updateMatchProfile: (values: MatchValues) =>
    api.patch<{ profile: CandidateMatchProfile }>('/candidatos/me/perfil-match', { values }),

  // Match e ranking (VJ-45/63/64/86)
  vacancyRanking: (params: { page?: number; limit?: number } = {}) =>
    api.get<CandidateVacancyRanking>('/candidatos/me/vagas/ranking', { query: params }),
  matchDetail: (vacancyId: string) => api.get<MatchDetail>(`/candidatos/me/vagas/${vacancyId}/match`),
  apply: (vacancyId: string) =>
    api.post<{ application: ApplicationReferral }>(`/candidatos/me/vagas/${vacancyId}/candidatura`),

  // Engajamento (VJ-67/68)
  engagement: () => api.get<{ engagement: Engagement }>('/candidatos/me/engajamento'),

  // Privacidade (VJ-74/75/76)
  setAvailability: (availableForOpportunities: boolean) =>
    api.patch<{ availability: OpportunityAvailabilityState }>('/candidatos/me/disponibilidade', {
      availableForOpportunities,
    }),
  setDisplayPermissions: (input: { contact?: ContactDisplayField[]; formation?: FormationDisplayField[] }) =>
    api.patch<{ permissions: DisplayPermissionsState }>('/candidatos/me/permissoes-exibicao', input),
  setPublicProfile: (input: { enabled: boolean; fields?: string[] }) =>
    api.patch<{ publicProfile: PublicProfileState }>('/candidatos/me/perfil-publico', input),
};

export const companyService = {
  register: (input: CompanyInput) => api.post<{ company: Company }>('/empresas', input),
  get: (id: string) => api.get<{ company: Company; usuarios: { _id: string; name: string; email: string }[] }>(
    `/empresas/${id}/cadastro`,
  ),
  update: (id: string, input: { empresa?: Partial<CompanyInput>; usuarioAtual?: { name: string } }) =>
    api.patch<{ company: Company }>(`/empresas/${id}/cadastro`, input),
  remove: (id: string) => api.delete<void>(`/empresas/${id}/cadastro`),
  addUser: (id: string, userId: string) => api.post<unknown>(`/empresas/${id}/usuarios`, { userId }),
  createVacancy: (companyId: string, input: CompanyVacancyInput) =>
    api.post<{ vacancy: Vacancy }>(`/empresas/${companyId}/vagas`, input),
};

export const vacancyService = {
  candidateRanking: (vacancyId: string, params: { page?: number; limit?: number } = {}) =>
    api.get<RankingPage<CandidateRankingItem>>(`/vagas/${vacancyId}/candidatos/ranking`, { query: params }),
  setStatus: (vacancyId: string, status: Exclude<VacancyStatus, 'pending'>, reason: string) =>
    api.patch<{ vacancy: Vacancy }>(`/vagas/${vacancyId}/status`, { status, reason }),
  setRequirements: (vacancyId: string, requirements: VacancyRequirement[]) =>
    api.patch<{ vacancy: Vacancy }>(`/vagas/${vacancyId}/requisitos`, { requirements }),
  extractRequirements: (vacancyId: string) => api.post<unknown>(`/vagas/${vacancyId}/normalizacao`, { action: 'extract' }),
};

export const adminService = {
  setCompanyStatus: (id: string, status: CompanyStatus, reason: string) =>
    api.patch<{ company: { _id: string; status: CompanyStatus }; previousStatus: CompanyStatus; changed: boolean }>(
      `/admin/empresas/${id}/status`,
      { status, reason },
    ),
  setCandidateStatus: (id: string, status: CandidateStatus, reason: string) =>
    api.patch<{ candidate: { _id: string; status: CandidateStatus }; previousStatus: CandidateStatus; changed: boolean }>(
      `/admin/candidatos/${id}/status`,
      { status, reason },
    ),
  setRankingThreshold: (minimumPercentage: number) =>
    api.put<unknown>('/configuracoes/match/limiar-ranking', { minimumPercentage }),
  setCompletionThreshold: (minimumPercentage: number) =>
    api.put<unknown>('/configuracoes/match/completude-minima', { minimumPercentage }),
  setMultipliers: (desirable: number) =>
    api.put<unknown>('/configuracoes/match/multiplicadores', { required: 1, desirable, indifferent: 0 }),
};
