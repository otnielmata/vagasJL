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

test('rehashes changed password before update and does not store plaintext', async (context) => {
  const oldHash = await bcrypt.hash('oldPassword123', 4);
  const user = User.hydrate({ _id: '6512f1e2b3a1c2d3e4f5a6b7', name: 'Maria', email: 'maria@example.com', password: oldHash });
  let stored;
  context.mock.method(User.collection, 'updateOne', async (filter, update) => {
    stored = update;
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  });
  user.password = 'newPassword123';
  await user.save();
  assert.notEqual(stored.$set.password, 'newPassword123');
  assert.notEqual(stored.$set.password, oldHash);
  assert.equal(await bcrypt.compare('newPassword123', stored.$set.password), true);
  assert.equal(await bcrypt.compare('oldPassword123', stored.$set.password), false);
  assert.equal(user.toJSON().password, undefined);
});

test('editing name without loading password preserves stored hash', async (context) => {
  const user = User.hydrate({ _id: '6512f1e2b3a1c2d3e4f5a6b7', name: 'Maria', email: 'maria@example.com' }, { password: 0 });
  let stored;
  context.mock.method(bcrypt, 'hash', async () => assert.fail('unchanged password must not be hashed'));
  context.mock.method(User.collection, 'updateOne', async (filter, update) => {
    stored = update;
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  });
  user.name = 'Maria Silva';
  await user.save();
  assert.equal(stored.$set.name, 'Maria Silva');
  assert.equal(stored.$set.password, undefined);
  assert.equal(stored.$unset?.password, undefined);
});
