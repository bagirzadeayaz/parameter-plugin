import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import Module from 'node:module';
import { analysisPayload } from '../plugins/kontakt-parameter/mcp/server.mjs';
import { normalizeRussianValues as pluginRussian } from '../plugins/kontakt-parameter/mcp/bilingual.mjs';

// Optional integration suite: explicitly select the adjacent backend checkout.
const backend = process.env.KONTAKT_TEST_BACKEND;
test('backend notebook bilingual regression', { skip: !backend }, async t => {
  const require = createRequire(import.meta.url);
  require(resolve(backend, 'src/composition.cjs'));
  const { normalizePayload } = require(resolve(backend, 'src/application/search/plugin-integration/codex-analysis.cjs'));
  const { normalizeRussianValues } = require(resolve(backend, 'src/domain/catalog/bilingual-values.cjs'));
  const { ApplicationError } = require(resolve(backend, 'src/domain/errors.cjs'));
  const { normalizeNotebookProcessorValue, normalizePortsValue, normalizeRamValue } = require(resolve(backend, 'src/application/search/parameters/normalization.cjs'));
  const { normalizeNotebookDisplay } = require(resolve(backend, 'src/domain/search/notebook-format.cjs'));
  const draft = JSON.parse(await readFile(new URL('./fixtures/hp-fd0230wm-draft.json', import.meta.url), 'utf8'));
  const payload = analysisPayload(draft);
  payload.parametersRu = pluginRussian(payload.parametersAz, payload.parametersRu, 'notebook', { strict: true });
  payload.bilingualVersion = 1;

  await t.test('original full HP evidence payload passes real normalization', () => {
    const result = normalizePayload(payload, 'notebook', { executionMode: 'interactive' }, 'HP 15-fd0230wm C68GJUA');
    assert.equal(result.summary.filled, 20);
    assert.deepEqual(result.unresolved, ['360 dərəcə fırlanma']);
    assert.equal(result.parametersRu.Prosessor, 'Intel Core i3-N305, 1.8 - 3.8 ГГц');
    assert.equal(result.parametersRu.Displey, 'IPS FullHD (1920 × 1080), 60 Гц');
    assert.match(result.parametersRu['Girişlər'], /3\.5 мм/);
  });
  await t.test('Cyrillic display units survive repeated formatting', () => {
    const value = normalizeNotebookDisplay('IPS FullHD (1920 × 1080), 60 Гц');
    assert.equal(value, 'IPS FullHD (1920 × 1080), 60 Hz');
    assert.equal(normalizeNotebookDisplay(value), value);
  });
  await t.test('Intel N-series and unknown models do not duplicate clocks', () => {
    for (const model of ['Intel Core i3-N305', 'Intel Future-X']) {
      const value = normalizeNotebookProcessorValue(`${model}, 1.8–3.8 ГГц, 6 МБ`, 'ru');
      assert.equal(value, `${model}, 1.8 - 3.8 ГГц`);
      assert.equal(normalizeNotebookProcessorValue(value, 'ru'), value);
    }
    assert.equal(normalizeNotebookProcessorValue('Intel Core i5-1235U, 1.3–4.4 GHz', 'az'), 'Intel Core i5 1235U, 1.3 - 4.4 GHz');
  });
  await t.test('Russian audio ports survive repeated formatting', () => {
    const value = normalizePortsValue('2 × USB-A, 1 × USB-C, HDMI, аудио 3.5 мм', 'ru');
    assert.equal(value, '2× USB Type-A, 1× USB Type-C, HDMI, 3.5 мм');
    assert.equal(normalizePortsValue(value, 'ru'), value);
  });
  await t.test('Russian RAM speed survives repeated formatting', () => {
    const value = normalizeRamValue('DDR4 8ГБ, 3200 МГц', 'ru');
    assert.match(value, /3200 МГц/);
    assert.equal(normalizeRamValue(value, 'ru'), value);
  });
  await t.test('bad values throw the domain error recognized by Firebase', () => {
    assert.throws(() => normalizeRussianValues({ 'Sensorlu ekran': 'Var' }, { 'Sensorlu ekran': 'Нет' }, 'notebook', { strict: true }), e => e instanceof ApplicationError && e.code === 'failed-precondition');
    const bad = structuredClone(payload);
    bad.parametersRu.Displey = bad.parametersRu.Displey.replace('60 Гц', '120 Гц');
    assert.throws(() => normalizePayload(bad, 'notebook', { executionMode: 'interactive' }, 'HP 15-fd0230wm C68GJUA'), e => e instanceof ApplicationError && e.code === 'failed-precondition');
  });

  await t.test('existing Azerbaijani catalogue parser outputs do not change', t => {
    const root = resolve(backend, '..');
    const name = 'backend/src/application/search/parameters/normalization.cjs';
    const original = execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, 'show', `5eed9301e9accca3b5ff325e6e203964a4ccc6a1:${name}`], { encoding: 'utf8' });
    const previous = new Module(resolve(root, name));
    previous.filename = resolve(root, name);
    previous.paths = Module._nodeModulePaths(resolve(backend, 'src/application/search/parameters'));
    previous._compile(original, previous.filename);
    const catalog = require(resolve(backend, 'src/domain/catalog/kontakt-bilingual-catalog.json'));
    let checked = 0;
    for (const [field, fn] of [['Prosessor', 'normalizeNotebookProcessorValue'], ['Girişlər', 'normalizePortsValue'], ['Operativ yaddaş', 'normalizeRamValue']]) {
      const current = { normalizePortsValue, normalizeNotebookProcessorValue, normalizeRamValue }[fn];
      for (const pair of catalog.notebook[field]) {
        assert.equal(current(pair.az, 'az'), previous.exports[fn](pair.az, 'az'), `${field}: ${pair.az}`);
        checked++;
      }
    }
    t.diagnostic(`${checked} existing processor/port examples unchanged`);
  });

  await t.test('anonymous validate/save lifecycle preserves evidence and rejects overwrites', async () => {
    const { createAnonymousHandler } = require(resolve(backend, 'src/application/search/plugin-integration/anonymous-plugin.cjs'));
    const docs = new Map();
    const snapshot = key => ({ exists: docs.has(key), data: () => structuredClone(docs.get(key)) });
    const db = {
      collection: name => ({ doc: id => ({ key: `${name}/${id}`, get: async () => snapshot(`${name}/${id}`) }) }),
      runTransaction: async fn => fn({
        get: async ref => snapshot(ref.key),
        set: (ref, value) => docs.set(ref.key, structuredClone(value)),
        create: (ref, value) => { assert.equal(docs.has(ref.key), false); docs.set(ref.key, structuredClone(value)); },
        update: (ref, patch) => docs.set(ref.key, { ...docs.get(ref.key), ...structuredClone(patch) }),
      }),
    };
    const handler = createAnonymousHandler({ db, normalizePayload, now: () => 1790594017444 });
    const request = { capability: 'a'.repeat(64), category: 'notebook', productName: 'HP 15-fd0230wm C68GJUA' };
    const started = await handler({ data: { ...request, action: 'start' } });
    const taskKey = `productTasks/${started.taskId}`;
    const initial = structuredClone(docs.get(taskKey));
    const validated = await handler({ data: { ...request, action: 'validate', payload } });
    assert.equal(validated.valid, true);
    assert.deepEqual(docs.get(taskKey), initial, 'validation must not save the product');
    const savePayload = { ...payload, parametersRu: validated.normalizedParametersRu };
    const saved = await handler({ data: { ...request, action: 'save', payload: savePayload } });
    assert.equal(saved.stored, true);
    const completed = structuredClone(docs.get(taskKey));
    assert.equal(completed.analysisProgress.status, 'done');
    assert.equal(completed.scrapedData.summary.filled, 20);
    assert.equal(completed.scrapedData.productImages.length, 1);
    assert.equal(completed.scrapedData.sources.length, 6);
    assert.equal(completed.canonicalSpecification.fieldEvidence['Girişlər'].sourceUrl, draft.field_evidence['Girişlər'].source_url);
    assert.equal(completed.scrapedParamsRU.Displey, 'IPS FullHD (1920 × 1080), 60 Гц');
    const retried = await handler({ data: { ...request, action: 'save', payload: savePayload } });
    assert.equal(retried.stored, true);
    assert.deepEqual(docs.get(taskKey), completed);
    const changed = structuredClone(savePayload);
    changed.parametersAz['Sensorlu ekran'] = 'Yox';
    changed.parametersRu['Sensorlu ekran'] = 'Нет';
    await assert.rejects(handler({ data: { ...request, action: 'save', payload: changed } }), { code: 'failed-precondition' });
    assert.deepEqual(docs.get(taskKey), completed);
  });
});
