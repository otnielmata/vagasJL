const assert = require('node:assert/strict');
const { test } = require('node:test');
const bcrypt = require('bcryptjs');
const User = require('../../src/models/user.model');

const validInput = { name: 'Maria', email: 'maria@example.com', password: '12345678' };

test('defaults to active and hides password when serialized', () => {
  const user = new User(validInput);
  assert.equal(user.status, 'active');
  assert.equal(user.role, 'candidate');
  assert.equal(user.toJSON().password, undefined);
  assert.equal(JSON.stringify(user).includes(validInput.password), false);
  assert.equal(User.schema.path('password').options.select, false);
});

test('requires name, email and password at the model boundary', () => {
  const failure = new User({}).validateSync();
  assert.deepEqual(Object.keys(failure.errors).sort(), ['email', 'name', 'password']);
});

test('enforces eight-character minimum and bcrypt byte limit', () => {
  assert.ok(new User({ ...validInput, password: '1234567' }).validateSync().errors.password);
  assert.equal(new User(validInput).validateSync(), undefined);
  assert.ok(new User({ ...validInput, password: 'é'.repeat(37) }).validateSync().errors.password);
});

test('declares a unique index for normalized email', () => {
  assert.ok(User.schema.indexes().some(([fields, options]) => fields.email === 1 && options.unique));
  const user = new User({ ...validInput, email: ' MARIA@EXAMPLE.COM ' });
  assert.equal(user.email, 'maria@example.com');
});

test('hashes password before persistence and compares credentials securely', async (context) => {
  let persisted;
  context.mock.method(User.collection, 'insertOne', async (document) => {
    persisted = { ...document };
    return { acknowledged: true, insertedId: document._id };
  });
  const user = new User(validInput);
  await user.save();
  assert.notEqual(persisted.password, validInput.password);
  assert.equal(await bcrypt.compare(validInput.password, persisted.password), true);
  assert.equal(await user.comparePassword(validInput.password), true);
  assert.equal(await user.comparePassword('wrong-password'), false);
  assert.equal(persisted.status, 'active');
  assert.equal(user.toJSON().password, undefined);
});
