import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analysisPayload, canonicalizeAnalysisArgs, handleMessage } from '../plugins/kontakt-parameter/mcp/server.mjs';
import { assertFieldEvidence } from '../plugins/kontakt-parameter/mcp/evidence.mjs';
import { normalizeRussianValues } from '../plugins/kontakt-parameter/mcp/bilingual.mjs';
import { LocalClient } from '../plugins/kontakt-parameter/mcp/local.mjs';
const draft = JSON.parse(await readFile(new URL('./fixtures/hp-fd0230wm-draft.json', import.meta.url)));
const payload = analysisPayload(draft);

test('complete HP evidence remains valid; missing, empty and contradictory evidence fails', () => {
  assert.doesNotThrow(() => assertFieldEvidence(payload.parametersAz, payload.fieldEvidence, payload.recoveryReport));
  for (const mutate of [
    p => { delete p.fieldEvidence['Çəki']; },
    p => { p.fieldEvidence['Çəki'].quote = ''; },
    p => { p.parametersAz['Çəki'] = '9.99 kq'; },
    p => { p.parametersAz['Çəki'] = p.fieldEvidence['Çəki'].value = '9.99 kq'; },
    p => { p.fieldEvidence['Çəki'].source_url = 'file:///private'; },
    p => { p.recoveryReport.openedSourceUrls = []; },
    p => { p.fieldEvidence['Çəki'].confidence = 'unresolved'; },
  ]) {
    const p = structuredClone(payload); mutate(p);
    assert.throws(() => assertFieldEvidence(p.parametersAz, p.fieldEvidence, p.recoveryReport), e => e.code === 'failed-precondition' && e.fieldIssues.length > 0);
  }
});
test('weight quotations accept decimal commas and equivalent grams or pounds', () => {
  for (const quote of ['Weight: 1590 g.', 'Weight: 1,59 kg.', 'Weight: 3.505 lbs.']) {
    const p = structuredClone(payload); p.fieldEvidence['Çəki'].quote = quote;
    assert.doesNotThrow(() => assertFieldEvidence(p.parametersAz, p.fieldEvidence, p.recoveryReport));
  }
});
test('source URL aliases survive primary evidence, supporting sources and official reviews', () => {
  const d = structuredClone(draft), url = 'https://manufacturer.example/specifications';
  d.sources = [{ sourceUrl: url }];
  d.field_evidence['Çəki'] = { ...d.field_evidence['Çəki'], source_url: undefined, sourceUrl: url, supporting_sources: [{ source_url: url }, { sourceUrl: url }, url] };
  d.recovery_report.conflictResolutions = [{ field: 'Çəki', outcome: 'official_priority', officialSourceReviews: [{ source_url: url }] }];
  const p = canonicalizeAnalysisArgs(d);
  assert.equal(p.sources[0].url, url);
  assert.equal(p.field_evidence['Çəki'].source_url, url);
  assert.deepEqual(p.field_evidence['Çəki'].supporting_sources.map(s => s.url), [url, url, url]);
  assert.equal(p.recovery_report.conflictResolutions[0].officialSourceReviews[0].url, url);
});
test('country translation no longer repeats an untranslated Azerbaijani value', () => {
  assert.equal(normalizeRussianValues({ 'İstehsalçı ölkə': 'Ukrayna' }, { 'İstehsalçı ölkə': 'Ukrayna' }, 'washing_machine', { strict: true })['İstehsalçı ölkə'], 'Украина');
});
test('local validation blocks bad drafts before network submission and saves audit without losing sources', async () => {
  const home = await mkdtemp(join(tmpdir(), 'kontakt-evidence-'));
  const original = process.env.CODEX_HOME; process.env.CODEX_HOME = home;
  const actions = [];
  const client = new LocalClient({ submit: async (task, action) => { actions.push(action); return { taskId: task.id, stored: true }; } });
  try {
    const { taskId } = await client.start('HP 15-fd0230wm C68GJUA', 'notebook');
    actions.length = 0;
    const bad = structuredClone(payload); delete bad.fieldEvidence['Çəki'];
    const response = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'validate_product_search_draft', arguments: { ...draft, task_id: taskId, field_evidence: bad.fieldEvidence } } }, client);
    assert.equal(response.result.isError, true);
    assert.equal(response.result.structuredContent.fieldIssues[0].field, 'Çəki');
    assert.deepEqual(actions, []);
    assert.equal((await client.getTask(taskId)).status, 'in_progress');
    const good = structuredClone(payload);
    const url = good.fieldEvidence['Çəki'].supporting_sources[0].url;
    good.fieldEvidence['Çəki'].supporting_sources[0] = { sourceUrl: url };
    await client.saveCodexResult(taskId, good);
    const saved = await client.getTask(taskId);
    assert.equal(saved.status, 'done');
    assert.equal(saved.scrapedData.recoveryReport.searchActivityVerification, 'self_reported');
    assert.deepEqual(saved.scrapedData.recoveryReport.targetedSearches, good.recoveryReport.targetedSearches);
    assert.equal(saved.scrapedData.fieldEvidence['Çəki'].quote, good.fieldEvidence['Çəki'].quote);
    assert.ok(saved.scrapedData.sources.find(s => s.url === url).supportedFields.includes('Çəki'));
    assert.equal(saved.scrapedData.evidenceValidationVersion, 1);
  } finally {
    if (original === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = original;
    await rm(home, { recursive: true, force: true });
  }
});
