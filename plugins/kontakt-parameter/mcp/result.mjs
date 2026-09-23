import { buildParameterRows, renderParameterTable } from './presentation.mjs';

const progressCopy = {
  queued: 'Məhsul sorğusu növbədədir.',
  running: 'Məhsul məlumatları hazırlanır.',
  cancelling: 'Sorğu dayandırılır.',
  cancelled: 'Sorğu ləğv edildi.',
  done: 'Məhsul məlumatları hazırdır.',
  error: 'Məhsul məlumatlarını hazırlamaq mümkün olmadı.',
};

export function customerProgress(progress = {}, now = Date.now()) {
  const status = String(progress.status || 'unknown');
  const pct = status === 'done' ? 100 : Math.max(0, Math.min(99, Number(progress.pct || 0)));
  const startedAt = Number(progress.startedAt || 0);
  const finishedAt = Number(progress.finishedAt || 0);
  const endAt = finishedAt || now;
  const elapsedSeconds = startedAt > 0 ? Math.max(0, Math.round((endAt - startedAt) / 1000)) : null;
  let estimatedRemainingSeconds = null;
  if (status === 'running' && pct >= 5 && elapsedSeconds >= 10) {
    const observedTotal = elapsedSeconds * (100 / Math.max(1, pct));
    const estimatedTotal = Math.min(900, Math.max(120, (observedTotal * 0.7) + (360 * 0.3)));
    estimatedRemainingSeconds = Math.max(10, Math.round(estimatedTotal - elapsedSeconds));
    if (pct >= 95) estimatedRemainingSeconds = Math.min(90, estimatedRemainingSeconds);
  }
  return {
    pct,
    status,
    message: progressCopy[status] || 'Məhsul sorğusunun vəziyyəti məlumdur.',
    elapsedSeconds,
    estimatedRemainingSeconds,
    estimateIsIndicative: true,
  };
}

export function summarize(task = {}) {
  const progress = task.analysisProgress || {}; const summary = task.scrapedData?.summary || {};
  return { taskId: task.id, productName: task.productName, category: task.category, status: progress.status || task.status || 'unknown', progress: customerProgress(progress), createdAt: task.createdAt, updatedAt: task.updatedAt, result: { requiredFields: Number(summary.count || 0), foundFields: Number(summary.filled || 0), coveragePercent: Number(summary.completenessPct || 0) } };
}

export function shapeTask(task, view = 'summary', fields = []) {
  const base = summarize(task); if (view === 'summary') return base;
  const wanted = new Set((fields || []).map(String)); const include = key => !wanted.size || wanted.has(key);
  const normalized = task.finalParams && Object.keys(task.finalParams).length ? task.finalParams : (task.scrapedParams || {});
  const results = Object.fromEntries(Object.entries(normalized).filter(([key]) => include(key)));
  const confidence = Object.fromEntries(Object.entries(task.confidence || {}).filter(([key]) => include(key)));
  const sourceRows = Array.isArray(task.scrapedData?.results) ? task.scrapedData.results : [];
  const evidence = sourceRows.map(source => ({ sourceUrl: source.url || source.sourceUrl || '', sourceType: source.sourceType || '', title: source.title || '', exactModelMatch: source.exactModelMatch, parameters: Object.fromEntries(Object.entries(source.parameters || source.params || {}).filter(([key]) => include(key))), fieldEvidence: Object.fromEntries(Object.entries(source.fieldEvidence || source.evidence || {}).filter(([key]) => include(key))) }));
  const evidenceByUrl = new Map(evidence.map(source => [source.sourceUrl, source]));
  const sources = (task.scrapedData?.sources || sourceRows).map(source => {
    if (typeof source === 'string') source = { url: source };
    const url = source.url || source.sourceUrl || '';
    const supportedFields = source.supportedFields || Object.keys(evidenceByUrl.get(url)?.parameters || {});
    return { url, title: source.title || '', sourceType: source.sourceType || '', exactModelMatch: source.exactModelMatch, supportedFields, supportedFieldCount: Number(source.supportedFieldCount ?? supportedFields.length), requiredFieldCount: Number(source.requiredFieldCount || task.scrapedData?.summary?.count || 0) };
  });
  const productImages = (task.scrapedData?.productImages || []).map(image => ({ imageUrl: image.imageUrl || image.image_url || '', sourceUrl: image.sourceUrl || image.source_url || '', title: image.title || '', exactModelMatch: image.exactModelMatch !== false })).filter(image => image.imageUrl);
  if (view === 'app') {
    const filterMap = value => Object.fromEntries(Object.entries(value || {}).filter(([key]) => include(key)));
    const keys = [...new Set([
      ...Object.keys(task.scrapedParams || {}),
      ...Object.keys(task.finalParams || {}),
      ...Object.keys(task.brandManagerParams || {}),
      ...Object.keys(task.canonicalSpecification?.values || {}),
    ])].filter(include);
    const meaningful = value => Boolean(String(value ?? '').trim() && !['null', '—', '-', 'undefined'].includes(String(value).trim().toLowerCase()));
    const choose = (...values) => values.find(meaningful) ?? '—';
    const displayParams = Object.fromEntries(keys.map(key => [key, choose(task.finalParams?.[key], task.scrapedParams?.[key], task.brandManagerParams?.[key], task.canonicalSpecification?.values?.[key])]));
    const displayParamsRU = Object.fromEntries(keys.map(key => [key, choose(task.finalParams?.[key], task.scrapedParamsRU?.[key], task.scrapedParams?.[key], task.brandManagerParams?.[key], task.canonicalSpecification?.values?.[key])]));
    return {
      id: task.id,
      productName: task.productName,
      category: task.category,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      analysisProgress: base.progress,
      scrapedParams: filterMap(task.scrapedParams),
      scrapedParamsRU: filterMap(task.scrapedParamsRU),
      finalParams: filterMap(task.finalParams),
      brandManagerParams: filterMap(task.brandManagerParams),
      displayParams,
      displayParamsRU,
      parameterRows: buildParameterRows({ ...task, displayParams }),
      parameterTableMarkdown: renderParameterTable(buildParameterRows({ ...task, displayParams })),
      presentation: {
        columns: ['№', 'Parametr', 'Dəyər', 'Mənbə'],
        instructions: 'Show the product name, then a compact category/count/date line, PDF download, product image, and complete parameterRows table. For each found parameter link its row.sources website labels in the separate Mənbə column. Preserve values verbatim. Never attach an unrelated source. Use — for unresolved rows; for older filled rows without saved proof show Mənbə göstərilməyib. Keep task IDs and internal status details out of the opening.',
      },
      canonicalSpecification: task.canonicalSpecification || null,
      confidence,
      scrapedData: {
        ...(task.scrapedData || {}),
        results: evidence,
        sources,
        productImages,
        sourceCoverage: sources,
      },
    };
  }
  if (view === 'results') return { ...base, normalizedParameters: results, confidence, sources, productImages };
  if (view === 'evidence') return { ...base, sources, evidence };
  return { ...base, normalizedParameters: results, confidence, sources, productImages, evidence, unresolvedFields: task.scrapedData?.unresolvedFields || [], canonicalSpecification: task.canonicalSpecification || null };
}
