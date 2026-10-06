require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Company = require('../../src/models/company.model');
const User = require('../../src/models/user.model');
const { listCompanies, listRecruiters, parseQuery, PAGE_SIZE } =
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
  const state = mockList(context, Company, [{ _id: 'company', legalName: 'JL' }], 12);
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

test('directory rejects non-master actors and invalid filters before storage', async () => {
  await assert.rejects(listCompanies({ role: 'admin' }), { statusCode: 403 });
  await assert.rejects(listRecruiters({ role: 'company' }), { statusCode: 403 });
  assert.throws(() => parseQuery({ page: '0' }), { statusCode: 400 });
  assert.throws(() => parseQuery({ q: ' ' }), { statusCode: 400 });
  assert.throws(() => parseQuery({ status: 'active' }), { statusCode: 400 });
});
