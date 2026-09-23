require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../../src/models/user.model');
const Vacancy = require('../../src/models/vacancy.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const MatchEngineConfiguration = require('../../src/models/match-engine-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { manageAdminVacancy } = require('../../src/services/admin-vacancy.service');
const { assessVacancyForMatch } = require('../../src/services/vacancy-origin.service');

const vacancyId = '6512f1e2b3a1c2d3e4f5a6b7';
const adminId = '6512f1e2b3a1c2d3e4f5a6b8';
const now = new Date('2026-09-23T12:00:00.000Z');
const configuration = { version: 4, fields: Object.entries(INITIAL_MATCH_WEIGHTS)
  .map(([key, weight]) => ({ key, weight, options: key === 'type'
    ? [{ id: 'remote', label: 'Remoto', aliases: ['Remote'] }]
    : key === 'automation' ? [{ id: 'cypress', label: 'Cypress', aliases: [] }] : [] })) };

function input(overrides = {}) {
  return {
    version: 1,
    reason: 'Revisao administrativa',
    origin: 'ADMIN',
    status: 'pending',
    reference: 'qa-admin-01',
    title: 'Pessoa QA',
    description: 'Testes automatizados',
    location: { city: 'Sao Paulo', state: 'SP', country: 'Brasil' },
    expiresAt: '2027-01-01T00:00:00.000Z',
    matchProfile: { values: { type: 'remote', automation: 'cypress' }, requirements: [
      { field: 'type', id: 'remote', importance: 'required' },
      { field: 'automation', id: 'cypress', importance: 'desirable' },
    ] },
    ...overrides,
  };
}

function setup(context, existing = null, engine = null) {
  context.mock.method(User, 'findOne', () => ({ select: async () => ({ _id: adminId }) }));
  context.mock.method(Configuration, 'findOne', (query) => query
    ? Promise.resolve(configuration) : ({ sort: async () => configuration }));
  context.mock.method(MatchEngineConfiguration, 'findOne', () => ({ sort: async () => engine }));
  context.mock.method(Vacancy, 'findById', () => ({ select: async () => existing }));
  const create = context.mock.method(Vacancy, 'create', async (data) => new Vacancy(data));
  const update = context.mock.method(Vacancy, 'findOneAndUpdate', async (_filter, operation) => {
    const vacancy = new Vacancy({ ...existing.toObject(), ...operation.$set });
    vacancy.adminHistory.push(operation.$push.adminHistory);
    if (operation.$push.statusHistory) vacancy.statusHistory.push(operation.$push.statusHistory);
    if (operation.$push.requirementsHistory) {
      vacancy.requirementsHistory.push(operation.$push.requirementsHistory);
    }
    return vacancy;
  });
  return { create, update };
}

function existingVacancy(overrides = {}) {
  return new Vacancy({ _id: vacancyId, createdBy: adminId, origin: 'ADMIN', status: 'pending',
    reference: 'qa-admin-01', title: 'Pessoa QA', description: 'Testes automatizados',
    location: { city: 'Sao Paulo', state: 'SP', country: 'Brasil' },
    expiresAt: new Date('2027-01-01T00:00:00.000Z'), adminRevision: 1,
    matchProfile: { configurationVersion: 4, values: { type: ['remote'], automation: ['cypress'] },
      requirements: [{ field: 'type', id: 'remote', importance: 'required' },
        { field: 'automation', id: 'cypress', importance: 'desirable' }] },
    ...overrides,
  });
}

test('creates prescribed vacancy as ADMIN and PENDING with private complete audit', async (context) => {
  const { create, update } = setup(context);
  const result = await manageAdminVacancy({ id: adminId, role: 'admin' }, vacancyId, input(), now);

  assert.equal(result.created, true);
  assert.equal(result.changed, true);
  assert.equal(result.vacancy.validateSync(), undefined);
  assert.equal(result.vacancy._id.toString(), vacancyId);
  assert.equal(result.vacancy.origin, 'ADMIN');
  assert.equal(result.vacancy.status, 'pending');
  assert.equal(result.vacancy.adminRevision, 1);
  assert.equal(result.vacancy.adminHistory[0].before, null);
  assert.equal(result.vacancy.adminHistory[0].after.origin, 'ADMIN');
  assert.equal(result.vacancy.requirementsRevision, 1);
  assert.equal(result.vacancy.toJSON().adminHistory, undefined);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(update.mock.callCount(), 0);
});

test('approves a complete pending vacancy and schedules affected Match recalculation', async (context) => {
  const existing = existingVacancy();
  const engine = { version: 'MATCH_V2', revision: 2, state: 'published',
    weights: INITIAL_MATCH_WEIGHTS,
    multipliers: { required: 1, desirable: 0.5, indifferent: 0 },
    defaultImportImportance: 'desirable', minimumMatchPercentage: 60,
    minimumProfileCompletionPercentage: null, effectiveAt: now,
    recalculation: { policy: 'affected_matches' } };
  const { update } = setup(context, existing, engine);
  const result = await manageAdminVacancy({ id: adminId, role: 'admin' }, vacancyId,
    input({ version: 2, status: 'active', reason: 'Perfil revisado e aprovado' }), now);

  assert.equal(result.vacancy.status, 'active');
  assert.equal(result.vacancy.origin, 'ADMIN');
  assert.equal(result.vacancy.adminRevision, 2);
  assert.equal(result.vacancy.adminHistory.at(-1).before.status, 'pending');
  assert.equal(result.vacancy.adminHistory.at(-1).after.status, 'active');
  assert.equal(result.vacancy.adminHistory.at(-1).recalculation.status, 'scheduled');
  assert.equal(result.vacancy.adminHistory.at(-1).recalculation.engineVersion, 'MATCH_V2');
  assert.equal(update.mock.calls[0].arguments[1].$push.statusHistory.to, 'active');
  assert.equal(assessVacancyForMatch(result.vacancy, now).eligible, true);
});

test('rejects activation with incomplete requirement classification using 422 and no write', async (context) => {
  const existing = existingVacancy();
  const { update } = setup(context, existing);
  await assert.rejects(manageAdminVacancy({ id: adminId, role: 'admin' }, vacancyId,
    input({ version: 2, status: 'active', matchProfile: {
      values: { type: 'remote', automation: 'cypress' },
      requirements: [{ field: 'type', id: 'remote', importance: 'required' }],
    } }), now), { statusCode: 422 });
  assert.equal(update.mock.callCount(), 0);
});

test('removes an active vacancy without physical deletion and keeps before and after history', async (context) => {
  const existing = existingVacancy({ status: 'active' });
  const { update } = setup(context, existing);
  const result = await manageAdminVacancy({ id: adminId, role: 'admin' }, vacancyId,
    input({ version: 2, status: 'removed', reason: 'Oportunidade encerrada' }), now);

  assert.equal(result.vacancy.status, 'removed');
  assert.equal(result.vacancy.deletedAt, null);
  assert.equal(result.vacancy.adminHistory.at(-1).before.status, 'active');
  assert.equal(result.vacancy.adminHistory.at(-1).after.status, 'removed');
  assert.equal(assessVacancyForMatch(result.vacancy, now).eligible, false);
  assert.equal(update.mock.callCount(), 1);
});

test('preserves COMPANY and IMPORTED origins before catalog processing', async (context) => {
  for (const origin of ['COMPANY', 'IMPORTED']) {
    const existing = existingVacancy({ origin, ...(origin === 'COMPANY'
      ? { company: '6512f1e2b3a1c2d3e4f5a6b9' }
      : { createdBy: null, importSource: 'board', importSourceId: 'job-1' }) });
    const { update } = setup(context, existing);
    await assert.rejects(manageAdminVacancy({ id: adminId, role: 'admin' }, vacancyId,
      input({ version: 2, origin: 'ADMIN' }), now), { statusCode: 409 });
    assert.equal(existing.origin, origin);
    assert.equal(update.mock.callCount(), 0);
  }
});

test('reviews a company vacancy without changing its origin or technical provenance', async (context) => {
  const existing = existingVacancy({ origin: 'COMPANY',
    company: '6512f1e2b3a1c2d3e4f5a6b9' });
  const { update } = setup(context, existing);
  const result = await manageAdminVacancy({ id: adminId, role: 'admin' }, vacancyId,
    input({ version: 2, origin: 'COMPANY', title: 'Pessoa QA revisada' }), now);

  assert.equal(result.vacancy.origin, 'COMPANY');
  assert.equal(result.vacancy.company.toString(), '6512f1e2b3a1c2d3e4f5a6b9');
  assert.equal(result.vacancy.title, 'Pessoa QA revisada');
  assert.equal(update.mock.calls[0].arguments[1].$set.origin, undefined);
});

test('same version and representation is idempotent while conflicting versions return 409', async (context) => {
  const existing = existingVacancy();
  const { update } = setup(context, existing);
  const repeated = await manageAdminVacancy({ id: adminId, role: 'admin' }, vacancyId, input(), now);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.vacancy, existing);
  await assert.rejects(manageAdminVacancy({ id: adminId, role: 'admin' }, vacancyId,
    input({ title: 'Outro titulo' }), now), { statusCode: 409 });
  await assert.rejects(manageAdminVacancy({ id: adminId, role: 'admin' }, vacancyId,
    input({ version: 3, title: 'Outro titulo' }), now), { statusCode: 409 });
  assert.equal(update.mock.callCount(), 0);
});

