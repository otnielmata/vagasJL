require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Company = require('../../src/models/company.model');
const CompanyUser = require('../../src/models/company-user.model');
const Candidate = require('../../src/models/candidate.model');
const User = require('../../src/models/user.model');
const { listCompanies, listRecruiters, listCandidates, parseQuery, PAGE_SIZE, CANDIDATE_PAGE_SIZE } =
  require('../../src/services/master-directory.service');

const master = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'master' };

function mockList(context, model, items, total = items.length) {
  const state = {};
  const chain = {
    select(value) { state.projection = value; return this; },
    sort(value) { state.sort = value; return this; },
    skip(value) { state.skip = value; return this; },
    limit(value) { state.limit = value; return this; },
    async lean() { return items; },
  };
  context.mock.method(model, 'find', (filter) => { state.filter = filter; return chain; });
  context.mock.method(model, 'countDocuments', async (filter) => {
    state.countFilter = filter;
    return total;
  });
  return state;
}

test('master lists every current company with identifiers and searchable public fields', async (context) => {
  const companies = [
    { _id: '6512f1e2b3a1c2d3e4f5a6b7', legalName: 'JL' },
    { _id: '6512f1e2b3a1c2d3e4f5a6b8', legalName: 'QA' },
  ];
  const state = mockList(context, Company, companies, 12);
  const distinct = context.mock.method(CompanyUser, 'distinct', async () => [companies[0]._id]);
  const result = await listCompanies(master, { page: '2', q: 'JL (QA)+' });
  assert.equal(result.limit, PAGE_SIZE);
  assert.equal(result.pages, 2);
  assert.equal(state.skip, 10);
  assert.equal(state.limit, 10);
  assert.equal(state.filter.deletedAt, null);
  assert.equal(state.filter.$or[0].legalName.source, 'JL \\(QA\\)\\+');
  assert.equal(state.projection._id, 1);
  assert.equal(state.projection.legalName, 1);
  assert.deepEqual(state.countFilter, state.filter);
  assert.equal(result.items[0].hasRecruiter, true);
  assert.equal(result.items[1].hasRecruiter, false);
  assert.deepEqual(distinct.mock.calls[0].arguments, ['company', {
    company: { $in: companies.map((company) => company._id) },
    role: 'recruiter', status: 'active',
  }]);
});

test('empty company page does not query recruiter memberships', async (context) => {
  mockList(context, Company, [], 0);
  const distinct = context.mock.method(CompanyUser, 'distinct', async () => []);
  const result = await listCompanies(master);
  assert.deepEqual(result.items, []);
  assert.equal(distinct.mock.callCount(), 0);
});

test('master recruiter directory returns only admin profiles filtered by name or email', async (context) => {
  const state = mockList(context, User, [{ _id: 'user', name: 'Ana', role: 'admin' }]);
  const result = await listRecruiters(master, { q: 'ana@example.com' });
  assert.equal(result.total, 1);
  assert.equal(state.filter.role, 'admin');
  assert.equal(state.filter.$or[0].name.source, 'ana@example\\.com');
  assert.equal(state.filter.$or[1].email.source, 'ana@example\\.com');
  assert.equal(state.projection.name, 1);
  assert.equal(state.projection.email, 1);
  assert.equal(state.projection.password, undefined);
});

test('master candidate directory returns 15 current candidates filtered by name or email', async (context) => {
  const state = mockList(context, Candidate, [{
    _id: 'candidate', name: 'Maria', email: 'maria@example.com', phone: '11999999999', status: 'active',
  }], 31);
  const result = await listCandidates(master, { page: '2', q: 'Maria QA' });
  assert.equal(result.limit, CANDIDATE_PAGE_SIZE);
  assert.equal(result.pages, 3);
  assert.equal(state.skip, 15);
  assert.equal(state.limit, 15);
  assert.equal(state.filter.deletedAt, null);
  assert.equal(state.filter.$or[0].name.source, 'Maria QA');
  assert.equal(state.filter.$or[1].email.source, 'Maria QA');
  assert.equal(state.projection._id, 1);
  assert.equal(state.projection.phone, 1);
  assert.equal(state.projection.status, 1);
});

test('directory rejects non-master actors and invalid filters before storage', async () => {
  await assert.rejects(listCompanies({ role: 'admin' }), { statusCode: 403 });
  await assert.rejects(listRecruiters({ role: 'company' }), { statusCode: 403 });
  await assert.rejects(listCandidates({ role: 'candidate' }), { statusCode: 403 });
  assert.throws(() => parseQuery({ page: '0' }), { statusCode: 400 });
  assert.throws(() => parseQuery({ q: ' ' }), { statusCode: 400 });
  assert.throws(() => parseQuery({ status: 'active' }), { statusCode: 400 });
});
