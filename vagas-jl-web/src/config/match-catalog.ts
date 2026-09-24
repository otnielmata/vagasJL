import type { MatchFieldKey } from '@/lib/api/types';

/**
 * Catalogo local do Perfil de Match (fallback).
 *
 * A API ainda nao expoe um GET publico da configuracao publicada (VJ-28) —
 * ver docs/API-GAPS.md. Ate la, o front usa estes IDs canonicos, espelhados de
 * vagas-jl-api/src/config/*.js. A API aceita IDs, rotulos e aliases publicados,
 * entao enviar o ID canonico e sempre seguro. Quando o endpoint existir, troque
 * `getMatchCatalog()` para ler da API e mantenha este arquivo apenas como cache.
 */

export type FieldKind = 'boolean' | 'single' | 'multi' | 'number';

export interface CatalogOption {
  id: string;
  label: string;
}

export interface MatchFieldDef {
  key: MatchFieldKey;
  label: string;
  hint?: string;
  kind: FieldKind;
  group: 'contexto' | 'praticas' | 'ferramentas' | 'idiomas' | 'carreira';
  weight: number;
  options?: CatalogOption[];
}

const opt = (id: string, label: string): CatalogOption => ({ id, label });

export const MATCH_GROUPS: Record<MatchFieldDef['group'], { title: string; description: string }> = {
  contexto: { title: 'Modalidade e experiência', description: 'Como e há quanto tempo você trabalha com QA.' },
  praticas: { title: 'Práticas de teste', description: 'Tipos de teste e práticas que você domina.' },
  ferramentas: { title: 'Ferramentas e linguagens', description: 'Selecione a partir do catálogo padronizado.' },
  idiomas: { title: 'Idiomas e formação', description: 'Informações que empresas costumam exigir.' },
  carreira: { title: 'Carreira', description: 'Senioridade, função e especialização.' },
};

