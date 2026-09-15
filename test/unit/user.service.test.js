const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../../src/models/user.model');
const userService = require('../../src/services/user.service');
const ApiError = require('../../src/errors/api.error');

const validInput = { name: 'Maria Silva', email: ' MARIA@Example.COM ', password: '12345678' };

function isolateDatabase(context, existingUser = null) {
  context.mock.method(User, 'init', async () => User);
  context.mock.method(User, 'findOne', async () => existingUser);
  return context.mock.method(User, 'create', async (data) => new User(data));
}

test('creates active user, normalizes unique email and ignores caller status/id', async (context) => {
  const create = isolateDatabase(context);
  const user = await userService.createUser({ ...validInput, status: 'inactive', _id: 'untrusted' });
  assert.deepEqual(User.findOne.mock.calls[0].arguments, [{ email: 'maria@example.com' }]);
  assert.deepEqual(create.mock.calls[0].arguments, [{
    name: 'Maria Silva', email: 'maria@example.com', password: '12345678', role: 'candidate', status: 'active',
  }]);
  assert.equal(user.status, 'active');
});

test('existing email causes conflict without creating another user', async (context) => {
  const create = isolateDatabase(context, { email: 'maria@example.com' });
  await assert.rejects(userService.createUser(validInput), { statusCode: 409 });
  assert.equal(create.mock.callCount(), 0);
});

test('maps unique-index race to 409 even when lookup found no user', async (context) => {
  const create = isolateDatabase(context);
  create.mock.mockImplementation(async () => { throw Object.assign(new Error('E11000 database details'), { code: 11000 }); });
  await assert.rejects(userService.createUser(validInput), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 409);
    assert.equal(error.message, 'Ja existe um usuario cadastrado com este email');
    return true;
  });
});

test('maps model validation failures to 400', async (context) => {
  const create = isolateDatabase(context);
  create.mock.mockImplementation(async () => { throw Object.assign(new Error('validation details'), { name: 'ValidationError' }); });
  await assert.rejects(userService.createUser(validInput), { statusCode: 400, message: 'Dados invalidos' });
});

test('propagates unexpected storage failure', async (context) => {
  const create = isolateDatabase(context);
  const failure = new Error('storage unavailable');
  create.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(userService.createUser(validInput), (error) => error === failure);
});

test('does not create users if unique index initialization fails', async (context) => {
  const create = isolateDatabase(context);
  const failure = new Error('index unavailable');
  User.init.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(userService.createUser(validInput), (error) => error === failure);
  assert.equal(create.mock.callCount(), 0);
});

test('rejects administrator role before accessing storage', async (context) => {
  const create = isolateDatabase(context);
  await assert.rejects(userService.createUser({ ...validInput, role: 'admin' }), { statusCode: 400 });
  assert.equal(User.findOne.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);
});
