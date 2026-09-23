import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAccountWithPassword, getIdToken, readPublicConfig, redactError, saveSession } from '../mcp/auth.mjs';
import { renderAuthPage } from '../mcp/browser-auth.mjs';
import { customerProgress, decodeFields, encodeFields, shapeTask } from '../mcp/firestore.mjs';
import { IMAGE_ACCEPT_HEADER } from '../mcp/image.mjs';
import { callTool, canonicalizeAnalysisArgs, handleMessage, toolDefinitions } from '../mcp/server.mjs';

test('MCP initializes and discovers all fourteen tools', async () => {
  const init = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
  assert.equal(init.result.serverInfo.name, 'kontakt-parameter');
  const list = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map(tool => tool.name), toolDefinitions.map(tool => tool.name));
  assert.equal(list.result.tools.length, 14);
  assert.ok(list.result.tools.some(tool => tool.name === 'begin_parameter_sign_in'));
  assert.ok(list.result.tools.some(tool => tool.name === 'sign_out_parameter_account'));
  assert.ok(list.result.tools.some(tool => tool.name === 'inspect_product_image'));
  assert.ok(list.result.tools.some(tool => tool.name === 'generate_product_search_pdf'));
});

test('image retrieval only requests formats that the inspector accepts', () => {
  assert.deepEqual(IMAGE_ACCEPT_HEADER.split(','), ['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  assert.doesNotMatch(IMAGE_ACCEPT_HEADER, /avif/);
});

test('browser auth page sends credentials to Firebase and only tokens to localhost', async () => {
  const template = await readFile(new URL('../assets/auth.html', import.meta.url), 'utf8');
  const page = renderAuthPage(template, { apiKey: 'public-web-key' }, 'state-value', 'nonce-value');
  assert.match(page, /identitytoolkit\.googleapis\.com/);
  assert.match(page, /public-web-key/);
  assert.match(page, /state-value/);
  assert.match(page, /script nonce="nonce-value"/);
  const completionPayload = page.match(/body: JSON\.stringify\(\{ state: STATE,([\s\S]*?)\}\)\s*\n\s*\}\);/)?.[1];
  assert.ok(completionPayload, 'localhost completion payload is present');
  assert.doesNotMatch(completionPayload, /password/);
  assert.match(page, /Şifrəniz birbaşa Firebase Authentication-a göndərilir/);
});

test('every tool has a closed JSON object schema', () => {
  for (const tool of toolDefinitions) { assert.equal(tool.inputSchema.type, 'object'); assert.equal(tool.inputSchema.additionalProperties, false); }
});

test('explicit search requests start and save without duplicate confirmations', async () => {
  const skill = await readFile(new URL('../skills/product-search/SKILL.md', import.meta.url), 'utf8');
  const start = toolDefinitions.find(tool => tool.name === 'start_product_search');
  const save = toolDefinitions.find(tool => tool.name === 'save_product_search_result');
  const rerun = toolDefinitions.find(tool => tool.name === 'rerun_product_search');
  const cancel = toolDefinitions.find(tool => tool.name === 'cancel_product_search');
  assert.match(start.description, /do not ask for another confirmation/i);
  assert.match(save.description, /do not ask for another confirmation/i);
  assert.doesNotMatch(start.description, /requires (user )?approval/i);
  assert.doesNotMatch(save.description, /requires (user )?approval/i);
  assert.match(rerun.description, /requires user approval/i);
  assert.match(cancel.description, /requires user approval/i);
  assert.match(skill, /run both without asking for a second confirmation/i);
  assert.match(skill, /call `save_product_search_result` once without another confirmation/i);
  assert.doesNotMatch(skill, /ask for approval to save/i);
});

