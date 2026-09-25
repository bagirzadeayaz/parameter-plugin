import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { submitPlatform } from './platform.mjs';
import { getCategorySchema } from './schema.mjs';
import { summarize } from './result.mjs';
import { normalizeRussianValues } from './bilingual.mjs';

function storageRoot() {
  const profile = process.env.CODEX_HOME || join(process.env.USERPROFILE || process.env.HOME || homedir(), '.codex');
  return join(profile, 'kontakt-parameter', 'results');
}
function resultPath(id) { return join(storageRoot(), `${String(id).replace(/[^a-zA-Z0-9-]/g, '')}.json`); }
async function saveTask(task) { await mkdir(storageRoot(), { recursive: true }); await writeFile(resultPath(task.id), `${JSON.stringify(task, null, 2)}\n`, 'utf8'); return task; }
async function loadTask(id) { try { return JSON.parse(await readFile(resultPath(id), 'utf8')); } catch (error) { if (error.code === 'ENOENT') throw new Error('Local product search was not found.'); throw error; } }
function useful(value) { return Boolean(String(value ?? '').trim() && !['—', '-', 'null', 'undefined'].includes(String(value).trim().toLowerCase())); }

export class LocalClient {
  constructor({ submit = submitPlatform } = {}) { this.submit = submit; }
  async sync(task, action, payload) {
    if (!task.platform?.capability) return null;
    if (action === 'validate') return this.submit(task, action, payload);
    try {
      if (action !== 'start') await this.submit(task, 'start');
      const result = await this.submit(task, action, payload);
      task.platform = { ...task.platform, taskId: result.taskId, state: action === 'save' ? 'synced' : action === 'validate' ? task.platform.state : result.status, lastError: null };
      await saveTask(task);
      return result;
    } catch (error) {
      task.platform.state = 'pending';
      task.platform.lastError = 'Platform submission was not confirmed.';
      if (action === 'save') { task.status = 'error'; task.analysisProgress.status = 'error'; task.analysisProgress.pct = 95; }
      await saveTask(task);
      throw error;
    }
  }
  async status() { await mkdir(storageRoot(), { recursive: true }); return { configured: true, healthy: true, localOnly: false, databaseAccess: false, storage: 'local_and_web', platformAuthentication: 'anonymous_submission' }; }
  async start(productName, category, officialUrl) {
    const schema = getCategorySchema(category); const now = Date.now(); const id = randomUUID();
    await saveTask({ id, productName, category, officialUrl: officialUrl || '', status: 'in_progress', createdAt: now, updatedAt: now, analysisProgress: { status: 'running', pct: 5, startedAt: now }, scrapedParams: Object.fromEntries(schema.fields.map(field => [field.key, '—'])), scrapedData: { summary: { count: schema.fieldCount, filled: 0, completenessPct: 0 }, sources: [], results: [], productImages: [] } });
    const task = await loadTask(id);
    task.platform = { capability: randomBytes(32).toString('hex'), state: 'pending', pdfUploadEnabled: true };
    await saveTask(task);
    // Keep the task ID available if the platform is temporarily unavailable.
    await this.sync(task, 'start').catch(() => null);
    return { taskId: id, provider: 'codex_native', storage: 'local_and_web', databaseAccess: false, platformSync: task.platform.state, schema, requiredResearchTool: 'codex_builtin_web_search', normalizationTemplate: 'kontakt.az' };
  }
  async rerun(id) { const task = await loadTask(id); const now = Date.now(); task.status = 'in_progress'; task.updatedAt = now; task.analysisProgress = { status: 'running', pct: 5, startedAt: now }; if (task.platform) task.platform = { capability: randomBytes(32).toString('hex'), state: 'pending' }; await saveTask(task); if (task.platform) await this.sync(task, 'start').catch(() => null); return { taskId: id, provider: 'codex_native', storage: task.platform ? 'local_and_web' : 'local_device' }; }
  async list({ category, status, limit = 10 } = {}) { const root = storageRoot(); await mkdir(root, { recursive: true }); const files = (await readdir(root)).filter(name => name.endsWith('.json')); const tasks = await Promise.all(files.map(name => readFile(join(root, name), 'utf8').then(JSON.parse).catch(() => null))); return tasks.filter(Boolean).filter(task => !category || task.category === category).filter(task => !status || task.analysisProgress?.status === status).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, limit).map(summarize); }
  async getTask(id) { return loadTask(id); }
  async uploadPdf(id, report) {
    const task = await loadTask(id);
    if (!task.platform?.pdfUploadEnabled) return report;
    try {
      // Reuse the original bytes on retries: PDFs include generation timestamps.
      const bytes = await readFile(report.path);
      if (bytes.length > 4 * 1024 * 1024) throw new Error('PDF exceeds the platform 4 MB limit.');
      const uploaded = await this.submit(task, 'pdf', { pdfBase64: bytes.toString('base64') });
      if (!uploaded.pdfStored) throw new Error('PDF upload was not confirmed.');
      return { ...report, platformStored: true };
    } catch {
      return { ...report, platformStored: false, uploadError: 'PDF platformaya yüklənmədi. Yerli fayl saxlanılıb.', retryTool: 'generate_product_search_pdf', taskId: id };
    }
  }
  async validateCodexResult(id, payload = {}) {
    const task = await loadTask(id); const schema = getCategorySchema(task.category); const errors = [];
    if (!Array.isArray(payload.productImages) || payload.productImages.length < 1) errors.push('Ən azı bir yoxlanılmış məhsul şəkli tələb olunur.');
    if (!payload.recoveryReport?.nativeWebSearchUsed || Number(payload.recoveryReport?.nativeWebSearchEventCount || 0) < 1) errors.push('Real Codex Web Search istifadəsi təsdiqlənməyib.');
    if (!payload.recoveryReport?.sourcePagesOpened) errors.push('İstifadə olunan mənbə səhifələri açılmayıb.');
    const unknown = Object.keys(payload.parametersAz || {}).filter(key => !schema.fields.some(field => field.key === key));
    if (unknown.length) errors.push(`Sxemdə olmayan sahələr: ${unknown.join(', ')}`);
    if (errors.length) throw Object.assign(new Error(errors.join(' ')), { code: 'failed-precondition' });
    const normalizedParameters = Object.fromEntries(schema.fields.map(field => [field.key, useful(payload.parametersAz?.[field.key]) ? String(payload.parametersAz[field.key]) : '—']));
    const filled = Object.values(normalizedParameters).filter(useful).length;
    const localRu = normalizeRussianValues(normalizedParameters, payload.parametersRu, task.category, { strict: true });
    const remote = await this.sync(task, 'validate', { ...payload, parametersRu: localRu, bilingualVersion: 1 });
    const values = remote?.normalizedParameters || normalizedParameters;
    return { taskId: id, valid: true, normalizedParameters: values, normalizedParametersRu: normalizeRussianValues(values, remote?.normalizedParametersRu || localRu, task.category, { strict: true }), filled: remote?.filled ?? filled, total: schema.fieldCount, completenessPct: remote?.completenessPct ?? Math.round((filled / schema.fieldCount) * 100) };
  }
  async saveCodexResult(id, payload = {}) {
    const validation = await this.validateCodexResult(id, payload); const task = await loadTask(id); const now = Date.now();
    const fieldEvidence = payload.fieldEvidence || {}; const sourceMap = new Map((payload.sources || []).map(source => [source.url, { ...source, supportedFields: [] }]));
    for (const [field, evidence] of Object.entries(fieldEvidence)) {
      const urls = [evidence?.source_url, evidence?.sourceUrl, ...(evidence?.supporting_sources || []).map(source => typeof source === 'string' ? source : source.url)].filter(Boolean);
      for (const url of urls) { if (!sourceMap.has(url)) sourceMap.set(url, { url, title: '', source_type: evidence?.source_type || '', supportedFields: [] }); sourceMap.get(url).supportedFields.push(field); }
    }
    const sources = [...sourceMap.values()].map(source => ({ ...source, sourceType: source.source_type || source.sourceType || '', exactModelMatch: source.exact_model_match ?? source.exactModelMatch ?? true, supportedFields: [...new Set(source.supportedFields || [])], supportedFieldCount: new Set(source.supportedFields || []).size, requiredFieldCount: validation.total }));
    const results = sources.map(source => ({ url: source.url, title: source.title || '', sourceType: source.sourceType, exactModelMatch: source.exactModelMatch, parameters: Object.fromEntries(source.supportedFields.map(field => [field, validation.normalizedParameters[field]])), fieldEvidence: Object.fromEntries(source.supportedFields.map(field => [field, fieldEvidence[field]])) }));
    Object.assign(task, { status: 'done', updatedAt: now, scrapedParams: validation.normalizedParameters, scrapedParamsRU: validation.normalizedParametersRu, confidence: payload.confidence || {}, analysisProgress: { status: 'done', pct: 100, startedAt: task.analysisProgress?.startedAt || task.createdAt, finishedAt: now }, scrapedData: { summary: { count: validation.total, filled: validation.filled, completenessPct: validation.completenessPct }, sources, results, productImages: (payload.productImages || []).map(image => ({ imageUrl: image.image_url, sourceUrl: image.source_url, title: image.title || '', exactModelMatch: true })), unresolvedFields: payload.unresolvedFields || [] } });
    await saveTask(task);
    const remote = await this.sync(task, 'save', { ...payload, parametersRu: validation.normalizedParametersRu, bilingualVersion: 1 });
    return { taskId: id, status: 'done', storage: remote ? 'local_and_web' : 'local_device', platformStored: Boolean(remote?.stored), platformTaskId: remote?.taskId || null, databaseAccess: false };
  }
  async wait(id) { return summarize(await loadTask(id)); }
  async callable(name, { taskId }) { if (name !== 'cancelProductAnalysis') throw new Error(`Unsupported local operation: ${name}`); const task = await loadTask(taskId); const now = Date.now(); await this.sync(task, 'cancel'); task.status = 'cancelled'; task.updatedAt = now; task.analysisProgress = { ...task.analysisProgress, status: 'cancelled', finishedAt: now }; await saveTask(task); return { success: true, cancelled: true, taskId }; }
}
