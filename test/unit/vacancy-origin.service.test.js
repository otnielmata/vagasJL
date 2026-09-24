require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Vacancy = require('../../src/models/vacancy.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const User = require('../../src/models/user.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { registerImportedVacancy, registerAdminVacancy, assessVacancyForMatch } =
  require('../../src/services/vacancy-origin.service');

const companyId = '6512f1e2b3a1c2d3e4f5a6b7';
const authorId = '6512f1e2b3a1c2d3e4f5a6b8';
const input = {
  reference: 'qa-01', title: 'Pessoa QA', description: 'Testes web',
  matchProfile: { values: { type: 'Remoto', testAutomationTechnologies: 'Cypress Framework' } },
};

function setup(context) {
  const configuration = {
    version: 2,
    fields: Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => ({
      key, weight: INITIAL_MATCH_WEIGHTS[key], options: key === 'type'
        ? [{ id: 'remote', label: 'Remoto', aliases: ['Remote'] }]
        : key === 'testAutomationTechnologies'
          ? [{ id: 'cypress', label: 'Cypress', aliases: ['Cypress Framework'] }]
          : [],
    })),
  };
  const configQuery = { sort: async () => configuration };
  context.mock.method(Configuration, 'findOne', () => configQuery);
  context.mock.method(Vacancy, 'init', async () => Vacancy);
  const findVacancy = context.mock.method(Vacancy, 'findOne', async () => null);
  const createVacancy = context.mock.method(Vacancy, 'create', async (data) => new Vacancy(data));
  const userQuery = { select: async () => ({ _id: authorId }) };
  const findUser = context.mock.method(User, 'findOne', () => userQuery);
  return { configQuery, findVacancy, createVacancy, userQuery, findUser };
}

test('trusted import persists IMPORTED and identifiable source with shared canonical profile', async (context) => {
  const { findVacancy, createVacancy, findUser } = setup(context);
  const vacancy = await registerImportedVacancy({ source: 'Board-X', sourceId: 'external-123' }, input);
  assert.equal(vacancy.validateSync(), undefined);
  assert.equal(vacancy.origin, 'IMPORTED');
  assert.equal(vacancy.status, 'pending');
  assert.equal(vacancy.importSource, 'board-x');
  assert.equal(vacancy.importSourceId, 'external-123');
  assert.equal(vacancy.company, null);
  assert.equal(vacancy.createdBy, null);
  assert.equal(vacancy.matchProfile.configurationVersion, 2);
  assert.deepEqual(vacancy.matchProfile.values.type, ['remote']);
  assert.deepEqual(vacancy.matchProfile.values.testAutomationTechnologies, ['cypress']);
  assert.deepEqual(findVacancy.mock.calls[0].arguments[0], {
    origin: 'IMPORTED', importSource: 'board-x', importSourceId: 'external-123',
  });
  assert.equal(createVacancy.mock.callCount(), 1);
  assert.equal(findUser.mock.callCount(), 0);
});

test('import accepts only a normalized and allowlisted official application channel', async (context) => {
  const { createVacancy } = setup(context);
  const vacancy = await registerImportedVacancy({ source: 'board', sourceId: 'safe-channel' }, {
    ...input, applicationChannel: { type: 'email', value: ' Jobs@Example.org ' },
  });
  assert.deepEqual(vacancy.applicationChannel.toObject(), {
    type: 'email', value: 'jobs@example.org',
  });
  await assert.rejects(registerImportedVacancy({ source: 'board', sourceId: 'unsafe-channel' }, {
    ...input, applicationChannel: { type: 'https_url', value: 'https://evil.example.net/apply' },
  }), { statusCode: 400 });
  assert.equal(createVacancy.mock.callCount(), 1);
});

test('active admin persists ADMIN with author and the same canonical profile', async (context) => {
  const { findUser } = setup(context);
  const vacancy = await registerAdminVacancy({ id: authorId, role: 'admin' }, {
    ...input, matchProfile: { values: { type: 'remote', testAutomationTechnologies: 'Cypress' } },
  });
  assert.equal(vacancy.validateSync(), undefined);
  assert.equal(vacancy.origin, 'ADMIN');
  assert.equal(vacancy.createdBy.toString(), authorId);
  assert.equal(vacancy.company, null);
  assert.equal(vacancy.importSource, null);
  assert.deepEqual(vacancy.matchProfile.values.type, ['remote']);
  assert.deepEqual(vacancy.matchProfile.values.testAutomationTechnologies, ['cypress']);
  assert.deepEqual(findUser.mock.calls[0].arguments[0], {
    _id: authorId, role: 'admin', status: 'active',
  });
  assert.equal(vacancy.toJSON().createdBy, undefined);
});

test('initial admin classifications are audited without changing origin', async (context) => {
  setup(context);
  const vacancy = await registerAdminVacancy({ id: authorId, role: 'admin' }, {
    ...input, matchProfile: { ...input.matchProfile,
      requirements: [{ field: 'type', id: 'remote', importance: 'required' }] },
  });
  assert.equal(vacancy.origin, 'ADMIN');
  assert.equal(vacancy.requirementsRevision, 1);
  assert.equal(vacancy.requirementsHistory[0].actor.toString(), authorId);
});