test('successful searches always return and require the complete result table', async () => {
  const skill = await readFile(new URL('../skills/product-search/SKILL.md', import.meta.url), 'utf8');
  const task = { id: 't1', productName: 'Model X', category: 'phone', analysisProgress: { status: 'done', pct: 100 }, scrapedParams: { Brend: 'Example', Çəki: '190 qr' }, scrapedParamsRU: {}, scrapedData: { summary: { count: 46 }, productImages: [{ imageUrl: 'https://official.example/model.jpg', sourceUrl: 'https://official.example/model', exactModelMatch: true }], sources: [{ url: 'https://official.example/model', supportedFieldCount: 2, requiredFieldCount: 46 }], results: [{ url: 'https://official.example/model', parameters: { Brend: 'Example', Çəki: '190 qr' } }] } };
  const client = {
    saveCodexResult: async () => ({ taskId: 't1', status: 'done' }),
    authorizedTask: async () => task,
    generateProductPdf: async () => ({ generated: true, path: 'C:\\Reports\\model-x.pdf', fileUri: 'file:///C:/Reports/model-x.pdf', fileName: 'model-x.pdf', mimeType: 'application/pdf', bytes: 2048, template: 'kontakt-product-report-v1' }),
  };
  const response = (await callTool('save_product_search_result', { task_id: 't1', parameters_az: {}, sources: [], product_images: [{ image_url: 'https://official.example/model.jpg', source_url: 'https://official.example/model', exact_model_match: true }], recovery_report: {} }, client)).structuredContent;
  assert.equal(response.presentationRequired, true);
  assert.equal(response.presentationFormat, 'complete_parameter_table_with_pdf');
  assert.equal(response.pdfRequired, true);
  assert.equal(response.pdfReport.generated, true);
  assert.equal(response.pdfReport.template, 'kontakt-product-report-v1');
  assert.deepEqual(response.result.displayParams, { Brend: 'Example', Çəki: '190 qr' });
  assert.equal(response.result.scrapedData.productImages.length, 1);
  assert.equal(response.result.scrapedData.sourceCoverage[0].supportedFieldCount, 2);
  assert.equal(response.result.scrapedData.sourceCoverage[0].requiredFieldCount, 46);
  assert.match(skill, /always render the complete saved parameter table/i);
  assert.match(skill, /do not ask whether the customer wants the table or PDF/i);
  assert.match(skill, /source-coverage table is mandatory/i);
  assert.match(skill, /copy every value cell verbatim from `displayParams` or `displayParamsRU`/i);
  assert.match(skill, /render `Yox` exactly as `Yox`, never `Yox — Wi-Fi versiyası`/i);
  const save = toolDefinitions.find(tool => tool.name === 'save_product_search_result');
  assert.ok(save.inputSchema.required.includes('product_images'));
  assert.equal(save.inputSchema.properties.product_images.minItems, 1);
  assert.match(save.description, /automatically generate the standard image-and-parameters PDF/i);
  assert.match(skill, /generated Kontakt PDF link/i);
});

test('product search skill supports implicit activation for bare product models', async () => {
  const skill = await readFile(new URL('../skills/product-search/SKILL.md', import.meta.url), 'utf8');
  const metadata = await readFile(new URL('../skills/product-search/agents/openai.yaml', import.meta.url), 'utf8');
  assert.match(skill, /description:.*bare product name or model/i);
  assert.match(skill, /phone, tablet, notebook, refrigerator, or washing machine/i);
  assert.match(metadata, /allow_implicit_invocation:\s*true/i);
});

