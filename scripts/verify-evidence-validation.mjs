import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { LocalClient } from '../plugins/kontakt-parameter/mcp/local.mjs';
import { analysisPayload } from '../plugins/kontakt-parameter/mcp/server.mjs';
import { normalizeRussianValues } from '../plugins/kontakt-parameter/mcp/bilingual.mjs';
import { submitPlatform } from '../plugins/kontakt-parameter/mcp/platform.mjs';

// Read-only production validation. No start, save, cancel, or PDF requests.
const taskId = process.argv[2];
assert.ok(taskId, 'Pass an existing notebook task ID.');
const client = new LocalClient(), task = await client.getTask(taskId);
assert.equal(task.category, 'notebook');
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const before = fingerprint(task);
const draft = JSON.parse(await readFile(new URL('../test/fixtures/hp-fd0230wm-draft.json', import.meta.url)));
const payload = analysisPayload(draft);
payload.parametersRu = normalizeRussianValues(payload.parametersAz, payload.parametersRu, 'notebook', { strict: true });
payload.bilingualVersion = 1;
const result = await submitPlatform(task, 'validate', payload);
assert.equal(result.valid, true);
assert.equal(result.filled, 20);
let rejected = 0;
for (const mutate of [
  p => { delete p.fieldEvidence['Çəki']; },
  p => { p.fieldEvidence['Çəki'].quote = ''; },
  p => { p.parametersAz['Çəki'] = '9.99 kq'; p.parametersRu['Çəki'] = '9.99 кг'; },
  p => { p.parametersAz['Çəki'] = p.fieldEvidence['Çəki'].value = '9.99 kq'; p.parametersRu['Çəki'] = '9.99 кг'; },
]) {
  const bad = structuredClone(payload); mutate(bad);
  await assert.rejects(submitPlatform(task, 'validate', bad), e => e.code === 'failed-precondition' && /Çəki/.test(e.message));
  rejected++;
}
assert.equal(fingerprint(await client.getTask(taskId)), before);
console.log(JSON.stringify({ baseline: 'passed', defectiveDraftsRejected: rejected, localRecordUnchanged: true, productRecordWritten: false }));
