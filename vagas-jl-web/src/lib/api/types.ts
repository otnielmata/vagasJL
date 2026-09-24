/**
 * Tipos derivados do contrato OpenAPI da Vagas JL API
 * (vagas-jl-api/src/docs/swagger.yaml). Mantenha sincronizado ao evoluir a API.
 */

export type Role = 'candidate' | 'company' | 'admin';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  status: 'active' | 'inactive';
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface ApiErrorBody {
  message: string;
  errors?: { field?: string; message?: string }[];
}

/* ---------------------------------------------------------------- Candidato */

export type CandidateStatus =
  | 'pending_validation'
  | 'incomplete_profile'
  | 'active'
  | 'inactive'
  | 'blocked';

export type Availability = 'available' | 'unavailable' | 'UNKNOWN';

export interface CandidateEligibility {
  status: 'pending' | 'approved' | 'rejected';
  method: 'unknown' | 'email' | 'purchase_code' | 'trusted_identifier' | 'multiple' | 'legacy';
  lastAttemptAt: string | null;
  approvedAt: string | null;
}

export interface Candidate {
  _id: string;
  user: string;
  name: string;
  email: string;
  photoUrl?: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  professionalSummary?: string;
  availability?: Availability;
  availableForOpportunities: boolean;
  status: CandidateStatus;
  eligibility: CandidateEligibility;
  visibleToCompanies: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CandidateInput = Partial<
  Pick<
    Candidate,
    | 'name'
    | 'email'
    | 'photoUrl'
    | 'phone'
    | 'city'
    | 'state'
    | 'country'
    | 'linkedinUrl'
    | 'githubUrl'
    | 'portfolioUrl'
    | 'professionalSummary'
    | 'availability'
  >
> & { purchaseCode?: string; trustedIdentifier?: string };

/* ---------------------------------------------------------- Perfil de Match */

export type MatchFieldKey =
  | 'type'
  | 'agile'
  | 'programming'
  | 'automation'
  | 'webTesting'
  | 'apiTesting'
  | 'mobileTesting'
  | 'desktopTesting'
  | 'higherEducationDegree'
  | 'english'
  | 'spanish'
  | 'yearsOfExperience'
  | 'continuousIntegration'
  | 'certification'
  | 'testAutomationTechnologies'
  | 'qaTools'
  | 'programmingLanguages'
  | 'genAITools'
  | 'level'
  | 'classification'
  | 'role'
  | 'specialization';

export type MatchValue = boolean | number | string | string[] | null;
export type MatchValues = Partial<Record<MatchFieldKey, MatchValue>>;

export interface MatchProfileAnswer {
  state: 'UNKNOWN' | 'ANSWERED';
  value: boolean | number | string[] | null;
}

export interface MatchProfileCompletion {
  percentage: number;
  answeredFields: number;
  totalEligibleFields: number;
}

export interface CandidateMatchProfile {
  _id: string;
  candidate: string;
  configurationVersion: number;
  revision: number;
  values: MatchValues;
  answers: Partial<Record<MatchFieldKey, MatchProfileAnswer>>;
  completion: MatchProfileCompletion;
  pendingFields: MatchFieldKey[];
  matchEligible?: boolean;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------- Vagas */

export type VacancyOrigin = 'IMPORTED' | 'COMPANY' | 'ADMIN';
export type VacancyStatus = 'pending' | 'active' | 'paused' | 'expired' | 'removed' | 'rejected';
export type Importance = 'required' | 'desirable' | 'indifferent';

export interface VacancyRequirement {
  field: MatchFieldKey;
  id?: string;
  value?: number;
  importance: Importance;
  eliminatory?: boolean;
}

export interface GeographicRestriction {
  value: string;
  importance: Importance;
}

export interface ApplicationChannel {
  type: 'https_url' | 'email';
  value: string;
}

export interface VacancyLocation {
  city?: string;
  state?: string;
  country?: string;
}

export interface Vacancy {
  _id: string;
  company?: string | null;
  importSource?: string | null;
  importSourceId?: string | null;
  reference: string;
  title: string;
  description?: string;
  applicationChannel?: ApplicationChannel | null;
  location?: VacancyLocation | null;
  geographicRestrictions?: Partial<Record<'country' | 'state' | 'city', GeographicRestriction>> | null;
  matchProfile: {
    configurationVersion?: number;
    values: MatchValues;
    requirements?: VacancyRequirement[];
  };
  origin: VacancyOrigin;
  status: VacancyStatus;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompanyVacancyInput {
  reference: string;
  title: string;
  description: string;
  applicationChannel?: ApplicationChannel;
  expiresAt?: string | null;
  location?: VacancyLocation | null;
  geographicRestrictions?: Vacancy['geographicRestrictions'];
  matchProfile: { values: MatchValues; requirements?: VacancyRequirement[] };
}

/* -------------------------------------------------------------------- Match */

export interface MatchAuditReference {
  evaluationId: string;
  executionId: string;
  algorithmVersion: string;
  calculatedAt: string;
}

export interface MatchCriterionDetail {
  field: MatchFieldKey;
  id: string;
  label: string;
  importance: 'required' | 'desirable';
  status: 'met' | 'gap' | 'unknown';
  earnedPoints: number | null;
  possiblePoints: number;
  lostPoints: number | null;
}

export interface RankingPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  minimumMatchPercentage: number | null;
  rankingThresholdVersion: number | null;
}

export interface VacancyRankingItem {
  vacancy: Vacancy;
  percentage: number;
  earnedPoints: number;
  possiblePoints: number;
  matchedRequiredCount: number;
  configurationVersion: number;
  multipliersVersion: number;
  audit: MatchAuditReference;
}

export interface CandidateVacancyRanking extends Partial<RankingPage<VacancyRankingItem>> {
  recommendationStatus: 'available' | 'insufficient_profile_completeness';
  profileCompletion: MatchProfileCompletion & { pendingFields: MatchFieldKey[] };
  minimumProfileCompletionPercentage: number | null;
  completionThresholdVersion: number | null;
}

export interface CandidateRankingItem {
  candidate: { _id: string; name: string };
  percentage: number;
  earnedPoints: number;
  possiblePoints: number;
  matchedRequiredCount: number;
  configurationVersion: number;
  multipliersVersion: number;
  audit: MatchAuditReference;
}

export type MatchResultState = 'eligible' | 'below_threshold' | 'ineligible' | 'not_calculable';

export interface MatchDetail {
  vacancy: { _id: string; title: string };
  indicator: {
    dimension: 'technical_match';
    label: string;
    percentage: number | null;
    status: MatchResultState;
  };
  audit: MatchAuditReference;
  resultState: MatchResultState;
  resultLabel: string;
  calculationStatus: 'calculable' | 'not_calculable';
  percentage: number | null;
  earnedPoints: number | null;
  possiblePoints: number | null;
  configurationVersion: number;
  multipliersVersion: number;
  minimumMatchPercentage: number | null;
  rankingThresholdVersion: number | null;
  eligibility: { eligible: boolean | null; reason: Record<string, unknown> | null };
  metCriteria: MatchCriterionDetail[];
  gaps: MatchCriterionDetail[];
  availableCriteria: MatchCriterionDetail[];
  diagnostics: { code: string; field?: string | null; id?: string | null }[];
}

export interface ApplicationReferral {
  state: 'redirect_ready';
  applicationConfirmed: false;
  channel:
    | { type: 'https_url'; url: string }
    | { type: 'email'; address: string; uri: string };
  referral: { id: string; recordedAt: string };
  matchAdvisory: {
    blocksApplication: false;
    eligibility: { eligible: boolean | null; reason: Record<string, unknown> | null } | null;
  };
}

/* -------------------------------------------------------------- Engajamento */

export interface Engagement {
  status: 'available' | 'no_data' | 'unavailable';
  readOnly: true;
  indicator: {
    dimension: 'training_engagement';
    label: string;
    category: string | null;
    displayValue: string;
    categorySource: 'official' | null;
    availability: 'available' | 'no_data' | 'unavailable';
  };
  data: {
    engagementLevel?: string;
    cohort?: string;
    challengesCompleted?: number;
    totalChallenges?: number;
    score?: number;
    participation?: string | number;
    history?: { type?: string; title?: string; status?: string; occurredAt?: string; score?: number }[];
    projects?: { name?: string; description?: string; url?: string; status?: string; completedAt?: string }[];
  } | null;
  referenceAt: string | null;
  retrievedAt: string;
  reason?:
    | 'student_link_missing'
    | 'integration_not_configured'
    | 'student_not_found'
    | 'authorized_data_absent'
    | 'origin_unavailable';
}

/* --------------------------------------------------------------- Privacidade */

export interface OpportunityAvailabilityState {
  availableForOpportunities: boolean;
  changedAt: string | null;
  candidateStatus: CandidateStatus;
  visibleToCompanies: boolean;
}

export type ContactDisplayField = 'email' | 'phone' | 'linkedinUrl' | 'githubUrl' | 'portfolioUrl';
export type FormationDisplayField =
  | 'engagementLevel'
  | 'cohort'
  | 'challengesCompleted'
  | 'totalChallenges'
  | 'score'
  | 'participation'
  | 'history'
  | 'projects';

export interface DisplayPermissionsState {
  contact: ContactDisplayField[];
  formation: FormationDisplayField[];
  changedAt: string | null;
}

export interface PublicProfileState {
  enabled: boolean;
  fields: string[];
  effectiveFields: string[];
  consentedAt: string | null;
  revokedAt: string | null;
}

/* ------------------------------------------------------------------ Empresa */

export type CompanyStatus = 'pending' | 'active' | 'inactive' | 'blocked';

export interface Company {
  _id: string;
  legalName: string;
  tradeName?: string | null;
  website?: string | null;
  city: string;
  state: string;
  country: string;
  responsibleName: string;
  email: string;
  phone?: string | null;
  linkedinUrl?: string | null;
  segment?: string | null;
  status: CompanyStatus;
  createdAt?: string;
  updatedAt?: string;
}

export type CompanyInput = Omit<Company, '_id' | 'status' | 'createdAt' | 'updatedAt'>;