test('product image presentation rejects broken or session-dependent images', async () => {
  const skill = await readFile(new URL('../skills/product-search/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /broken-image placeholder.*not an acceptable product image/is);
  assert.match(skill, /stable public direct HTTPS image URL/i);
  assert.match(skill, /loads without authentication, cookies, request headers, expiring signatures, or a referring page/i);
  assert.match(skill, /replace a failed image with another inspected exact-product image/i);
});

test('every schema field exposes an explicit Kontakt normalization contract', async () => {
  const expectedCounts = { phone: 46, tablet: 45, notebook: 21, fridge: 29, washing_machine: 32 };
  for (const [category, count] of Object.entries(expectedCounts)) {
    const result = (await callTool('get_product_schema', { category })).structuredContent;
    assert.equal(result.fieldCount, count);
    assert.equal(result.allFieldsHaveNormalizationRules, true);
    for (const field of result.fields) {
      assert.ok(field.normalization?.format, `${category}:${field.key} format`);
      assert.ok(field.normalization?.example, `${category}:${field.key} example`);
      assert.equal(field.normalization?.unresolvedValue, '—');
    }
  }
});

test('Firestore values round-trip without an SDK', () => {
  const source = { name: 'Model X', count: 4, ratio: 2.5, yes: true, none: null, list: ['a', 2], nested: { status: 'done' } };
  assert.deepEqual(decodeFields(encodeFields(source)), source);
});

test('result and evidence views filter requested fields', () => {
  const task = { id: 't1', productName: 'Exact Model', category: 'phone', analysisProgress: { status: 'done', pct: 100 }, scrapedParams: { Display: 'OLED', Weight: '190 g' }, confidence: { Display: { level: 'high' }, Weight: { level: 'medium' } }, scrapedData: { results: [{ url: 'https://official.example/specs', sourceType: 'official', parameters: { Display: 'OLED', Weight: '190 g' }, fieldEvidence: { Display: 'OLED display', Weight: '190 g' } }] } };
  const result = shapeTask(task, 'all', ['Display']);
  assert.deepEqual(result.normalizedParameters, { Display: 'OLED' });
  assert.deepEqual(result.confidence, { Display: { level: 'high' } });
  assert.deepEqual(result.evidence[0].parameters, { Display: 'OLED' });
});

test('app view preserves the application result contract', () => {
  const task = { id: 't1', productName: 'Exact Model', category: 'tablet', status: 'in_progress', analysisProgress: { status: 'done', pct: 100, stage: 'internal validator metadata recovery' }, scrapedParams: { Display: 'OLED' }, scrapedParamsRU: { Display: 'OLED' }, finalParams: {}, brandManagerParams: {}, canonicalSpecification: { model: 'Exact Model' }, confidence: { Display: { verificationStatus: 'verified' } }, scrapedData: { summary: { count: 1, filled: 1 }, diagnostics: { acceptedSources: 1 }, sources: [{ url: 'https://official.example', sourceType: 'official' }], results: [] } };
  const result = shapeTask(task, 'app');
  assert.equal(result.id, 't1'); assert.deepEqual(result.scrapedParams, { Display: 'OLED' });
  assert.deepEqual(result.scrapedParamsRU, { Display: 'OLED' }); assert.equal(result.analysisProgress.status, 'done');
  assert.equal(result.analysisProgress.stage, undefined);
  assert.equal(result.analysisProgress.message, 'Məhsul məlumatları hazırdır.');
  assert.deepEqual(result.displayParams, { Display: 'OLED' });
  assert.equal(result.scrapedData.diagnostics.acceptedSources, 1);
});

test('customer progress hides internal stages and supplies indicative timing', () => {
  const now = 2_000_000_000_000;
  const progress = customerProgress({ status: 'running', pct: 60, startedAt: now - 180_000, stage: 'LLM validator evidence recovery 5/8' }, now);
  assert.equal(progress.pct, 60);
  assert.equal(progress.elapsedSeconds, 180);
  assert.ok(progress.estimatedRemainingSeconds > 0);
  assert.equal(progress.estimateIsIndicative, true);
  assert.equal(progress.stage, undefined);
  assert.doesNotMatch(JSON.stringify(progress), /LLM|validator|evidence recovery/i);
});

test('tool dispatch covers schema, start, rerun, save, PDF, list, get, wait and cancel', async () => {
  const task = { id: 't1', productName: 'Model X', category: 'phone', assignedTo: 'u1', analysisProgress: { status: 'done' } };
  const client = { start: async () => ({ taskId: 't1', provider: 'codex_native' }), rerun: async () => ({ taskId: 't1', provider: 'codex_native' }), validateCodexResult: async () => ({ taskId: 't1', valid: true }), saveCodexResult: async () => ({ taskId: 't1', status: 'done' }), generateProductPdf: async () => ({ generated: true, path: 'C:\\Reports\\model-x.pdf', fileUri: 'file:///C:/Reports/model-x.pdf', fileName: 'model-x.pdf', mimeType: 'application/pdf', bytes: 2048, template: 'kontakt-product-report-v1' }), list: async () => [task], authorizedTask: async () => task, wait: async () => ({ taskId: 't1', status: 'done' }), callable: async () => ({ success: true, cancelled: true }) };
  assert.equal((await callTool('get_product_schema', { category: 'phone' }, client)).structuredContent.fieldCount, 46);
  assert.equal((await callTool('start_product_search', { product_name: 'Model X', category: 'phone' }, client)).structuredContent.taskId, 't1');
  assert.equal((await callTool('rerun_product_search', { task_id: 't1' }, client)).structuredContent.provider, 'codex_native');
  assert.equal((await callTool('validate_product_search_draft', { task_id: 't1', parameters_az: {}, sources: [], recovery_report: { initialSearchCompleted: true } }, client)).structuredContent.valid, true);
  const saved = (await callTool('save_product_search_result', { task_id: 't1', parameters_az: {}, sources: [], recovery_report: { initialSearchCompleted: true, sourceExpansionCompleted: true, deepRecoveryCompleted: true, conflictResolutionCompleted: true, targetedSearches: [], remainingFields: [], stoppedBecause: 'Complete' } }, client)).structuredContent;
  assert.equal(saved.status, 'done');
  assert.equal(saved.presentationRequired, true);
  assert.equal(saved.pdfReport.generated, true);
  assert.equal(saved.result.id, 't1');
  assert.equal((await callTool('generate_product_search_pdf', { task_id: 't1' }, client)).structuredContent.pdfReport.generated, true);
  assert.equal((await callTool('list_product_searches', {}, client)).structuredContent.searches.length, 1);
  assert.equal((await callTool('get_product_search', { task_id: 't1' }, client)).structuredContent.status, 'done');
  assert.equal((await callTool('wait_product_search', { task_id: 't1' }, client)).structuredContent.status, 'done');
  assert.equal((await callTool('cancel_product_search', { task_id: 't1' }, client)).structuredContent.cancelled, true);
});

test('errors serialize safely and redact secrets', async () => {
  const client = { authorizedTask: async () => { const error = new Error('password=secret refresh_token=abc'); error.code = 'unauthenticated'; throw error; } };
  const response = await handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_product_search', arguments: { task_id: 'x' } } }, client);
  assert.equal(response.result.isError, true); assert.doesNotMatch(response.result.content[0].text, /secret|abc/); assert.match(response.result.content[0].text, /redacted/);
  assert.doesNotMatch(redactError(new Error('api_key=topsecret')), /topsecret/);
});

test('common draft metadata aliases are canonicalized before validation', () => {
  const canonical = canonicalizeAnalysisArgs({
    field_evidence: { Rəng: { supporting_sources: ['https://official.example/model'] } },
    recovery_report: {
      stoppedBecause: 'Sources disagree.',
      imageAnalysis: { observations: [{ image_url: 'https://official.example/model.png', source_url: 'https://official.example/model', exact_product_verified: true, usable: true, fields_visibly_shown: ['Rəng'], observation: 'The product is black.' }] },
      targetedSearches: [{ queries: ['battery capacity exact model', 'exact model teardown battery'], fields: ['Akkumulyatorun tutumu'], foundFields: [] }],
      conflictingFields: ['Akkumulyatorun tutumu'],
      officialSourceReviews: [{ field: 'Akkumulyatorun tutumu', url: 'https://official.example/model', exactVariantMatch: true, applicable: true, value: null, statement: 'The official page does not publish mAh.' }],
      conflictResolutions: [{ field: 'Akkumulyatorun tutumu', resolution: 'unresolved' }],
    },
  });
  assert.equal(canonical.recovery_report.imageAnalysis.observations[0].exact_product_page_verified, true);
  assert.deepEqual(canonical.recovery_report.imageAnalysis.observations[0].visible_fields, ['Rəng']);
  assert.deepEqual(canonical.recovery_report.targetedSearches.map(search => search.query), ['battery capacity exact model', 'exact model teardown battery']);
  assert.equal(canonical.recovery_report.conflictResolutions[0].outcome, 'unresolved');
  assert.equal(canonical.recovery_report.conflictResolutions[0].officialSourceReviews[0].quote, 'The official page does not publish mAh.');
  assert.deepEqual(canonical.field_evidence.Rəng.supporting_sources, [{ url: 'https://official.example/model' }]);
});

test('validation failures explicitly require correction and retry', async () => {
  const error = Object.assign(new Error('visible_fields is required'), { code: 'failed-precondition' });
  const client = { validateCodexResult: async () => { throw error; } };
  const response = await handleMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'validate_product_search_draft', arguments: { task_id: 't1' } } }, client);
  const body = JSON.parse(response.result.content[0].text);
  assert.equal(response.result.isError, true);
  assert.equal(body.recoverable, true);
  assert.equal(body.mustRetry, true);
  assert.equal(body.terminal, false);
  assert.equal(body.userVisible, false);
  assert.equal(body.workflowState, 'continue_required');
  assert.equal(body.retryTool, 'validate_product_search_draft');
  assert.ok(body.nextActions.some(action => /same turn/i.test(action)));
  assert.match(body.instruction, /do not end the turn/i);
});

