const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../../src/models/user.model');
const userService = require('../../src/services/user.service');
const userController = require('../../src/controllers/user.controller');
const ApiError = require('../../src/errors/api.error');

test('show returns 200 and public data for the requested user even when different from caller', async (context) => {
  const user = { _id: '6512f1e2b3a1c2d3e4f5a6b7', name: 'Maria Silva' };
  const lookup = context.mock.method(userService, 'getPublicUserById', async () => user);
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await userController.show({ params: { id: user._id }, user: { id: '6512f1e2b3a1c2d3e4f5a6b8' } }, response, () => assert.fail('unexpected error'));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { user });
  assert.deepEqual(Object.keys(response.body.user).sort(), ['_id', 'name']);
  assert.deepEqual(lookup.mock.calls[0].arguments, [user._id]);
});

for (const statusCode of [404, 503]) {
  test(`show forwards ${statusCode} without returning a successful response`, async (context) => {
    const failure = new ApiError(statusCode, 'Consulta indisponivel');
    context.mock.method(userService, 'getPublicUserById', async () => { throw failure; });
    let forwarded;
    await userController.show({ params: { id: 'target' } }, {
      status() { assert.fail('must not return success'); },
    }, (error) => { forwarded = error; });
    assert.equal(forwarded, failure);
  });
}

test('returns 201 and active user without password or JWT', async (context) => {
  const input = { name: 'Maria', email: 'maria@example.com', password: '12345678', status: 'inactive', _id: 'untrusted' };
  const user = new User({ name: input.name, email: input.email, password: 'sensitive-hash' });
  const create = context.mock.method(userService, 'createUser', async () => user);
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await userController.create({ body: input }, response, () => assert.fail('unexpected error'));
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.user.status, 'active');
  assert.equal(response.body.user.email, input.email);
  assert.equal(response.body.user.password, undefined);
  assert.equal(response.body.user.__v, undefined);
  assert.equal(response.body.token, undefined);
  assert.deepEqual(create.mock.calls[0].arguments, [{ name: input.name, email: input.email, password: input.password, role: undefined }]);
});

for (const status of [400, 409]) {
  test(`forwards ${status} service error without returning success`, async (context) => {
    const failure = new ApiError(status, 'Cadastro rejeitado');
    context.mock.method(userService, 'createUser', async () => { throw failure; });
    const response = { status() { assert.fail('must not return success'); } };
    let forwarded;
    await userController.create({ body: {} }, response, (error) => { forwarded = error; });
    assert.equal(forwarded, failure);
  });
}

test('update uses token identity and returns 200 without password', async (context) => {
  const user = new User({ name: 'Maria Silva', email: 'maria@example.com', password: 'sensitive-hash' });
  const update = context.mock.method(userService, 'updateUser', async () => user);
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await userController.update({ params: { id: user.id }, user: { id: user.id }, body: { name: 'Maria Silva', role: 'admin', status: 'inactive', id: 'untrusted' } }, response, () => assert.fail('unexpected error'));
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.user.password, undefined);
  assert.equal(response.body.user.name, 'Maria Silva');
  assert.equal(JSON.stringify(response.body).includes('sensitive-hash'), false);
  assert.deepEqual(update.mock.calls[0].arguments, [user.id, user.id, { name: 'Maria Silva', email: undefined, password: undefined }]);
});

for (const statusCode of [400, 403, 404, 409]) {
  test(`update forwards ${statusCode} without returning success`, async (context) => {
    const failure = new ApiError(statusCode, 'Edicao rejeitada');
    context.mock.method(userService, 'updateUser', async () => { throw failure; });
    let forwarded;
    await userController.update({ params: { id: 'target' }, user: { id: 'actor' }, body: {} }, {
      status() { assert.fail('must not return success'); },
    }, (error) => { forwarded = error; });
    assert.equal(forwarded, failure);
  });
}