test('requires an active administrator and validates create origin, initial status and revision', async (context) => {
  const { create } = setup(context);
  await assert.rejects(manageAdminVacancy({ id: adminId, role: 'company' }, vacancyId, input(), now),
    { statusCode: 403 });
  await assert.rejects(manageAdminVacancy({ id: adminId, role: 'admin' }, vacancyId,
    input({ origin: 'COMPANY' }), now), { statusCode: 409 });
  await assert.rejects(manageAdminVacancy({ id: adminId, role: 'admin' }, vacancyId,
    input({ status: 'active' }), now), { statusCode: 422 });
  await assert.rejects(manageAdminVacancy({ id: adminId, role: 'admin' }, vacancyId,
    input({ version: 2 }), now), { statusCode: 409 });
  assert.equal(create.mock.callCount(), 0);
});

test('inactive administrator is rejected before vacancy or catalog access', async (context) => {
  context.mock.method(User, 'findOne', () => ({ select: async () => null }));
  const find = context.mock.method(Vacancy, 'findById', () => assert.fail('must not query vacancy'));
  const catalog = context.mock.method(Configuration, 'findOne', () => assert.fail('must not query catalog'));
  await assert.rejects(manageAdminVacancy({ id: adminId, role: 'admin' }, vacancyId, input(), now),
    { statusCode: 403 });
  assert.equal(find.mock.callCount(), 0);
  assert.equal(catalog.mock.callCount(), 0);
});

test('model stores administration audit privately and keeps origin immutable', () => {
  assert.equal(Vacancy.schema.path('adminHistory').options.select, false);
  assert.equal(Vacancy.schema.path('adminContentFingerprint').options.select, false);
  assert.equal(Vacancy.schema.path('origin').options.immutable, true);
});
