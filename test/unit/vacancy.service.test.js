require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Company = require('../../src/models/company.model');
const CompanyUser = require('../../src/models/company-user.model');
const User = require('../../src/models/user.model');
const Vacancy = require('../../src/models/vacancy.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { registerCompanyVacancy } = require('../../src/services/vacancy.service');

const companyId = '6512f1e2b3a1c2d3e4f5a6b7';
const userId = '6512f1e2b3a1c2d3e4f5a6b8';
const actor = { id: userId, role: 'company' };
const minimum = {
  reference: '  QA-2026-01  ',
  title: ' Pessoa QA ',
  description: ' Testes automatizados ',
  matchProfile: { values: { type: 'Remoto', testAutomationTechnologies: ['Cypress.io', 'cypress'] } },
};

function configuration() {
  return {
    version: 3,
    fields: Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => ({
      key, weight: INITIAL_MATCH_WEIGHTS[key], options: key === 'type'
        ? [{ id: 'remote', label: 'Remoto', aliases: ['Remote'] }]
        : key === 'testAutomationTechnologies'
          ? [{ id: 'cypress', label: 'Cypress', aliases: ['Cypress.io', 'Cypress Framework'] }]
          : [],
    })),
  };
}

function setup(context) {
  const account = { _id: userId };
  const company = { _id: companyId, status: 'active' };
  const membership = { _id: 'membership', status: 'active' };
  const accountQuery = { select: async () => account };
  const companyQuery = { select: async () => company };
  const membershipQuery = { select: async () => membership };
  const configurationQuery = { sort: async () => configuration() };
  const findUser = context.mock.method(User, 'findOne', () => accountQuery);
  const findCompany = context.mock.method(Company, 'findOne', () => companyQuery);
  const findMembership = context.mock.method(CompanyUser, 'findOne', () => membershipQuery);
  const findConfiguration = context.mock.method(Configuration, 'findOne', () => configurationQuery);
  context.mock.method(Vacancy, 'init', async () => Vacancy);
  const findVacancy = context.mock.method(Vacancy, 'findOne', async () => null);
  const createVacancy = context.mock.method(Vacancy, 'create', async (data) => new Vacancy(data));
  const createUser = context.mock.method(User, 'create', async () => assert.fail('must not create User'));
  const createCompany = context.mock.method(Company, 'create', async () => assert.fail('must not create Company'));
  return { accountQuery, companyQuery, membershipQuery, configurationQuery,
    findUser, findCompany, findMembership, findConfiguration, findVacancy,
    createVacancy, createUser, createCompany };
}

test('active linked recruiter creates pending COMPANY vacancy with canonical Match IDs', async (context) => {
  const { findUser, findCompany, findMembership, createVacancy, createUser, createCompany } = setup(context);
  const vacancy = await registerCompanyVacancy(actor, companyId, minimum);
  assert.equal(vacancy.validateSync(), undefined);
  assert.equal(vacancy.company.toString(), companyId);
  assert.equal(vacancy.createdBy.toString(), userId);
  assert.equal(vacancy.reference, 'qa-2026-01');
  assert.equal(vacancy.title, 'Pessoa QA');
  assert.equal(vacancy.description, 'Testes automatizados');
  assert.equal(vacancy.origin, 'COMPANY');
  assert.equal(vacancy.status, 'pending');
  assert.equal(vacancy.matchProfile.configurationVersion, 3);
  assert.deepEqual(vacancy.matchProfile.values.type, ['remote']);
  assert.deepEqual(vacancy.matchProfile.values.testAutomationTechnologies, ['cypress']);
  assert.equal(vacancy.toJSON().createdBy, undefined);
  assert.equal(vacancy.toJSON().deletedAt, undefined);
  assert.equal(createVacancy.mock.callCount(), 1);
  assert.equal(createUser.mock.callCount(), 0);
  assert.equal(createCompany.mock.callCount(), 0);
  assert.deepEqual(findUser.mock.calls[0].arguments[0], {
    _id: userId, role: 'company', status: 'active', emailVerifiedAt: { $type: 'date' },
  });
  assert.deepEqual(findCompany.mock.calls[0].arguments[0], {
    _id: companyId, status: 'active', deletedAt: null,
  });
  assert.deepEqual(findMembership.mock.calls[0].arguments[0], {
    company: companyId, user: userId, role: 'recruiter', status: 'active',
  });
});

test('location and numeric experience are accepted without Match score', async (context) => {
  setup(context);
  const vacancy = await registerCompanyVacancy(actor, companyId, {
    ...minimum,
    location: { city: ' São Paulo ', state: ' SP ', country: ' Brasil ' },
    matchProfile: { values: { type: ['remote'], yearsOfExperience: 2.5 } },
  });
  assert.equal(vacancy.location.city, 'São Paulo');
  assert.equal(vacancy.matchProfile.values.yearsOfExperience, 2.5);
  assert.equal(vacancy.toJSON().score, undefined);
});

test('initial company classifications start at revision one with audit', async (context) => {
  setup(context);
  const vacancy = await registerCompanyVacancy(actor, companyId, {
    ...minimum,
    matchProfile: { ...minimum.matchProfile,
      requirements: [{ field: 'type', id: 'remote', importance: 'required' }] },
  });
  assert.equal(vacancy.requirementsRevision, 1);
  assert.equal(vacancy.requirementsHistory.length, 1);
  assert.equal(vacancy.requirementsHistory[0].actor.toString(), userId);
  assert.equal(vacancy.toJSON().requirementsHistory, undefined);
});