test('session storage contains refresh token but never a password', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kontakt-plugin-')); const path = join(dir, 'session.json');
  await saveSession({ refreshToken: 'refresh-only', uid: 'u1', email: 'u@example.com', projectId: 'p1', region: 'us-central1', apiKey: 'public-web-key', password: 'must-not-save' }, path);
  const stored = await readFile(path, 'utf8'); assert.match(stored, /refresh-only/); assert.doesNotMatch(stored, /must-not-save|password/);
});

test('expired token refresh uses Firebase Secure Token API', async () => {
  let requested = '';
  const fetchImpl = async (url, options) => { requested = `${url} ${options.body}`; return { ok: true, json: async () => ({ id_token: 'new-id-token', user_id: 'different-user', expires_in: '3600' }) }; };
  assert.equal(await getIdToken({ apiKey: 'public', refreshToken: 'refresh', uid: 'expired-user' }, fetchImpl), 'new-id-token');
  assert.match(requested, /securetoken\.googleapis\.com/); assert.match(requested, /refresh_token=refresh/);
});

test('account registration uses Firebase sign-up and bundled public configuration', async () => {
  let request;
  const fetchImpl = async (url, options) => { request = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ localId: 'u1', email: 'employee@example.com', refreshToken: 'refresh', idToken: 'id' }) }; };
  const created = await createAccountWithPassword({ apiKey: 'public-key' }, 'employee@example.com', 'password1', fetchImpl);
  assert.equal(created.localId, 'u1'); assert.match(request.url, /accounts:signUp/); assert.equal(request.body.returnSecureToken, true);
  const config = await readPublicConfig(join(import.meta.dirname, '..'));
  assert.equal(config.projectId, 'kontakt-parameter'); assert.ok(config.apiKey);
});

