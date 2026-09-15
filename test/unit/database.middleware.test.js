require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('continues only after the database connection is ready', async (context) => {
  let finishConnection;
  context.mock.method(mongoose, 'connect', () => new Promise((resolve) => { finishConnection = resolve; }));
  let continued = false;
  const pending = ensureDatabase({}, {}, () => { continued = true; });
  assert.equal(continued, false);
  finishConnection(mongoose);
  await pending;
  assert.equal(continued, true);
});

test('forwards connection failure without opening a real database connection', async (context) => {
  const failure = new Error('connection unavailable');
  context.mock.method(mongoose, 'connect', async () => { throw failure; });
  let forwarded;
  await ensureDatabase({}, {}, (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});
