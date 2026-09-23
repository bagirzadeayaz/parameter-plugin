import { randomUUID } from 'node:crypto';
import { APPROVED_ROLES, getIdToken, loadSession } from './auth.mjs';
import { decodeFields, encodeFields, summarize } from './firestore.mjs';
import { getCategorySchema } from './schema.mjs';

const CATEGORIES = new Set(['phone', 'tablet', 'notebook', 'fridge', 'washing_machine']);
const TERMINAL = new Set(['done', 'error', 'cancelled']);
const RESEARCH_INSTRUCTIONS = 'Use actual hosted Codex native web_search and let it research naturally. Do not use model memory, shell HTTP, browser automation, MCP search, OpenRouter, Exa, Firecrawl, Azure, fixed search modes, fixed query counts, source-count quotas, country limits, domain allowlists or a mandatory stage sequence. The only website exclusion is Azerbaijani retailer websites; Azerbaijani official manufacturer sites and every relevant international source are allowed. Prefer official exact-product manufacturer pages, support pages, manuals and datasheets, then use any reliable specification database, technical catalogue, specialist review, retailer, news page, regulatory record or other relevant page. Search snippets are discovery only: open and read every page used as evidence. Match the exact product and target the Azerbaijan-market configuration when a specification is regional. Run a real native Codex image search/analysis attempt for every category according to each schema field imageAnalysis mode. Open exact-model image URLs and inspect actual pixels; filenames, thumbnails, alt text and snippets are not visual evidence. Record one structured observation per inspected image, including its source page, identity verification, usable status, visible fields and concrete observation. Record field-specific reasons for unavailable visual fields, never mark a field unavailable when a usable image visibly resolves it, and attach complete image evidence to every accepted visual value. Extract all supported schema fields, then recalculate missing and conflicting fields. For every missing field, perform at least two dedicated Web Search queries using materially different formulations; each recovery entry must target that one field rather than claiming a broad grouped query covers it. Continue with synonyms, manufacturer terminology, model codes, useful languages, documents, images and source types most likely to resolve the field. Do not announce that the draft is ready, that fields will remain unconfirmed, or that validation is next while any remaining field has not completed this dedicated recovery. Before declaring a conflict, confirm that values describe the same metric, unit, standard, time and market. For refrigerators, keep gross/nominal capacity separate from net/usable capacity, distinguish old A+/A++ labels from the newer A-G system, and reject internally inconsistent template data such as a Side-by-Side appliance described as bottom-freezer. For each true conflict, search further until an applicable official source resolves it or a clear independent majority is established; three independent sources are the minimum evidence for a claimed majority, copied pages count as one chain, and a tie or credible contradiction remains unresolved. Stop when all fields are evidence-backed or varied additional research no longer produces credible new evidence. Validate the complete draft with validate_product_search_draft before presenting a parameter table or asking to save; if validation fails, continue research. Record the queries, missing fields, conflicts and resolutions, normalize to the Kontakt template, and save unresolved values as null rather than guessing.';
const VALIDATION_RECOVERY_INSTRUCTIONS = ' Treat every draft-validation failure as an internal recoverable step. Never end the turn or show the user a validator/schema/metadata failure as the product-search result. Correct aliases and report structure, perform every additional field-specific search requested by validation, and retry validate_product_search_draft until it succeeds. Canonical image observation keys are exact_product_page_verified and visible_fields. Canonical conflict keys are outcome, evidenceUrls, officialSourceReviews, and reason. Keep all visible communication customer-facing: never narrate LLM, tool, prompt, worker, routing, schema, validation, metadata, evidence-recovery, query-count, or internal-stage details. Before the completed result, send at most one short opening message and only occasional compact progress updates after a meaningful percentage change. A progress update may contain only the product name, indicative percentage, elapsed time, and approximate time remaining; if no useful estimate exists, say that the remaining time is being calculated.';
const COMMERCIAL_COOLER_INSTRUCTIONS = ' For refrigerators, first identify whether the exact product is a household fridge or a commercial bottle/display cooler. A two-door bottle cooler is not an ordinary two-chamber fridge: preserve its supported type as Butulka soyuducusu, do not invent a freezer, and do not equate doors with chambers. Commercial climate class 4 or 4+ and display-cabinet class CC2 are distinct systems; never discard or convert one into the other. Research the exact model suffix in the current official specification, product-information/energy label, manuals and historical catalogues. For dimensions, capacity, noise and climate class, determine the generation and Azerbaijan-market applicability before selecting a value. Do not prefer a Turkish or other foreign-market product page over an applicable Azerbaijan-market document merely because the foreign page is official. Reconcile every high- or medium-confidence evidence quote with the normalized parameter value before saving; an evidenced value must not silently become a blank. Check the final brand spelling in the saved result and PDF.';
const FRIDGE_IMAGE_VIEW_INSTRUCTIONS = ' For each refrigerator field left unresolved because inspected images do not expose it, run a dedicated exact-model Web Search for the missing photo view, such as open refrigerator, open freezer, full exterior, or controls. Inspect the pixels of any applicable exact-variant image found. Record that real query in targetedSearches with only the affected field and stage image_view_recovery, in addition to the two ordinary dedicated missing-field queries. Do not mark a field visually unavailable merely because the first front-facing image is incomplete; do not guess from another regional variant.';
const WORKFLOW_CONTRACT = Object.freeze({
  transaction: ['start', 'research', 'recover', 'validate', 'save', 'generate_pdf', 'render'],
  terminalCondition: 'saved_with_pdf_and_fully_rendered',
  validationFailureIsTerminal: false,
  validationFailureAction: 'Continue in the same turn: perform every requested field-specific search or metadata correction, rebuild the draft, and call validate_product_search_draft again.',
  missingFieldAction: 'Run at least two dedicated, materially different native Web Search queries for each still-missing field before retrying validation.',
  successAction: 'Call save_product_search_result once, confirm its PDF was generated, then show a short product/count/date summary, PDF download, saved image, and complete parameterRows table with columns №, Parametr, Dəyər, Mənbə. Put clickable row.sources website links beside every found parameter, preserve each value verbatim, and finish with the per-source coverage table.',
  forbiddenUserFacingIntermediates: ['draft_validation_error', 'image_metadata_error', 'missing_field_recovery_required', 'worker_routing_error'],
  customerCommunication: {
    audience: 'non_technical_customer',
    hideInternalStages: true,
    openingMessagesMaximum: 1,
    progressUpdateMinimumIntervalSeconds: 60,
    progressFields: ['productName', 'indicativePercent', 'elapsedTime', 'approximateTimeRemaining'],
    forbiddenProgressDetails: ['llm', 'tool', 'prompt', 'agent', 'worker', 'routing', 'schema', 'validator', 'metadata', 'evidence_recovery', 'query_count', 'source_processing', 'internal_stage'],
    finalResponseBeginsWithCustomerResult: true,
  },
});
const BM_FIELDS = {
  phone: ['SIM-kart sayı', 'SIM-kart növü', 'Rəng', 'Komplektasiya', 'Şəbəkə standartı', 'Daxili yaddaş', 'Operativ yaddaş', 'NFC'],
  tablet: ['SIM kartın sayı', 'SIM kartın növü', 'Rəng', 'Komplektasiya', 'Şəbəkə', 'Daxili yaddaş', 'Operativ yaddaş'],
  notebook: ['Rəng', 'Klaviaturanın dili', 'Daxili yaddaş', 'Operativ yaddaş'], fridge: ['Rəng'], washing_machine: ['Rəng'],
};

