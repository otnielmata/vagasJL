require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const router = require('../../src/routes/vacancy-import.routes');
const controller = require('../../src/controllers/vacancy-import.controller');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('POST /vagas/arquivo exige perfil master antes de processar o arquivo', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/vagas/arquivo').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers.at(-2), ensureDatabase);
  assert.equal(handlers.at(-1), controller.upload);

  const response = { status(code) { this.code = code; return this; }, json() {} };
  for (const role of ['candidate', 'company', 'admin']) {
    handlers[1]({ user: { role } }, response, () => assert.fail(`${role} nao pode importar`));
    assert.equal(response.code, 403);
  }
  let allowed = false;
  handlers[1]({ user: { role: 'master' } }, response, () => { allowed = true; });
  assert.equal(allowed, true);
});

test('POST /vagas/sincronizar tambem e exclusivo do perfil master', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/vagas/sincronizar' && layer.route.methods.post).route;
  const handlers = route.stack.map((layer) => layer.handle);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[1]({ user: { role: 'admin' } }, response, () => assert.fail('admin nao pode sincronizar'));
  assert.equal(response.code, 403);
  let allowed = false;
  handlers[1]({ user: { role: 'master' } }, response, () => { allowed = true; });
  assert.equal(allowed, true);
});
