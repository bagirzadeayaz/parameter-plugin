import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LocalClient } from '../plugins/kontakt-parameter/mcp/local.mjs';
import { analysisPayload } from '../plugins/kontakt-parameter/mcp/server.mjs';
import { normalizeRussianValues } from '../plugins/kontakt-parameter/mcp/bilingual.mjs';
import { submitPlatform } from '../plugins/kontakt-parameter/mcp/platform.mjs';

// Validation only: no start/save/cancel/PDF requests or product-record writes.
// The platform's normal anonymous-request budget counter still applies.
const taskId = process.argv[2];
if (!taskId) throw new Error('Pass the existing HP task ID.');
const client = new LocalClient();
const task = await client.getTask(taskId);
assert.equal(task.productName, 'HP 15-fd0230wm C68GJUA');
const draft = JSON.parse(await readFile(new URL('../test/fixtures/hp-fd0230wm-draft.json', import.meta.url), 'utf8'));
const payload = analysisPayload(draft);
const valid = await client.validateCodexResult(taskId, payload);
assert.equal(valid.valid, true);
assert.equal(valid.filled, 20);
assert.match(valid.normalizedParametersRu.Displey, /60 Гц/);
assert.match(valid.normalizedParametersRu['Girişlər'], /3\.5 мм/);
assert.match(valid.normalizedParametersRu['Operativ yaddaş'], /3200 МГц/);

// Reproduce the normalized RU payload that saveCodexResult submits.
const roundTrip = await submitPlatform(task, 'validate', { ...payload, parametersRu: valid.normalizedParametersRu, bilingualVersion: 1 });
assert.equal(roundTrip.valid, true);
assert.deepEqual(roundTrip.normalizedParametersRu, valid.normalizedParametersRu);
const bad = structuredClone(payload);
bad.parametersRu = normalizeRussianValues(payload.parametersAz, payload.parametersRu, 'notebook', { strict: true });
bad.parametersRu.Displey = bad.parametersRu.Displey.replace('60 Гц', '120 Гц');
bad.bilingualVersion = 1;
await assert.rejects(submitPlatform(task, 'validate', bad), error => {
  assert.equal(error.code, 'failed-precondition');
  assert.match(error.message, /Displey/);
  assert.notEqual(error.message, 'INTERNAL');
  return true;
});
console.log(JSON.stringify({ validation: 'passed', normalizedSavePayload: 'passed', actionableError: 'passed', filled: valid.filled, total: valid.total, productRecordWritten: false }));