test('pending users and cross-owner tasks are rejected', async () => {
  const { FirebaseClient } = await import('../mcp/firebase.mjs');
  const pending = new FirebaseClient({ sessionLoader: async () => ({ uid: 'u1' }) });
  pending.context = async () => ({ session: { uid: 'u1' } });
  pending.getDocument = async () => ({ id: 'u1', role: 'pending' });
  await assert.rejects(() => pending.getUser(), /pending approval/);

  const owned = new FirebaseClient({ sessionLoader: async () => ({ uid: 'u1' }) });
  owned.context = async () => ({ session: { uid: 'u1' } });
  owned.getUser = async () => ({ role: 'user' });
  owned.getDocument = async () => ({ id: 't1', assignedTo: 'u2' });
  await assert.rejects(() => owned.authorizedTask('t1'), /cannot access/);
  owned.getUser = async () => ({ role: 'super_admin' });
  assert.equal((await owned.authorizedTask('t1')).id, 't1');
});

test('wait returns on progress and recognizes cancelled as terminal', async () => {
  const { FirebaseClient } = await import('../mcp/firebase.mjs');
  const client = new FirebaseClient({ sleep: async () => {} });
  client.authorizedTask = async () => ({ id: 't1', productName: 'Model', category: 'fridge', analysisProgress: { status: 'cancelled', lastHeartbeat: 5 } });
  const value = await client.wait('t1', 5, 1);
  assert.equal(value.status, 'cancelled');
  assert.equal(value.timedOut, undefined);
});

