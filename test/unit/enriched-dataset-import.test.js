require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { adaptEnrichedDataset, cleanDescription } = require('../../src/services/enriched-dataset-adapter.service');
const controller = require('../../src/controllers/vacancy-import.controller');
const service = require('../../src/services/vacancy-import-source.service');
const config = require('../../src/config/env');

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname,
  '../../vagas-jl-web/docs/perfil-match-catalogo-v2.json'), 'utf8'));
const configuration = { version: 2,
  fields: Object.entries(catalog.fields).map(([key, field]) => ({ key, ...field })) };

function raw(overrides = {}) {
  return {
    id: '4442722949', title: 'QA Engineer', company: 'ACME', location: 'Rio Grande, RS, Brasil (Hibrido)',
    url: 'https://www.linkedin.com/jobs/view/4442722949/',
    description: 'Job Summary\\n\\nWe test things\\nShow more', type: 'on-site', agile: true, programming: false,
    automation: true, webTesting: true, apiTesting: false, mobileTesting: false, desktopTesting: false,
    higherEducationDegree: false, english: true, spanish: false, yearsOfExperience: 3,
    continuousIntegration: true, certification: false,
    testAutomationTecnologies: ['robot framework', 'Cypress', 'naoexiste'], tecnologies: ['azure devops'],
    programmingLanguages: ['scala ', 'c#'], genAITools: ['github copilot', 'claude code'],
    genAITecnologies: ['github copilot', 'claude code'], level: 'Sênior', classification: 'Qualidade',
    role: 'Analista', especialization: 'Outros', isTestingRelated: true, reasonToBeRemoved: null,
    ...overrides,
  };
}

test('adapta item do JL Vagas para IDs canonicos da configuracao publicada', () => {
  const result = adaptEnrichedDataset([raw()], configuration, { allowedHosts: ['www.linkedin.com'] });
  assert.equal(result.items.length, 1);
  const { sourceId, sourceVersion, content } = result.items[0];
  assert.equal(sourceId, '4442722949');
  assert.match(sourceVersion, /^[a-f\d]{40}$/);
  assert.equal(content.reference, 'jl-4442722949');
  assert.equal(content.description, 'Job Summary\n\nWe test things');
  assert.deepEqual(content.applicationChannel, { type: 'https_url', value: 'https://www.linkedin.com/jobs/view/4442722949/' });
  const v = content.matchProfile.values;
  assert.deepEqual(v.type, [{ identified: true, id: 'onsite' }]);
  assert.deepEqual(v.agile, { identified: true, id: 'agile' });
  assert.equal(v.programming, false);
  assert.deepEqual(v.english, { identified: true, id: 'intermediate' });
  assert.deepEqual(v.yearsOfExperience, { identified: true, value: 3 });
  assert.deepEqual(v.level, [{ identified: true, id: 'senior' }]);
  assert.deepEqual(v.role, [{ identified: true, id: 'qa_analyst' }]);
  assert.deepEqual(v.classification, [{ identified: true, id: 'quality' }]);
  assert.equal(v.specialization, undefined, '"Outros" nao vira competencia');
  assert.deepEqual(v.testAutomationTechnologies.map((x) => x.id), ['cypress', 'robot_framework']);
  assert.deepEqual(v.qaTools.map((x) => x.id), ['azure_devops']);
  assert.deepEqual(v.programmingLanguages.map((x) => x.id), ['csharp', 'scala']);
  assert.deepEqual(v.genAITools.map((x) => x.id), ['claude_code', 'copilot']);
  assert.deepEqual(result.unmapped, [{ field: 'testAutomationTechnologies', value: 'naoexiste', count: 1 }]);
});

test('descarta vagas removidas pela fonte, fora de testes e IDs repetidos', () => {
  const result = adaptEnrichedDataset([
    raw({ id: '1', reasonToBeRemoved: 'No title' }),
    raw({ id: '2', isTestingRelated: false }),
    raw({ id: '3' }), raw({ id: '3' }), raw({ id: '' }),
  ], configuration);
  assert.deepEqual(result.items.map((item) => item.sourceId), ['3']);
  assert.deepEqual(result.skipped, { REMOVED_BY_SOURCE: 1, NOT_TESTING_RELATED: 1, DUPLICATE_ID: 1, MISSING_ID: 1 });
});