test('common client input cannot forge origin or provenance in internal flows', async (context) => {
  const { createVacancy } = setup(context);
  for (const extra of [{ origin: 'COMPANY' }, { company: companyId }, { importSource: 'fake' },
    { createdBy: authorId }, { status: 'active' }]) {
    await assert.rejects(registerImportedVacancy({ source: 'board', sourceId: 'external-123' },
      { ...input, ...extra }), { statusCode: 400 });
    await assert.rejects(registerAdminVacancy({ id: authorId, role: 'admin' },
      { ...input, ...extra }), { statusCode: 400 });
  }
  assert.equal(createVacancy.mock.callCount(), 0);
});

test('invalid import provenance and non-admin identity prevent writes', async (context) => {
  const { createVacancy, findUser } = setup(context);
  for (const provenance of [null, {}, { source: 'x' }, { source: 'x', sourceId: ' ' },
    { source: 'bad/path', sourceId: '1' }]) {
    await assert.rejects(registerImportedVacancy(provenance, input), { statusCode: 400 });
  }
  await assert.rejects(registerAdminVacancy({ id: authorId, role: 'company' }, input), { statusCode: 403 });
  assert.equal(createVacancy.mock.callCount(), 0);
  assert.equal(findUser.mock.callCount(), 0);
});

test('missing or inactive admin account cannot create administrative vacancy', async (context) => {
  const { userQuery, createVacancy } = setup(context);
  userQuery.select = async () => null;
  await assert.rejects(registerAdminVacancy({ id: authorId, role: 'admin' }, input), { statusCode: 403 });
  assert.equal(createVacancy.mock.callCount(), 0);
});

test('duplicate imported source ID and index race return 409 without partial write', async (context) => {
  const { findVacancy, createVacancy } = setup(context);
  findVacancy.mock.mockImplementation(async () => ({ _id: 'existing' }));
  await assert.rejects(registerImportedVacancy({ source: 'board', sourceId: '123' }, input),
    { statusCode: 409 });
  assert.equal(createVacancy.mock.callCount(), 0);
  findVacancy.mock.mockImplementation(async () => null);
  createVacancy.mock.mockImplementation(async () => {
    throw Object.assign(new Error('duplicate'), { code: 11000 });
  });
  await assert.rejects(registerImportedVacancy({ source: 'board', sourceId: '123' }, input),
    { statusCode: 409 });
  const index = Vacancy.schema.indexes().find(([, options]) =>
    options.name === 'unique_imported_vacancy_source');
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[0], { importSource: 1, importSourceId: 1 });
});

test('bad catalog values block all origins without persistence', async (context) => {
  const { createVacancy } = setup(context);
  const invalidInput = { ...input, matchProfile: { values: { type: 'not-in-catalog' } } };
  await assert.rejects(registerImportedVacancy({ source: 'board', sourceId: '123' }, invalidInput),
    { statusCode: 400 });
  await assert.rejects(registerAdminVacancy({ id: authorId, role: 'admin' }, invalidInput),
    { statusCode: 400 });
  assert.equal(createVacancy.mock.callCount(), 0);
});

test('model requires origin and matching provenance, with immutable origin', () => {
  const base = { title: 'QA', description: 'Testes', reference: 'qa-01',
    matchProfile: { configurationVersion: 1, values: { type: ['remote'] } } };
  assert.ok(new Vacancy(base).validateSync());
  assert.ok(new Vacancy({ ...base, origin: 'IMPORTED' }).validateSync());
  assert.ok(new Vacancy({ ...base, origin: 'COMPANY', company: companyId }).validateSync());
  assert.ok(new Vacancy({ ...base, origin: 'ADMIN', createdBy: authorId, importSource: 'board' }).validateSync());
  assert.equal(new Vacancy({ ...base, origin: 'IMPORTED', importSource: 'board',
    importSourceId: '123' }).validateSync(), undefined);
  assert.equal(Vacancy.schema.path('origin').options.immutable, true);
  assert.equal(Vacancy.schema.path('origin').options.default, undefined);
});

test('legacy and untraceable vacancies are flagged, never inferred as imported', () => {
  const base = { status: 'active', matchProfile: { configurationVersion: 2,
    values: { type: ['remote'] } } };
  for (const vacancy of [base, { ...base, origin: 'IMPORTED' },
    { ...base, origin: 'OTHER', importSource: 'board', importSourceId: '123' }]) {
    assert.deepEqual(assessVacancyForMatch(vacancy), {
      needsOriginReview: true, eligible: false, technicalProfile: null,
    });
  }
});

test('equivalent technical profiles remain identical across all origins and exclude origin from Match input', () => {
  const matchProfile = { configurationVersion: 2, values: { type: ['remote'],
    testAutomationTechnologies: ['cypress'] } };
  const companyVacancy = { origin: 'COMPANY', company: companyId, createdBy: authorId,
    status: 'active', matchProfile };
  const importedVacancy = { origin: 'IMPORTED', importSource: 'board', importSourceId: '123',
    status: 'active', matchProfile };
  const adminVacancy = { origin: 'ADMIN', createdBy: authorId, status: 'active', matchProfile };
  const prepared = [companyVacancy, importedVacancy, adminVacancy].map(assessVacancyForMatch);
  assert.ok(prepared.every((result) => result.eligible && !result.needsOriginReview));
  assert.deepEqual(prepared[0].technicalProfile, prepared[1].technicalProfile);
  assert.deepEqual(prepared[1].technicalProfile, prepared[2].technicalProfile);
  assert.equal(Object.hasOwn(prepared[0].technicalProfile, 'origin'), false);
  assert.equal(assessVacancyForMatch({ ...importedVacancy, status: 'pending' }).eligible, false);
});