test('task commit uses Firestore document resource paths, never web URLs', async () => {
  const { FirebaseClient } = await import('../mcp/firebase.mjs');
  const client = new FirebaseClient(); let commit;
  client.getUser = async () => ({ role: 'user', displayName: 'Employee' });
  client.context = async () => ({
    session: { uid: 'u1', email: 'employee@example.com' },
    root: 'https://firestore.googleapis.com/v1/projects/kontakt-parameter/databases/(default)/documents',
    documentRoot: 'projects/kontakt-parameter/databases/(default)/documents',
  });
  client.request = async (url, options) => { commit = { url, body: JSON.parse(options.body) }; return {}; };
  await client.commitNewTask('iPhone 18 Pro Max 512GB White', 'phone');
  assert.match(commit.url, /^https:\/\/firestore\.googleapis\.com\/v1\/projects\/kontakt-parameter\/databases\/\(default\)\/documents:commit$/);
  for (const write of commit.body.writes) {
    assert.match(write.update.name, /^projects\/kontakt-parameter\/databases\/\(default\)\/documents\//);
    assert.doesNotMatch(write.update.name, /^https?:\/\//);
  }
});

test('plugin starts Codex-native analysis without calling paid search providers', async () => {
  const { FirebaseClient } = await import('../mcp/firebase.mjs');
  const client = new FirebaseClient(); const calls = [];
  client.commitNewTask = async () => ({ taskId: 't1' });
  client.callable = async (name, data) => { calls.push({ name, data }); return { provider: 'codex_native', status: 'running' }; };
  const result = await client.start('Exact Model 123', 'fridge');
  assert.deepEqual(calls.map(call => call.name), ['beginCodexProductAnalysis']);
  assert.deepEqual(calls[0].data, { taskId: 't1', executionMode: 'interactive' });
  assert.equal(result.provider, 'codex_native');
  assert.equal(result.requiredResearchTool, 'codex_builtin_web_search');
  assert.match(result.instructions, /actual hosted Codex native web_search/);
  assert.equal(result.normalizationTemplate, 'kontakt.az');
  assert.equal(result.regionalTarget, 'azerbaijan_market');
  assert.equal(result.adaptiveResearch, true);
  assert.deepEqual(result.workflowContract.transaction, ['start', 'research', 'recover', 'validate', 'save', 'generate_pdf', 'render']);
  assert.equal(result.workflowContract.validationFailureIsTerminal, false);
  assert.equal(result.workflowContract.terminalCondition, 'saved_with_pdf_and_fully_rendered');
  assert.equal(result.workflowContract.customerCommunication.hideInternalStages, true);
  assert.deepEqual(result.workflowContract.customerCommunication.progressFields, ['productName', 'indicativePercent', 'elapsedTime', 'approximateTimeRemaining']);
  assert.match(result.workflowContract.validationFailureAction, /same turn/i);
  assert.equal(result.requiredSearchStages, undefined);
  assert.match(result.instructions, /fixed search modes, fixed query counts/);
  assert.match(result.instructions, /only website exclusion is Azerbaijani retailer websites/);
  assert.match(result.instructions, /Prefer official exact-product manufacturer pages/);
  assert.match(result.instructions, /For every missing field, perform at least two dedicated Web Search queries/);
  assert.match(result.instructions, /commercial bottle\/display cooler/i);
  assert.match(result.instructions, /Azerbaijan-market applicability/i);
  assert.match(result.instructions, /evidenced value must not silently become a blank/i);
  assert.match(result.instructions, /stage image_view_recovery/);
  assert.match(result.instructions, /Do not announce that the draft is ready/);
  assert.match(result.instructions, /three independent sources are the minimum evidence for a claimed majority/);
  assert.equal(result.schema.fieldCount, 29);
});

test('skill requires interactive choices for invalid product variants', async () => {
  const skill = await readFile(new URL('../skills/product-search/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /request_user_input/);
  assert.match(skill, /request_user_input_async/);
  assert.match(skill, /complete valid alternatives/);
  assert.match(skill, /Never silently substitute a related product/);
  assert.match(skill, /Keep the turn active while the choice is pending/);
  assert.match(skill, /do not send a final answer that dismisses the choice card/);
  assert.match(skill, /Do not use `:codex-followup` for this selection/);
  assert.match(skill, /Do not start or save a search until the customer selects an option/);
  assert.match(skill, /Xiaomi 17T Pro 12\/256 GB Deep Blue/);
});

test('skill makes validation recovery independent of chat history', async () => {
  const skill = await readFile(new URL('../skills/product-search/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /does not depend on earlier conversation context/i);
  assert.match(skill, /validation error is a loop instruction/i);
  assert.match(skill, /only successful terminal state is a saved result/i);
});

test('skill keeps progress customer-facing and hides internal work', async () => {
  const skill = await readFile(new URL('../skills/product-search/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /non-technical customer/i);
  assert.match(skill, /Never narrate chain-of-thought, LLM activity/i);
  assert.match(skill, /indicative completion percentage/i);
  assert.match(skill, /elapsed time, and approximate time remaining/i);
  assert.match(skill, /Do not send an update for every tool call or Web Search/i);
  assert.match(skill, /final response is customer data, not an execution report/i);
});

test('skill keeps citations and physical-SIM prose out of value cells', async () => {
  const skill = await readFile(new URL('../skills/product-search/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /`SIM-kart sayı` is `1` or `2`, never `1 fiziki SIM`/);
  assert.match(skill, /never `Yox¹`/);
  assert.match(skill, /never citations, footnote numbers, links, or evidence markers/);
});

test('phone schema and skill enforce compact Kontakt video and network values', async () => {
  const schema = (await callTool('get_product_schema', { category: 'phone' })).structuredContent;
  const byKey = Object.fromEntries(schema.fields.map(field => [field.key, field.normalization]));
  assert.equal(byKey['Video formatı'].example, '4K');
  assert.equal(byKey['Video icazəsi və kadr tezliyi'].example, '4K, 24-240 kadr/s');
  assert.equal(byKey['Şəbəkə standartı'].example, '5G');
  assert.equal(byKey.Ekran.example, '6.7" / 3.4"');
  assert.match(byKey.Ekran.format, /main\/internal.*cover\/external/i);
  const skill = await readFile(new URL('../skills/product-search/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /`Video formatı` is the single highest quality such as `4K`/);
  assert.match(skill, /`Şəbəkə standartı` is the highest generation such as `5G`/);
  assert.match(skill, /main\/internal first, cover\/external second/i);
});

test('skill and save schema use adaptive recovery for missing and conflicting fields', async () => {
  const save = toolDefinitions.find(tool => tool.name === 'save_product_search_result');
  const recoveryProperties = save.inputSchema.properties.recovery_report.properties;
  assert.equal(recoveryProperties.nativeWebSearchUsed.const, true);
  assert.equal(recoveryProperties.nativeWebSearchEventCount.minimum, 1);
  assert.equal(recoveryProperties.sourcePagesOpened.const, true);
  assert.equal(recoveryProperties.openedSourceUrls.type, 'array');
  assert.equal(recoveryProperties.imageAnalysis.type, 'object');
  assert.ok(recoveryProperties.imageAnalysis.required.includes('inspectedImageUrls'));
  assert.ok(recoveryProperties.imageAnalysis.required.includes('observations'));
  assert.ok(recoveryProperties.imageAnalysis.required.includes('unavailableReasons'));
  assert.equal(recoveryProperties.imageAnalysis.properties.imageAnalysisEventCount.minimum, 1);
  assert.ok(recoveryProperties.imageAnalysis.properties.observations.items.required.includes('observation'));
  assert.equal(recoveryProperties.targetedSearches.items.properties.stage.enum, undefined);
  assert.equal(recoveryProperties.conflictingFields.type, 'array');
  assert.ok(recoveryProperties.conflictResolutions.items.properties.outcome.enum.includes('independent_majority'));
  assert.equal(recoveryProperties.conflictResolutions.items.properties.officialSourceReviews.type, 'array');
  const skill = await readFile(new URL('../skills/product-search/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /Do not impose fixed modes, a fixed stage sequence, a search budget/);
  assert.match(skill, /Apply exactly one website exclusion/);
  assert.match(skill, /For every missing field, continue researching naturally/);
  assert.match(skill, /at least two dedicated Web Search queries for each still-missing field/);
  assert.match(skill, /A broad query cannot count as dedicated recovery/);
  assert.match(skill, /Open each image URL and inspect its actual pixels/);
  assert.match(skill, /A claimed majority requires at least three independent evidence URLs/);
  assert.match(skill, /reopen every already-discovered applicable official page/i);
  assert.match(skill, /base model must never overrule/i);
  assert.match(skill, /Open and read every page used/);
  assert.match(skill, /validate_product_search_draft/);
  assert.match(skill, /total net\/usable capacity/);
  assert.match(skill, /gross\/nominal total capacity/);
});

test('refrigerator schema distinguishes usable and gross capacity semantics', async () => {
  const fridge = (await callTool('get_product_schema', { category: 'fridge' })).structuredContent;
  const byKey = Object.fromEntries(fridge.fields.map(field => [field.key, field.normalization]));
  assert.match(byKey['Toplam faydalı həcm'].meaning, /net\/usable/i);
  assert.match(byKey['Toplam həcm'].meaning, /gross\/nominal/i);
  assert.match(byKey['Növ'].example, /Butulka soyuducusu/);
  assert.match(byKey['İqlim sinfi'].meaning, /not interchangeable/i);
});

test('every category schema identifies direct-photo and label-only image fields', async () => {
  const fridge = (await callTool('get_product_schema', { category: 'fridge' })).structuredContent;
  assert.equal(fridge.imageAnalysis.enabled, true);
  assert.equal(fridge.imageAnalysis.scope, 'all_supported_categories');
  assert.equal(fridge.imageAnalysis.directProductPhotoFields.length, 12);
  assert.ok(fridge.imageAnalysis.directProductPhotoFields.includes('Rəng'));
  assert.ok(fridge.imageAnalysis.directProductPhotoFields.includes('Buz generatoru'));
  assert.ok(fridge.imageAnalysis.labelOnlyFields.includes('Kompressor tipi'));
  assert.ok(fridge.imageAnalysis.labelOnlyFields.includes('Səs səviyyəsi'));
  const byKey = Object.fromEntries(fridge.fields.map(field => [field.key, field.imageAnalysis]));
  assert.equal(byKey.Rəng.mode, 'direct_product_photo');
  assert.equal(byKey['Kompressor tipi'].mode, 'readable_exact_model_label_only');
  const phone = (await callTool('get_product_schema', { category: 'phone' })).structuredContent;
  assert.equal(phone.imageAnalysis.enabled, true);
  assert.ok(phone.imageAnalysis.directProductPhotoFields.includes('Rəng'));
  assert.equal(phone.fields.find(field => field.key === 'Akkumulyatorun tutumu').imageAnalysis.mode, 'readable_exact_model_label_only');
});

test('save schema carries structured refrigerator image evidence', () => {
  const save = toolDefinitions.find(tool => tool.name === 'save_product_search_result');
  const evidence = save.inputSchema.properties.field_evidence.additionalProperties.properties;
  assert.ok(evidence.evidence_kind.enum.includes('product_photo'));
  assert.ok(evidence.evidence_kind.enum.includes('label_photo'));
  assert.equal(evidence.image_url.format, 'uri');
  assert.equal(evidence.visual_confidence.maximum, 1);
  assert.equal(evidence.complete_relevant_area_visible.type, 'boolean');
});
