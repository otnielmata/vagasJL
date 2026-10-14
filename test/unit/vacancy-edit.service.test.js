require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Company = require('../../src/models/company.model');
const CompanyUser = require('../../src/models/company-user.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const User = require('../../src/models/user.model');
const Vacancy = require('../../src/models/vacancy.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { getCompanyVacancy, updateCompanyVacancy } = require('../../src/services/vacancy.service');

const companyId = '6512f1e2b3a1c2d3e4f5a6b7';
const userId = '6512f1e2b3a1c2d3e4f5a6b8';
const vacancyId = '6512f1e2b3a1c2d3e4f5a6b9';
const actor = { id: userId, role: 'admin' };
const now = new Date('2026-10-13T15:00:00.000Z');

const configuration = { version: 3, fields: Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => ({
  key, weight: INITIAL_MATCH_WEIGHTS[key], options: key === 'type'
    ? [{ id: 'remote', label: 'Remoto', aliases: [] }]
    : key === 'testAutomationTechnologies'
      ? [{ id: 'playwright', label: 'Playwright', aliases: [] }]
      : [],
})) };
const input = {
  reference: 'qa-editada', title: 'QA Editada', description: 'Nova descrição',
  matchProfile: { values: { type: ['remote'], testAutomationTechnologies: ['playwright'] },
    requirements: [
      { field: 'type', id: 'remote', importance: 'required', eliminatory: true },
      { field: 'testAutomationTechnologies', id: 'playwright', importance: 'desirable' },
    ] },
};

function current(status = 'active') {
  const vacancy = new Vacancy({
    _id: vacancyId, company: companyId, createdBy: userId, origin: 'COMPANY', status,
    reference: 'qa-original', title: 'QA Original', description: 'Descrição original',
    matchProfile: { configurationVersion: 3, values: { type: ['remote'] },
      requirements: [{ field: 'type', id: 'remote', importance: 'required' }] },
    requirementsRevision: 1,
  });
  vacancy.updatedAt = new Date('2026-10-12T12:00:00.000Z');
  return vacancy;
}

function setup(context, vacancy = current()) {
  context.mock.method(User, 'findOne', () => ({ select: async () => ({ _id: userId }) }));
  context.mock.method(Company, 'findOne', () => ({ select: async () => ({ _id: companyId }) }));
  context.mock.method(CompanyUser, 'findOne', () => ({ select: async () => ({ _id: 'membership' }) }));
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => configuration }));
  const findVacancy = context.mock.method(Vacancy, 'findOne', (filter) => ({
    select: async () => Object.hasOwn(filter, '_id') && !filter._id?.$ne ? vacancy : null,
  }));
  const update = context.mock.method(Vacancy, 'findOneAndUpdate', async (_filter, operation) =>
    new Vacancy({ ...vacancy.toObject(), ...operation.$set }));
  return { findVacancy, update };
}

test('linked recruiter reads only a company vacancy from the informed company', async (context) => {
  const vacancy = current('pending');
  const { findVacancy } = setup(context, vacancy);
  const result = await getCompanyVacancy(actor, companyId, vacancyId);
  assert.equal(result.id, vacancyId);
  assert.deepEqual(findVacancy.mock.calls[0].arguments[0], {
    _id: vacancyId, company: companyId, origin: 'COMPANY', deletedAt: null,
  });
});

test('editing an active vacancy replaces canonical content and returns it to pending approval', async (context) => {
  const vacancy = current('active');
  const { update } = setup(context, vacancy);
  const result = await updateCompanyVacancy(actor, companyId, vacancyId, input, now);
  assert.equal(result.status, 'pending');
  assert.equal(result.title, 'QA Editada');
  assert.deepEqual(result.matchProfile.values.testAutomationTechnologies, ['playwright']);
  const [filter, operation] = update.mock.calls[0].arguments;
  assert.equal(filter.status, 'active');
  assert.equal(filter.updatedAt, vacancy.updatedAt);
  assert.equal(operation.$set.requirementsRevision, 2);
  assert.equal(operation.$push.requirementsHistory.reason, 'Edicao da vaga pelo recrutador');
  assert.deepEqual(operation.$push.statusHistory, {
    from: 'active', to: 'pending', at: now, actor: userId, process: 'api',
    reason: 'Conteudo alterado; nova aprovacao necessaria',
  });
});

test('editing a pending vacancy keeps pending without a false status transition', async (context) => {
  const { update } = setup(context, current('pending'));
  await updateCompanyVacancy(actor, companyId, vacancyId, input, now);
  assert.equal(update.mock.calls[0].arguments[1].$push.statusHistory, undefined);
});

test('removed or rejected vacancies cannot be edited', async (context) => {
  const vacancy = current('removed');
  const { update } = setup(context, vacancy);
  for (const status of ['removed', 'rejected']) {
    vacancy.status = status;
    await assert.rejects(updateCompanyVacancy(actor, companyId, vacancyId, input, now),
      { statusCode: 409 });
  }
  assert.equal(update.mock.callCount(), 0);
});

test('invalid identity, missing membership and another company vacancy are rejected', async (context) => {
  await assert.rejects(getCompanyVacancy({ id: userId, role: 'candidate' }, companyId, vacancyId),
    { statusCode: 403 });
  await assert.rejects(getCompanyVacancy(actor, companyId, 'invalid'), { statusCode: 400 });
  const vacancy = current();
  context.mock.method(User, 'findOne', () => ({ select: async () => ({ _id: userId }) }));
  context.mock.method(Company, 'findOne', () => ({ select: async () => ({ _id: companyId }) }));
  context.mock.method(CompanyUser, 'findOne', () => ({ select: async () => null }));
  const findVacancy = context.mock.method(Vacancy, 'findOne', () => ({ select: async () => vacancy }));
  await assert.rejects(getCompanyVacancy(actor, companyId, vacancyId), { statusCode: 403 });
  assert.equal(findVacancy.mock.callCount(), 0);
});
