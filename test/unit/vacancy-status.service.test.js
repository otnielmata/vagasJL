require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Vacancy = require('../../src/models/vacancy.model');
const Company = require('../../src/models/company.model');
const CompanyUser = require('../../src/models/company-user.model');
const User = require('../../src/models/user.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { updateStatus, expireOverdueVacancies } = require('../../src/services/vacancy-status.service');
const { assessVacancyForMatch } = require('../../src/services/vacancy-origin.service');

const vacancyId = '6512f1e2b3a1c2d3e4f5a6b7';
const companyId = '6512f1e2b3a1c2d3e4f5a6b8';
const actorId = '6512f1e2b3a1c2d3e4f5a6b9';
const now = new Date('2026-09-17T12:00:00Z');
const profile = { configurationVersion: 1, values: { type: ['remote'] },
  requirements: [{ field: 'type', id: 'remote', importance: 'required' }] };

function setup(context, overrides = {}) {
  const vacancy = { _id: vacancyId, origin: 'COMPANY', company: companyId,
    createdBy: actorId, title: 'QA', description: 'Testes', matchProfile: profile,
    status: 'pending', deletedAt: null, updatedAt: new Date('2026-09-16T00:00:00Z'),
    expiresAt: new Date('2026-09-20T00:00:00Z'), ...overrides };
  const findQuery = { select: async () => vacancy };
  context.mock.method(Vacancy, 'findById', () => findQuery);
  const update = context.mock.method(Vacancy, 'findOneAndUpdate', async (_filter, operation) =>
    ({ ...vacancy, status: operation.$set.status, toJSON() { return this; } }));
  context.mock.method(Configuration, 'findOne', async () => ({ version: 1,
    fields: Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => ({ key,
      options: key === 'type' ? [{ id: 'remote' }]
        : key === 'automation' ? [{ id: 'automation' }] : [] })) }));
  const companyQuery = { select: async () => ({ _id: companyId }) };
  context.mock.method(Company, 'findOne', () => companyQuery);
  const memberQuery = { select: async () => ({ _id: 'membership' }) };
  context.mock.method(CompanyUser, 'findOne', () => memberQuery);
  const userQuery = { select: async () => ({ _id: actorId }) };
  context.mock.method(User, 'findOne', () => userQuery);
  return { vacancy, update, companyQuery, memberQuery };
}

test('admin publishes validated pending vacancy atomically without changing technical profile or origin', async (context) => {
  const { update, vacancy } = setup(context);
  const result = await updateStatus({ id: actorId, role: 'admin' }, vacancyId,
    { status: 'active', reason: 'Revisao aprovada' }, now);
  assert.equal(result.status, 'active');
  assert.equal(result.origin, 'COMPANY');
  assert.deepEqual(result.matchProfile, profile);
  assert.deepEqual(update.mock.calls[0].arguments[0], { _id: vacancyId, status: 'pending',
    updatedAt: vacancy.updatedAt, deletedAt: null });
  assert.equal(update.mock.calls[0].arguments[1].$push.statusHistory.process, 'api');
});

test('vacancy with explicit geographic restrictions cannot activate without published weights', async (context) => {
  const { update } = setup(context, { geographicRestrictions: {
    country: { value: 'brasil', importance: 'required' },
  } });
  await assert.rejects(updateStatus({ id: actorId, role: 'admin' }, vacancyId,
    { status: 'active', reason: 'Revisao aprovada' }, now), { statusCode: 409 });
  assert.equal(update.mock.callCount(), 0);
});

test('imported vacancy can activate with classified identified field after false modality is omitted', async (context) => {
  const { update } = setup(context, { origin: 'IMPORTED', company: null, createdBy: null,
    importSource: 'board', importSourceId: 'job-1',
    matchProfile: { configurationVersion: 1, values: { automation: ['automation'] },
      requirements: [{ field: 'automation', id: 'automation', importance: 'required' }] } });
  const result = await updateStatus({ id: actorId, role: 'admin' }, vacancyId,
    { status: 'active', reason: 'Revisao da importacao' }, now);
  assert.equal(result.status, 'active');
  assert.equal(result.origin, 'IMPORTED');
  assert.equal(update.mock.callCount(), 1);
});

test('imported vacancy with only unidentified false fields cannot activate', async (context) => {
  const { update } = setup(context, { origin: 'IMPORTED', company: null, createdBy: null,
    importSource: 'board', importSourceId: 'job-2',
    matchProfile: { configurationVersion: 1, values: {}, requirements: [] } });
  await assert.rejects(updateStatus({ id: actorId, role: 'admin' }, vacancyId,
    { status: 'active', reason: 'Tentar publicar' }, now), { statusCode: 409 });
  assert.equal(update.mock.callCount(), 0);
});

