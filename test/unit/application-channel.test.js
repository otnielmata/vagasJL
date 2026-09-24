require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeApplicationChannel } = require('../../src/config/application-channel');

test('normalizes only allowlisted HTTPS URLs and institutional emails', () => {
  assert.deepEqual(normalizeApplicationChannel({ type: 'https_url',
    value: ' https://jobs.example.com/vaga/123 ' }),
  { type: 'https_url', value: 'https://jobs.example.com/vaga/123' });
  assert.deepEqual(normalizeApplicationChannel({ type: 'email', value: ' Jobs@Example.org ' }),
    { type: 'email', value: 'jobs@example.org' });
});

test('rejects credentials, fragments, nested redirects, unsafe schemes and unknown keys', () => {
  for (const value of [
    'https://user:secret@jobs.example.com/vaga',
    'https://jobs.example.com/vaga#token',
    'https://jobs.example.com/vaga?next=https://evil.example',
    'javascript:alert(1)',
  ]) assert.throws(() => normalizeApplicationChannel({ type: 'https_url', value }), { statusCode: 400 });
  assert.throws(() => normalizeApplicationChannel({ type: 'https_url',
    value: 'https://jobs.example.com/vaga', extra: true }), { statusCode: 400 });
});
