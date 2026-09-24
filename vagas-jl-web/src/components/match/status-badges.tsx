import { Badge, type Tone } from '@/components/ui/badge';
import type { CandidateStatus, CompanyStatus, MatchResultState, VacancyOrigin, VacancyStatus } from '@/lib/api/types';

const candidate: Record<CandidateStatus, [string, Tone]> = {
  pending_validation: ['Pendente de validação', 'warning'],
  incomplete_profile: ['Perfil incompleto', 'info'],
  active: ['Ativo', 'success'],
  inactive: ['Inativo', 'muted'],
  blocked: ['Bloqueado', 'danger'],
};
const company: Record<CompanyStatus, [string, Tone]> = {
  pending: ['Pendente', 'warning'],
  active: ['Ativa', 'success'],
  inactive: ['Inativa', 'muted'],
  blocked: ['Bloqueada', 'danger'],
};
const vacancy: Record<VacancyStatus, [string, Tone]> = {
  pending: ['Pendente', 'warning'],
  active: ['Ativa', 'success'],
  paused: ['Pausada', 'info'],
  expired: ['Expirada', 'muted'],
  removed: ['Removida', 'muted'],
  rejected: ['Rejeitada', 'danger'],
};
const origin: Record<VacancyOrigin, [string, Tone]> = {
  IMPORTED: ['Importada', 'accent'],
  COMPANY: ['Empresa', 'primary'],
  ADMIN: ['Administração', 'neutral'],
};
const result: Record<MatchResultState, [string, Tone]> = {
  eligible: ['Compatível', 'success'],
  below_threshold: ['Compatibilidade baixa', 'warning'],
  ineligible: ['Não atende critério eliminatório', 'danger'],
  not_calculable: ['Não calculável', 'muted'],
};

const make = <K extends string>(map: Record<K, [string, Tone]>) =>
  function StatusBadge({ value }: { value: K }) {
    const [label, tone] = map[value] ?? [value, 'neutral'];
    return <Badge tone={tone}>{label}</Badge>;
  };

export const CandidateStatusBadge = make(candidate);
export const CompanyStatusBadge = make(company);
export const VacancyStatusBadge = make(vacancy);
export const OriginBadge = make(origin);
export const MatchResultBadge = make(result);

export const CANDIDATE_STATUS_LABEL = Object.fromEntries(Object.entries(candidate).map(([k, v]) => [k, v[0]])) as Record<CandidateStatus, string>;
export const COMPANY_STATUS_LABEL = Object.fromEntries(Object.entries(company).map(([k, v]) => [k, v[0]])) as Record<CompanyStatus, string>;
export const VACANCY_STATUS_LABEL = Object.fromEntries(Object.entries(vacancy).map(([k, v]) => [k, v[0]])) as Record<VacancyStatus, string>;