test('company pauses own active vacancy and ranking excludes it', async (context) => {
  const { update } = setup(context, { status: 'active' });
  const result = await updateStatus({ id: actorId, role: 'company' }, vacancyId,
    { status: 'paused', reason: 'Selecao suspensa' }, now);
  assert.equal(result.status, 'paused');
  assert.equal(assessVacancyForMatch(result, now).eligible, false);
  assert.equal(update.mock.callCount(), 1);
});

test('company cannot publish, reject or change another origin', async (context) => {
  const { update, vacancy } = setup(context);
  await assert.rejects(updateStatus({ id: actorId, role: 'company' }, vacancyId,
    { status: 'active', reason: 'Quero publicar' }, now), { statusCode: 403 });
  vacancy.origin = 'IMPORTED';
  await assert.rejects(updateStatus({ id: actorId, role: 'company' }, vacancyId,
    { status: 'removed', reason: 'Excluir' }, now), { statusCode: 403 });
  assert.equal(update.mock.callCount(), 0);
});

test('terminal and stale transitions fail without writing', async (context) => {
  const { update } = setup(context, { status: 'removed' });
  await assert.rejects(updateStatus({ id: actorId, role: 'admin' }, vacancyId,
    { status: 'active', reason: 'Reabrir' }, now), { statusCode: 409 });
  assert.equal(update.mock.callCount(), 0);
  const { update: staleUpdate } = setup(context, { status: 'paused' });
  staleUpdate.mock.mockImplementation(async () => null);
  await assert.rejects(updateStatus({ id: actorId, role: 'admin' }, vacancyId,
    { status: 'active', reason: 'Retomar' }, now), { statusCode: 409 });
});

test('invalid identifiers and forbidden body fields fail before writes', async (context) => {
  const { update } = setup(context);
  await assert.rejects(updateStatus({ id: actorId, role: 'admin' }, 'bad',
    { status: 'active', reason: 'OK' }, now), { statusCode: 400 });
  for (const field of ['origin', 'matchProfile', 'company']) {
    await assert.rejects(updateStatus({ id: actorId, role: 'admin' }, vacancyId,
      { status: 'active', reason: 'OK', [field]: 'forged' }, now), { statusCode: 400 });
  }
  assert.equal(update.mock.callCount(), 0);
});

test('deadline blocks ranking before materialization and batch expiry records process', async (context) => {
  const { vacancy, update } = setup(context, { status: 'active',
    expiresAt: new Date('2026-09-17T11:00:00Z') });
  assert.equal(assessVacancyForMatch(vacancy, now).eligible, false);
  const query = { select: async () => [vacancy] };
  context.mock.method(Vacancy, 'find', () => query);
  assert.equal(await expireOverdueVacancies(now), 1);
  assert.equal(update.mock.calls[0].arguments[1].$set.status, 'expired');
  assert.equal(update.mock.calls[0].arguments[1].$push.statusHistory.process, 'deadline');
});

test('expired vacancy requires administrator and express revalidation before reactivation', async (context) => {
  const { vacancy, update } = setup(context, { status: 'expired',
    expiresAt: new Date('2026-09-17T11:00:00Z') });
  await assert.rejects(updateStatus({ id: actorId, role: 'company' }, vacancyId,
    { status: 'active', reason: 'Retomar' }, now), { statusCode: 403 });
  await assert.rejects(updateStatus({ id: actorId, role: 'admin' }, vacancyId,
    { status: 'active', reason: 'Revalidado' }, now), { statusCode: 409 });
  vacancy.expiresAt = new Date('2026-09-20T00:00:00Z');
  const result = await updateStatus({ id: actorId, role: 'admin' }, vacancyId,
    { status: 'active', reason: 'Prazo prorrogado e perfil revalidado' }, now);
  assert.equal(result.status, 'active');
  assert.equal(update.mock.callCount(), 1);
});

test('publication rejects vacancy without identifiable provenance or valid catalog', async (context) => {
  const { vacancy, update } = setup(context);
  vacancy.origin = null;
  await assert.rejects(updateStatus({ id: actorId, role: 'admin' }, vacancyId,
    { status: 'active', reason: 'Publicar' }, now), { statusCode: 409 });
  vacancy.origin = 'COMPANY';
  vacancy.matchProfile = { configurationVersion: 1, values: { type: ['invented'] } };
  await assert.rejects(updateStatus({ id: actorId, role: 'admin' }, vacancyId,
    { status: 'active', reason: 'Publicar' }, now), { statusCode: 409 });
  assert.equal(update.mock.callCount(), 0);
});
