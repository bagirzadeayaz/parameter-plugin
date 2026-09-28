import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeRussianValues } from '../plugins/kontakt-parameter/mcp/bilingual.mjs';
import { submitPlatform } from '../plugins/kontakt-parameter/mcp/platform.mjs';
import catalog from '../plugins/kontakt-parameter/mcp/bilingual-catalog.mjs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const draft = JSON.parse(await readFile(new URL('./fixtures/hp-fd0230wm-draft.json', import.meta.url), 'utf8'));
test('HP processor and display retain supplied Russian text after unit conversion', () => {
  const ru = normalizeRussianValues(draft.parameters_az, draft.parameters_ru, 'notebook', { strict: true });
  assert.equal(ru.Prosessor, draft.parameters_ru.Prosessor);
  assert.equal(ru.Displey, draft.parameters_ru.Displey);
});
test('numeric and boolean contradictions remain invalid', () => {
  for (const [field, value] of [['Prosessor', 'Intel Core i3-N305 (4 ядра, 1.8–3.8 ГГц, кэш 6 МБ)'], ['Sensorlu ekran', 'Нет']]) {
    assert.throws(() => normalizeRussianValues(draft.parameters_az, { ...draft.parameters_ru, [field]: value }, 'notebook', { strict: true }), { code: 'failed-precondition' });
  }
});
test('platform preserves a callable validation error code and action', async () => {
  const task = { platform: { capability: 'test-only' }, productName: 'HP test', category: 'notebook' };
  await assert.rejects(submitPlatform(task, 'validate', {}, async () => ({
    ok: false, status: 400, json: async () => ({ error: { status: 'FAILED_PRECONDITION', message: 'Invalid translated value' } }),
  })), { code: 'failed-precondition', httpStatus: 400, action: 'validate', message: 'Invalid translated value' });
});

test('all catalogue translations preserve pre-fix behavior across every category', t => {
  const original = execFileSync('git', ['show', 'ee44b999d0c7359a842e030cc74a3256bf42572c:plugins/kontakt-parameter/mcp/bilingual.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8' });
  const oldNormalize = runInNewContext(original.replace("import catalog from './bilingual-catalog.mjs';", '').replace('export function', 'function') + '\nnormalizeRussianValues;', { catalog });
  const outcome = (fn, az, ru, category) => {
    try { return JSON.stringify(fn(az, ru, category, { strict: true })); }
    catch (error) { return JSON.stringify({ code: error.code, message: error.message }); }
  };
  let checked = 0;
  for (const [category, fields] of Object.entries(catalog)) for (const [field, pairs] of Object.entries(fields)) for (const { az, ru } of pairs) {
    assert.equal(outcome(normalizeRussianValues, { [field]: az }, { [field]: ru }, category), outcome(oldNormalize, { [field]: az }, { [field]: ru }, category), `${category}: ${field}: ${az}`);
    checked++;
  }
  t.diagnostic(`${checked} catalogue pairs checked across ${Object.keys(catalog).length} categories`);
});

test('unit and missing-data guards are retained', () => {
  assert.throws(() => normalizeRussianValues({ 'Çəki': '1.59 kq' }, { 'Çəki': '1.59 см' }, 'notebook', { strict: true }), { code: 'failed-precondition' });
  assert.equal(normalizeRussianValues({ '360 dərəcə fırlanma': null }, { '360 dərəcə fırlanma': null }, 'notebook', { strict: true })['360 dərəcə fırlanma'], '—');
  assert.throws(() => normalizeRussianValues({ Prosessor: draft.parameters_az.Prosessor }, {}, 'notebook', { strict: true }), { code: 'failed-precondition' });
});