test('host de candidatura nao permitido vira vaga sem canal, sem recusar a vaga', () => {
  const result = adaptEnrichedDataset([raw()], configuration, { allowedHosts: ['jobs.example.com'] });
  assert.equal(result.items[0].content.applicationChannel, undefined);
  assert.ok(result.unmapped.some((entry) => entry.field === 'applicationChannel'));
});

test('mesmo conteudo gera mesma versao; conteudo alterado gera outra', () => {
  const [a] = adaptEnrichedDataset([raw()], configuration).items;
  const [b] = adaptEnrichedDataset([{ ...raw() }], configuration).items;
  const [c] = adaptEnrichedDataset([raw({ title: 'Outro titulo' })], configuration).items;
  assert.equal(a.sourceVersion, b.sourceVersion);
  assert.notEqual(a.sourceVersion, c.sourceVersion);
});

test('JSON que nao e lista e recusado', () => {
  assert.throws(() => adaptEnrichedDataset({ vagas: [] }, configuration), { statusCode: 422 });
  assert.equal(cleanDescription('a\\nb\nShow more'), 'a\nb');
});

function response() {
  return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test('POST sincronizar aceita dryRun e activatePending e recusa outros campos', async (context) => {
  const sync = context.mock.method(service, 'syncVacancyImport', async (options) => ({ dryRun: options.dryRun }));
  const res = response();
  await controller.sync({ body: { dryRun: true } }, res, () => assert.fail('erro inesperado'));
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { importacao: { dryRun: true } });
  for (const body of [{ extra: 1 }, { dryRun: 'sim' }, { dryRun: true, activatePending: true }]) {
    const bad = response();
    await controller.sync({ body }, bad, () => assert.fail('erro inesperado'));
    assert.equal(bad.code, 400);
  }
  assert.equal(sync.mock.callCount(), 1);
});

test('upload aceita JSON enviado pelo master e encaminha o dataset para importacao', async (context) => {
  const dataset = [raw()];
  const sync = context.mock.method(service, 'syncVacancyImport', async (options) => ({
    dryRun: options.dryRun,
    received: options.dataset.length,
  }));
  const publish = context.mock.method(service, 'activatePendingImported', async () => ({ activated: 1 }));
  const res = response();
  await controller.upload({
    user: { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'master' },
    body: { dryRun: 'false', activatePending: 'true' },
    file: { originalname: 'enriched-dataset.json', size: 123, buffer: Buffer.from(JSON.stringify(dataset)) },
  }, res, () => assert.fail('erro inesperado'));
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.arquivo, { nome: 'enriched-dataset.json', tamanho: 123 });
  assert.deepEqual(res.body.importacao, { dryRun: false, received: 1 });
  assert.deepEqual(res.body.publicacao, { activated: 1 });
  assert.equal(sync.mock.callCount(), 1);
  assert.equal(publish.mock.callCount(), 1);
});

test('upload recusa arquivo ausente, JSON invalido e opcoes contraditorias sem importar', async (context) => {
  const sync = context.mock.method(service, 'syncVacancyImport', async () => assert.fail('nao deve importar'));
  for (const request of [
    { body: {} },
    { body: {}, file: { originalname: 'vagas.json', size: 1, buffer: Buffer.from('{') } },
    { body: { dryRun: 'true', activatePending: 'true' },
      file: { originalname: 'vagas.json', size: 2, buffer: Buffer.from('[]') } },
  ]) {
    const res = response();
    await controller.upload(request, res, () => assert.fail('erro inesperado'));
    assert.equal(res.code, 400);
  }
  assert.equal(sync.mock.callCount(), 0);
});

test('GET sincronizar (Vercel Cron) exige CRON_SECRET no Authorization', async (context) => {
  context.mock.method(service, 'syncVacancyImport', async () => ({ ok: true }));
  const original = config.vacancyImport.cronSecret;
  try {
    config.vacancyImport.cronSecret = '';
    const missing = response();
    await controller.cron({ get: () => 'Bearer x' }, missing, () => {});
    assert.equal(missing.code, 503);
    config.vacancyImport.cronSecret = 'segredo-de-teste';
    const denied = response();
    await controller.cron({ get: () => 'Bearer errado' }, denied, () => {});
    assert.equal(denied.code, 401);
    const allowed = response();
    await controller.cron({ get: () => 'Bearer segredo-de-teste' }, allowed, () => assert.fail('erro inesperado'));
    assert.equal(allowed.code, 200);
  } finally {
    config.vacancyImport.cronSecret = original;
  }
});