test('origin, company, status and author cannot be supplied by client', async (context) => {
  const { findUser, createVacancy } = setup(context);
  for (const extra of [
    { origin: 'IMPORTED' }, { origin: 'COMPANY' }, { status: 'active' },
    { company: companyId }, { createdBy: userId }, { score: 100 },
  ]) {
    await assert.rejects(registerCompanyVacancy(actor, companyId, { ...minimum, ...extra }), { statusCode: 400 });
  }
  assert.equal(findUser.mock.callCount(), 0);
  assert.equal(createVacancy.mock.callCount(), 0);
});

test('non-company role, invalid company id and malformed body fail before storage', async (context) => {
  const { findUser, createVacancy } = setup(context);
  await assert.rejects(registerCompanyVacancy({ ...actor, role: 'candidate' }, companyId, minimum),
    { statusCode: 403 });
  await assert.rejects(registerCompanyVacancy(actor, 'invalid', minimum), { statusCode: 400 });
  for (const body of [null, {}, { ...minimum, title: '' }, { ...minimum, description: null },
    { ...minimum, reference: '../bad' }, { ...minimum, location: { city: 'SP' } },
    { ...minimum, matchProfile: { values: {} } },
    { ...minimum, matchProfile: { configurationVersion: 99, values: { type: 'remote' } } },
  ]) {
    await assert.rejects(registerCompanyVacancy(actor, companyId, body), { statusCode: 400 });
  }
  assert.equal(findUser.mock.callCount(), 0);
  assert.equal(createVacancy.mock.callCount(), 0);
});

test('pending, inactive, blocked and unlinked company receive 403', async (context) => {
  const { companyQuery, membershipQuery, createVacancy, findConfiguration } = setup(context);
  for (const status of ['pending', 'inactive', 'blocked']) {
    companyQuery.select = async () => null;
    await assert.rejects(registerCompanyVacancy(actor, companyId, minimum), { statusCode: 403 });
  }
  companyQuery.select = async () => ({ _id: companyId });
  membershipQuery.select = async () => null;
  await assert.rejects(registerCompanyVacancy(actor, companyId, minimum), { statusCode: 403 });
  assert.equal(findConfiguration.mock.callCount(), 0);
  assert.equal(createVacancy.mock.callCount(), 0);
});

test('inactive or unverified account receives 403 before Match catalog lookup', async (context) => {
  const { accountQuery, findConfiguration, createVacancy } = setup(context);
  accountQuery.select = async () => null;
  await assert.rejects(registerCompanyVacancy(actor, companyId, minimum), { statusCode: 403 });
  assert.equal(findConfiguration.mock.callCount(), 0);
  assert.equal(createVacancy.mock.callCount(), 0);
});

test('catalog rejects unknown IDs, unsupported fields and invalid numeric years', async (context) => {
  const { createVacancy, findVacancy } = setup(context);
  const invalidValues = [
    { type: 'not-published' }, { type: 'remote', agile: 'Scrum' },
    { type: 'remote', unknown: 'anything' }, { type: [] },
    { type: 'remote', yearsOfExperience: 101 },
    { type: 'remote', yearsOfExperience: 1.25 },
  ];
  for (const values of invalidValues) {
    await assert.rejects(registerCompanyVacancy(actor, companyId, {
      ...minimum, matchProfile: { values },
    }), { statusCode: 400 });
  }
  assert.equal(findVacancy.mock.callCount(), 0);
  assert.equal(createVacancy.mock.callCount(), 0);
});

test('missing or incomplete Match catalog blocks registration without partial write', async (context) => {
  const { configurationQuery, createVacancy } = setup(context);
  configurationQuery.sort = async () => null;
  await assert.rejects(registerCompanyVacancy(actor, companyId, minimum), { statusCode: 503 });
  configurationQuery.sort = async () => ({ version: 1, fields: [] });
  await assert.rejects(registerCompanyVacancy(actor, companyId, minimum), { statusCode: 503 });
  configurationQuery.sort = async () => ({ version: 1 });
  await assert.rejects(registerCompanyVacancy(actor, companyId, minimum), { statusCode: 503 });
  assert.equal(createVacancy.mock.callCount(), 0);
});

test('duplicate reference and concurrent unique-index race return 409', async (context) => {
  const { findVacancy, createVacancy } = setup(context);
  findVacancy.mock.mockImplementation(async () => ({ _id: 'existing' }));
  await assert.rejects(registerCompanyVacancy(actor, companyId, minimum), { statusCode: 409 });
  assert.equal(createVacancy.mock.callCount(), 0);
  findVacancy.mock.mockImplementation(async () => null);
  createVacancy.mock.mockImplementation(async () => {
    throw Object.assign(new Error('duplicate'), { code: 11000 });
  });
  await assert.rejects(registerCompanyVacancy(actor, companyId, minimum), { statusCode: 409 });
  const index = Vacancy.schema.indexes().find(([, options]) =>
    options.name === 'unique_current_company_vacancy_reference');
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[0], { company: 1, reference: 1 });
  assert.deepEqual(index[1].partialFilterExpression, { origin: 'COMPANY', deletedAt: null });
});

test('Vacancy model uses shared technical keys, origin and status enums', () => {
  assert.deepEqual(Object.keys(Vacancy.schema.path('matchProfile').schema.path('values').schema.paths),
    Object.keys(INITIAL_MATCH_WEIGHTS));
  assert.deepEqual(Vacancy.schema.path('origin').enumValues, ['IMPORTED', 'COMPANY', 'ADMIN']);
  assert.deepEqual(Vacancy.schema.path('status').enumValues,
    ['pending', 'active', 'paused', 'expired', 'removed', 'rejected']);
});