export class FirebaseClient {
  constructor({ fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), sessionLoader = loadSession } = {}) { this.fetch = fetchImpl; this.sleep = sleep; this.sessionLoader = sessionLoader; }
  async context() {
    const session = await this.sessionLoader();
    if (!session) throw Object.assign(new Error('Not signed in. Run: node plugins/kontakt-parameter/scripts/login.mjs'), { code: 'unauthenticated' });
    const token = await getIdToken(session, this.fetch);
    const documentRoot = `projects/${session.projectId}/databases/(default)/documents`;
    return { session, token, documentRoot, root: `https://firestore.googleapis.com/v1/${documentRoot}` };
  }
  async request(url, options = {}) {
    const { token } = await this.context();
    const response = await this.fetch(url, { ...options, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) { const error = new Error(body?.error?.message || `Firebase request failed (${response.status}).`); error.code = body?.error?.status || `http_${response.status}`; throw error; }
    return body;
  }
  async getDocument(collection, id) {
    const { root } = await this.context(); const doc = await this.request(`${root}/${collection}/${encodeURIComponent(id)}`);
    return { id: doc.name.split('/').pop(), ...decodeFields(doc.fields || {}) };
  }
  async getUser() {
    const { session } = await this.context(); const user = await this.getDocument('users', session.uid);
    if (!APPROVED_ROLES.has(user.role)) throw Object.assign(new Error(user.role === 'pending' ? 'Your account is pending approval.' : 'An approved account is required.'), { code: 'permission_denied' });
    return user;
  }
  async callable(name, data) {
    const { session, token } = await this.context(); const url = `https://${session.region || 'us-central1'}-${session.projectId}.cloudfunctions.net/${name}`;
    const response = await this.fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ data }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) { const error = new Error(body?.error?.message || `Callable ${name} failed (${response.status}).`); error.code = String(body?.error?.status || body?.error?.code || `http_${response.status}`).replace(/^functions\//, ''); throw error; }
    return body.result ?? body.data ?? body;
  }
  async authorizedTask(taskId) {
    const [user, task] = await Promise.all([this.getUser(), this.getDocument('productTasks', taskId)]); const { session } = await this.context();
    if (user.role !== 'super_admin' && ![task.assignedTo, task.userId].includes(session.uid)) throw Object.assign(new Error('You cannot access this product search.'), { code: 'permission_denied' });
    return task;
  }
  async commitNewTask(productName, category, officialUrl) {
    if (!CATEGORIES.has(category)) throw new Error('Category must be phone, tablet, notebook, fridge, or washing_machine.');
    if (!productName || productName.trim().length < 2) throw new Error('An exact product name is required.');
    if (officialUrl) { const url = new URL(officialUrl); if (url.protocol !== 'https:') throw new Error('Official URL must use HTTPS.'); }
    const user = await this.getUser(); const { session, root, documentRoot } = await this.context(); const now = Date.now(); const taskId = randomUUID(); const auditId = randomUUID();
    const actorName = user.displayName || user.name || session.email || session.uid;
    const task = { productName: productName.trim(), tmCode: '', category, status: 'in_progress', createdAt: now, updatedAt: now, createdBy: session.uid, createdByName: actorName, assignedTo: session.uid, assignedToName: actorName, bmRequestedFields: BM_FIELDS[category], brandManagerId: null, brandManagerParams: {}, scrapedParams: {}, finalParams: {}, fieldComments: {}, timeline: [{ at: now, from: null, to: 'created', actorUid: session.uid, actorName }, { at: now, from: 'created', to: 'in_progress', actorUid: session.uid, actorName, note: 'Axtarış başladıldı' }], currentOwner: { uid: session.uid, role: user.role, name: actorName, since: now }, lastActorUid: session.uid, lastActorName: actorName, ...(officialUrl ? { officialUrl } : {}) };
    const audit = { action: 'product_search_started', entityType: 'productTask', entityId: taskId, actorUid: session.uid, actorName, createdAt: now, details: { productName: task.productName, category, officialUrl: officialUrl || null } };
    const writes = [{ update: { name: `${documentRoot}/productTasks/${taskId}`, fields: encodeFields(task) }, currentDocument: { exists: false } }, { update: { name: `${documentRoot}/auditLogs/${auditId}`, fields: encodeFields(audit) }, currentDocument: { exists: false } }];
    await this.request(root.replace(/\/documents$/, '/documents:commit'), { method: 'POST', body: JSON.stringify({ writes }) }); return { taskId, task };
  }
  async start(productName, category, officialUrl) {
    const { taskId } = await this.commitNewTask(productName, category, officialUrl);
    const started = await this.callable('beginCodexProductAnalysis', { taskId, executionMode: 'interactive' });
    return { taskId, productName: productName.trim(), category, officialUrl: officialUrl || null, ...started, schema: getCategorySchema(category), normalizationTemplate: 'kontakt.az', regionalTarget: 'azerbaijan_market', requiredResearchTool: 'codex_builtin_web_search', adaptiveResearch: true, workflowContract: WORKFLOW_CONTRACT, instructions: RESEARCH_INSTRUCTIONS + VALIDATION_RECOVERY_INSTRUCTIONS + (category === 'fridge' ? COMMERCIAL_COOLER_INSTRUCTIONS + FRIDGE_IMAGE_VIEW_INSTRUCTIONS : '') };
  }
  async createAudit(action, taskId, details = {}) {
    const user = await this.getUser(); const { session, root } = await this.context(); const actorName = user.displayName || user.name || session.email || session.uid;
    await this.request(`${root}/auditLogs?documentId=${randomUUID()}`, { method: 'POST', body: JSON.stringify({ fields: encodeFields({ action, entityType: 'productTask', entityId: taskId, actorUid: session.uid, actorName, createdAt: Date.now(), details }) }) });
  }
  async rerun(taskId) {
    const task = await this.authorizedTask(taskId);
    const result = await this.callable('beginCodexProductAnalysis', { taskId, executionMode: 'interactive' });
    await this.createAudit('product_search_rerun', taskId, { productName: task.productName, category: task.category });
    return { taskId, productName: task.productName, category: task.category, officialUrl: task.officialUrl || null, ...result, schema: getCategorySchema(task.category), normalizationTemplate: 'kontakt.az', regionalTarget: 'azerbaijan_market', requiredResearchTool: 'codex_builtin_web_search', adaptiveResearch: true, workflowContract: WORKFLOW_CONTRACT, instructions: RESEARCH_INSTRUCTIONS + VALIDATION_RECOVERY_INSTRUCTIONS + (task.category === 'fridge' ? COMMERCIAL_COOLER_INSTRUCTIONS + FRIDGE_IMAGE_VIEW_INSTRUCTIONS : '') };
  }
  async saveCodexResult(taskId, payload) {
    await this.authorizedTask(taskId);
    return this.callable('saveCodexProductAnalysis', { taskId, ...payload });
  }
  async validateCodexResult(taskId, payload) {
    await this.authorizedTask(taskId);
    return this.callable('validateCodexProductAnalysis', { taskId, ...payload });
  }
  async list({ limit = 10, category, status } = {}) {
    await this.getUser(); const { session, root } = await this.context(); const query = { structuredQuery: { from: [{ collectionId: 'productTasks' }], where: { fieldFilter: { field: { fieldPath: 'assignedTo' }, op: 'EQUAL', value: { stringValue: session.uid } } }, limit: Math.min(Math.max(Number(limit) * 5, 25), 100) } };
    const rows = await this.request(root.replace(/\/documents$/, '/documents:runQuery'), { method: 'POST', body: JSON.stringify(query) });
    return rows.filter(row => row.document).map(row => ({ id: row.document.name.split('/').pop(), ...decodeFields(row.document.fields || {}) })).filter(task => !category || task.category === category).filter(task => !status || task.analysisProgress?.status === status).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, Math.min(Math.max(Number(limit), 1), 50)).map(task => summarize(task));
  }
  async wait(taskId, afterHeartbeat = 0, timeoutSeconds = 120) {
    const end = Date.now() + Math.min(Math.max(Number(timeoutSeconds), 1), 120) * 1000; let task;
    do { task = await this.authorizedTask(taskId); const progress = task.analysisProgress || {}; if (TERMINAL.has(progress.status) || Number(progress.lastHeartbeat || progress.finishedAt || 0) > Number(afterHeartbeat || 0)) return summarize(task); if (Date.now() >= end) break; await this.sleep(Math.min(5000, end - Date.now())); } while (Date.now() < end);
    return { ...summarize(task), timedOut: true };
  }
  async claimCodexJob(workerId) {
    return this.callable('claimCodexProductAnalysis', { workerId });
  }
  async heartbeatCodexJob(workerId, job, progress = {}) {
    return this.callable('heartbeatCodexProductAnalysis', {
      workerId,
      taskId: job.taskId,
      runId: job.runId,
      webSearchEventCount: Number(progress.webSearchEventCount || 0),
      imageAnalysisEventCount: Number(progress.imageAnalysisEventCount || 0),
      pct: Number(progress.pct || 0),
      stage: String(progress.stage || ''),
    });
  }
  async finishCodexJob(workerId, job, result = {}) {
    return this.callable('finishCodexProductAnalysis', {
      workerId,
      taskId: job.taskId,
      runId: job.runId,
      exitCode: Number(result.exitCode ?? 1),
      error: String(result.error || ''),
    });
  }
}