export const MATCH_FIELDS: MatchFieldDef[] = [
  {
    key: 'type',
    label: 'Modalidade',
    hint: 'Você pode aceitar mais de uma.',
    kind: 'multi',
    group: 'contexto',
    weight: 8,
    options: [opt('remote', 'Remoto'), opt('hybrid', 'Híbrido'), opt('onsite', 'Presencial')],
  },
  { key: 'yearsOfExperience', label: 'Anos de experiência', kind: 'number', group: 'contexto', weight: 9 },

  { key: 'agile', label: 'Agile', kind: 'boolean', group: 'praticas', weight: 4 },
  { key: 'programming', label: 'Programação', kind: 'boolean', group: 'praticas', weight: 3 },
  { key: 'automation', label: 'Automação', kind: 'boolean', group: 'praticas', weight: 5 },
  { key: 'webTesting', label: 'Web Testing', kind: 'boolean', group: 'praticas', weight: 6 },
  { key: 'apiTesting', label: 'API Testing', kind: 'boolean', group: 'praticas', weight: 7 },
  { key: 'mobileTesting', label: 'Mobile Testing', kind: 'boolean', group: 'praticas', weight: 5 },
  { key: 'desktopTesting', label: 'Desktop Testing', kind: 'boolean', group: 'praticas', weight: 4 },
  { key: 'continuousIntegration', label: 'CI/CD', kind: 'boolean', group: 'praticas', weight: 6 },

  {
    key: 'testAutomationTechnologies',
    label: 'Frameworks e ferramentas de automação',
    kind: 'multi',
    group: 'ferramentas',
    weight: 10,
    options: [
      opt('cypress', 'Cypress'), opt('selenium', 'Selenium'), opt('playwright', 'Playwright'),
      opt('postman', 'Postman'), opt('appium', 'Appium'), opt('robot_framework', 'Robot Framework'),
      opt('cucumber', 'Cucumber'), opt('jmeter', 'JMeter'), opt('k6', 'K6'), opt('restassured', 'RestAssured'),
      opt('testng', 'TestNG'), opt('soapui', 'SoapUI'), opt('karate', 'Karate'), opt('gatling', 'Gatling'),
      opt('loadrunner', 'LoadRunner'),
    ],
  },
  {
    key: 'programmingLanguages',
    label: 'Linguagens de programação',
    kind: 'multi',
    group: 'ferramentas',
    weight: 9,
    options: [
      opt('javascript', 'JavaScript'), opt('typescript', 'TypeScript'), opt('java', 'Java'),
      opt('python', 'Python'), opt('csharp', 'C#'), opt('php', 'PHP'), opt('ruby', 'Ruby'),
      opt('kotlin', 'Kotlin'), opt('swift', 'Swift'), opt('cpp', 'C++'), opt('groovy', 'Groovy'),
      opt('plsql', 'PL/SQL'),
    ],
  },
  {
    key: 'qaTools',
    label: 'Ferramentas de QA e Gestão de Testes',
    kind: 'multi',
    group: 'ferramentas',
    weight: 5,
    options: [
      opt('testrail', 'TestRail'), opt('xray', 'Xray'), opt('zephyr', 'Zephyr'),
      opt('azure_devops', 'Azure DevOps'), opt('testlink', 'TestLink'), opt('qtest', 'qTest'),
      opt('hp_alm', 'HP ALM'),
    ],
  },
  {
    key: 'genAITools',
    label: 'Ferramentas de IA',
    kind: 'multi',
    group: 'ferramentas',
    weight: 5,
    options: [
      opt('chatgpt', 'ChatGPT'), opt('copilot', 'GitHub Copilot'), opt('claude', 'Claude'),
      opt('gemini', 'Gemini'), opt('cursor', 'Cursor'),
    ],
  },

  {
    key: 'english',
    label: 'Inglês',
    kind: 'single',
    group: 'idiomas',
    weight: 7,
    options: [opt('basic', 'Básico'), opt('intermediate', 'Intermediário'), opt('advanced', 'Avançado'), opt('fluent', 'Fluente')],
  },
  {
    key: 'spanish',
    label: 'Espanhol',
    kind: 'single',
    group: 'idiomas',
    weight: 3,
    options: [opt('basic', 'Básico'), opt('intermediate', 'Intermediário'), opt('advanced', 'Avançado'), opt('fluent', 'Fluente')],
  },
  { key: 'higherEducationDegree', label: 'Formação superior', kind: 'boolean', group: 'idiomas', weight: 3 },
  { key: 'certification', label: 'Certificação (ex.: CTFL)', kind: 'boolean', group: 'idiomas', weight: 2 },

  {
    key: 'level',
    label: 'Senioridade',
    kind: 'single',
    group: 'carreira',
    weight: 10,
    options: [opt('intern', 'Estágio'), opt('junior', 'Júnior'), opt('mid', 'Pleno'), opt('senior', 'Sênior'), opt('specialist', 'Especialista')],
  },
  {
    key: 'role',
    label: 'Função',
    kind: 'single',
    group: 'carreira',
    weight: 5,
    options: [
      opt('qa_analyst', 'Analista de QA'), opt('qa_engineer', 'QA Engineer'), opt('sdet', 'SDET'),
      opt('qa_lead', 'QA Lead'), opt('test_manager', 'Gerente de Testes'),
    ],
  },
  {
    key: 'specialization',
    label: 'Especialização',
    kind: 'single',
    group: 'carreira',
    weight: 7,
    options: [
      opt('test_automation', 'Automação de testes'), opt('manual_testing', 'Testes manuais'),
      opt('performance', 'Performance'), opt('security', 'Segurança'), opt('mobile', 'Mobile'),
      opt('accessibility', 'Acessibilidade'),
    ],
  },
  {
    key: 'classification',
    label: 'Classificação',
    kind: 'single',
    group: 'carreira',
    weight: 3,
    options: [opt('functional', 'Funcional'), opt('technical', 'Técnico'), opt('hybrid_profile', 'Híbrido')],
  },
];

export const MATCH_FIELD_MAP = Object.fromEntries(MATCH_FIELDS.map((f) => [f.key, f])) as Record<
  MatchFieldKey,
  MatchFieldDef
>;

export function fieldLabel(key: string): string {
  return MATCH_FIELD_MAP[key as MatchFieldKey]?.label ?? key;
}

export function optionLabel(key: string, id: string): string {
  return MATCH_FIELD_MAP[key as MatchFieldKey]?.options?.find((o) => o.id === id)?.label ?? id;
}

export function getMatchCatalog(): MatchFieldDef[] {
  return MATCH_FIELDS;
}
