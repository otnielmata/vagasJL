require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Vacancy = require('../../src/models/vacancy.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const MatchEngineConfiguration = require('../../src/models/match-engine-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { normalizeVacancyDescription, extractSuggestions, reviewedSuggestions, EXTRACTOR_VERSION } =
  require('../../src/services/vacancy-description-normalization.service');

const vacancyId = '6512f1e2b3a1c2d3e4f5a6b7';
const actorId = '6512f1e2b3a1c2d3e4f5a6b8';
const now = new Date('2026-09-23T15:00:00.000Z');
const configuration = { version: 8, fields: [
  { key: 'type', weight: 8,
    options: [{ id: 'remote', label: 'Remoto', aliases: ['Remote'] }] },
  { key: 'testAutomationTechnologies', weight: 10, options: [
    { id: 'cypress', label: 'Cypress', aliases: ['Cypress Framework', 'Cypress.io'] },
    { id: 'playwright', label: 'Playwright', aliases: [] },
  ] },
] };

function setup(context, overrides = {}) {
  const vacancy = { _id: vacancyId, origin: 'ADMIN', status: 'pending', deletedAt: null,
    description: 'Buscamos Cypress Framework. Ferramentas: MysteryTool.',
    updatedAt: new Date('2026-09-23T14:00:00.000Z'), normalizationRevision: 0,
    normalizationDraft: null, normalizationHistory: [], requirementsRevision: 0,
    matchProfile: { configurationVersion: 7, values: { type: ['remote'] },
      requirements: [{ field: 'type', id: 'remote', importance: 'required' }] }, ...overrides };
  const vacancyQuery = { select: async () => vacancy };
  context.mock.method(Vacancy, 'findById', () => vacancyQuery);
  const configurationQuery = { sort: async () => configuration };
  context.mock.method(Configuration, 'findOne', () => configurationQuery);
  const operations = [];
  const update = context.mock.method(Vacancy, 'findOneAndUpdate', (_filter, operation) => ({
    select: async () => {
      operations.push(operation);
      if (operation.$push?.normalizationHistory) {
        vacancy.normalizationHistory.push(operation.$push.normalizationHistory);
      }
      Object.assign(vacancy, operation.$set);
      vacancy.updatedAt = new Date(vacancy.updatedAt.getTime() + 1);
      return vacancy;
    },
  }));
  const engine = { version: 'MATCH_V3', state: 'published', revision: 3,
    weights: { ...INITIAL_MATCH_WEIGHTS },
    multipliers: { required: 1, desirable: 0.5, indifferent: 0 },
    defaultImportImportance: 'desirable', minimumMatchPercentage: 60,
    minimumProfileCompletionPercentage: null, effectiveAt: new Date('2026-09-01T00:00:00.000Z'),
    recalculation: { policy: 'affected_matches' }, publishedBy: actorId, publishedAt: now };
  const engineQuery = { sort: async () => engine };
  context.mock.method(MatchEngineConfiguration, 'findOne', () => engineQuery);
  return { vacancy, operations, update };
}

test('extracts a canonical alias with provenance and leaves unknown terms pending', () => {
  const suggestions = extractSuggestions(
    'Buscamos Cypress Framework. Ferramentas: MysteryTool.', configuration,
  );
  assert.equal(suggestions.length, 2);
  assert.deepEqual(suggestions[0], {
    id: suggestions[0].id, field: 'testAutomationTechnologies',
    originalValue: 'Cypress Framework', canonicalId: 'cypress', confidence: 1,
    origin: 'description', sourceStart: 9, sourceEnd: 26,
    extractorVersion: EXTRACTOR_VERSION, catalogStatus: 'matched', state: 'suggested',
    candidates: [], importance: null, eliminatory: null,
  });
  assert.equal(suggestions[1].originalValue, 'MysteryTool');
  assert.equal(suggestions[1].catalogStatus, 'pending');
  assert.equal(suggestions[1].canonicalId, null);
});

test('extraction does not infer importance or eliminatory rules from a simple mention', () => {
  const [playwright] = extractSuggestions('Conhecimento em Playwright.', configuration);
  assert.equal(playwright.canonicalId, 'playwright');
  assert.equal(playwright.importance, null);
  assert.equal(playwright.eliminatory, null);
  assert.equal(playwright.state, 'suggested');
});

test('ambiguous aliases remain pending instead of choosing a canonical item', () => {
  const ambiguous = { version: 9, fields: [
    { key: 'qaTools', options: [{ id: 'shared_one', label: 'Shared', aliases: [] }] },
    { key: 'testAutomationTechnologies',
      options: [{ id: 'shared_two', label: 'Other', aliases: ['Shared'] }] },
  ] };
  const [suggestion] = extractSuggestions('Conhecimento em Shared.', ambiguous);
  assert.equal(suggestion.catalogStatus, 'pending');
  assert.equal(suggestion.canonicalId, null);
  assert.equal(suggestion.confidence, 0.5);
  assert.deepEqual(suggestion.candidates, [
    { field: 'qaTools', canonicalId: 'shared_one' },
    { field: 'testAutomationTechnologies', canonicalId: 'shared_two' },
  ]);
  const [reviewed] = reviewedSuggestions({ revision: 1, suggestions: [suggestion] }, {
    action: 'review', revision: 1, decisions: [{ id: suggestion.id, state: 'accepted',
      field: 'qaTools', canonicalId: 'shared_one', importance: 'required', eliminatory: false }],
  });
  assert.equal(reviewed.catalogStatus, 'matched');
  assert.equal(reviewed.field, 'qaTools');
  assert.equal(reviewed.canonicalId, 'shared_one');
});

test('normalization is idempotent and does not publish suggestions before explicit review', async (context) => {
  const { vacancy, operations, update } = setup(context);
  const first = await normalizeVacancyDescription({ id: actorId, role: 'admin' }, vacancyId,
    { action: 'extract' }, now);
  const repeated = await normalizeVacancyDescription({ id: actorId, role: 'admin' }, vacancyId,
    { action: 'extract' }, now);
  assert.deepEqual(repeated, first);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(operations[0].$set.matchProfile, undefined);
  assert.deepEqual(vacancy.matchProfile.values, { type: ['remote'] });
  assert.equal(first.suggestions[0].state, 'suggested');
});

test('authorized review publishes only accepted catalog items and schedules recalculation', async (context) => {
  const { vacancy, operations } = setup(context);
  const extracted = await normalizeVacancyDescription({ id: actorId, role: 'admin' }, vacancyId,
    { action: 'extract' }, now);
  const known = extracted.suggestions.find((suggestion) => suggestion.canonicalId === 'cypress');
  const reviewed = await normalizeVacancyDescription({ id: actorId, role: 'admin' }, vacancyId,
    { action: 'review', revision: extracted.revision, decisions: [{ id: known.id,
      state: 'accepted', importance: 'desirable', eliminatory: false }] }, now);
  assert.equal(reviewed.suggestions.find((suggestion) => suggestion.id === known.id).state, 'accepted');
  assert.equal(operations[1].$set.matchProfile, undefined);

  const published = await normalizeVacancyDescription({ id: actorId, role: 'admin' }, vacancyId,
    { action: 'publish', revision: reviewed.revision, reason: 'Revisao tecnica aprovada' }, now);
  assert.equal(published.status, 'published');
  assert.equal(published.recalculation.status, 'scheduled');
  assert.equal(published.recalculation.engineVersion, 'MATCH_V3');
  assert.deepEqual(vacancy.matchProfile.values.testAutomationTechnologies, ['cypress']);
  assert.deepEqual(vacancy.matchProfile.requirements.at(-1), {
    field: 'testAutomationTechnologies', id: 'cypress', importance: 'desirable',
  });
  assert.equal(vacancy.requirementsRevision, 1);
  assert.equal(operations[2].$push.requirementsHistory.reason, 'Revisao tecnica aprovada');
  assert.equal(vacancy.normalizationHistory.length, 2);
});

test('pending catalog terms cannot be accepted or silently published', async (context) => {
  const { operations } = setup(context);
  const extracted = await normalizeVacancyDescription({ id: actorId, role: 'admin' }, vacancyId,
    { action: 'extract' }, now);
  const pending = extracted.suggestions.find((suggestion) => suggestion.catalogStatus === 'pending');
  await assert.rejects(normalizeVacancyDescription({ id: actorId, role: 'admin' }, vacancyId,
    { action: 'review', revision: extracted.revision, decisions: [{ id: pending.id,
      state: 'accepted', importance: 'required', eliminatory: false }] }, now), { statusCode: 409 });
  assert.equal(operations.length, 1);
});

test('description changes preserve the previous draft and create a new revision', async (context) => {
  const { vacancy, operations } = setup(context);
  const first = await normalizeVacancyDescription({ id: actorId, role: 'admin' }, vacancyId,
    { action: 'extract' }, now);
  vacancy.description = 'Agora a vaga menciona Playwright.';
  const second = await normalizeVacancyDescription({ id: actorId, role: 'admin' }, vacancyId,
    { action: 'extract' }, new Date(now.getTime() + 1000));
  assert.equal(second.revision, first.revision + 1);
  assert.equal(second.suggestions[0].canonicalId, 'playwright');
  assert.equal(operations[1].$push.normalizationHistory.revision, first.revision);
});

test('unauthorized actors receive 403 and cannot alter the published profile', async (context) => {
  const { vacancy, update } = setup(context, { origin: 'IMPORTED' });
  await assert.rejects(normalizeVacancyDescription({ id: actorId, role: 'candidate' }, vacancyId,
    { action: 'extract' }, now), { statusCode: 403 });
  await assert.rejects(normalizeVacancyDescription({ id: actorId, role: 'company' }, vacancyId,
    { action: 'extract' }, now), { statusCode: 403 });
  assert.equal(update.mock.callCount(), 0);
  assert.deepEqual(vacancy.matchProfile.values, { type: ['remote'] });
});

test('normalization internals remain private in regular vacancy responses', () => {
  const vacancy = new Vacancy({ origin: 'ADMIN', createdBy: actorId, title: 'QA', description: 'Cypress',
    matchProfile: { configurationVersion: 1, values: { type: ['remote'] }, requirements: [] },
    normalizationRevision: 1, normalizationDraft: { revision: 1,
      descriptionFingerprint: 'a'.repeat(64), extractorVersion: EXTRACTOR_VERSION,
      configurationVersion: 1, status: 'draft', suggestions: [], createdAt: now, updatedAt: now } });
  assert.equal(vacancy.validateSync(), undefined);
  assert.equal(vacancy.toJSON().normalizationDraft, undefined);
  assert.equal(vacancy.toJSON().normalizationHistory, undefined);
});
