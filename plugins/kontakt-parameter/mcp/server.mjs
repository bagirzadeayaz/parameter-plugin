import { pathToFileURL } from 'node:url';
import readline from 'node:readline';
import { LocalClient } from './local.mjs';
import { shapeTask } from './result.mjs';
import { getCategorySchema } from './schema.mjs';
import { fetchProductImage } from './image.mjs';
import { existingProductPdf, generateProductPdf } from './pdf.mjs';

const categorySchema = { type: 'string', enum: ['phone', 'tablet', 'notebook', 'fridge', 'washing_machine'] };
function redactError(error) { return String(error?.message || error || 'Unknown error').replace(/((?:refresh_token|id_token|password|api[_-]?key)\s*[=:]\s*)[^\s,}]+/gi, '$1[redacted]').slice(0, 800); }
export const toolDefinitions = [
  { name: 'parameter_connection_status', description: 'Check that local plugin storage is ready. No database connection, user sign-in, registration, password, or approval is used.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_product_schema', description: 'Return the exact ordered application schema for one supported product category.', inputSchema: { type: 'object', required: ['category'], properties: { category: categorySchema }, additionalProperties: false } },
  { name: 'inspect_product_image', description: 'Read-only retrieval of an exact-product public HTTPS image so Codex can inspect the actual pixels. Use only after Web Search identifies the image and its source product page.', inputSchema: { type: 'object', required: ['image_url', 'source_url'], properties: { image_url: { type: 'string', format: 'uri', pattern: '^https://' }, source_url: { type: 'string', format: 'uri', pattern: '^https://' }, expected_product: { type: 'string', minLength: 2, maxLength: 500 } }, additionalProperties: false } },
  { name: 'start_product_search', description: 'Create a product-search transaction for Codex native web research. The transaction must continue in the same turn through research, per-field recovery, successful draft validation, save, automatic PDF generation, and complete rendering. Validation failures are non-terminal internal loop instructions and must never be shown as the result. An explicit product-search request authorizes start and final save, so do not ask for another confirmation. This does not call OpenRouter, Exa, or Firecrawl.', inputSchema: { type: 'object', required: ['product_name', 'category'], properties: { product_name: { type: 'string', minLength: 2, maxLength: 500 }, category: categorySchema, official_url: { type: 'string', format: 'uri', pattern: '^https://' } }, additionalProperties: false } },
  { name: 'rerun_product_search', description: 'Restart a locally saved task for Codex native web research. This does not call OpenRouter, Exa, or Firecrawl. Requires user approval.', inputSchema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string', minLength: 1, maxLength: 128 } }, additionalProperties: false } },
  { name: 'list_product_searches', description: 'List recent product searches saved locally on this device.', inputSchema: { type: 'object', properties: { category: categorySchema, status: { type: 'string', enum: ['queued', 'running', 'done', 'error', 'cancelled'] }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 } }, additionalProperties: false } },
  { name: 'get_product_search', description: 'Get a locally saved search status or result. The app view returns the complete structured result. When a completed result is returned, always render its complete parameter table and include its generated PDF.', inputSchema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string' }, view: { type: 'string', enum: ['summary', 'results', 'evidence', 'app', 'all'], default: 'summary' }, fields: { type: 'array', items: { type: 'string' }, uniqueItems: true } }, additionalProperties: false } },
  { name: 'generate_product_search_pdf', description: 'Generate or regenerate the standard Kontakt PDF for a locally saved search. The PDF uses the saved product image and exact saved parameter values.', inputSchema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string', minLength: 1, maxLength: 128 } }, additionalProperties: false } },
  { name: 'wait_product_search', description: 'Wait up to 120 seconds for progress to change or a search to finish. Returns only customer-safe percentage and indicative timing, never internal stage text. Prefer this to frequent manual polling. If it reports done, immediately fetch the app view and show the full table.', inputSchema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string' }, after_heartbeat: { type: 'number', default: 0 }, timeout_seconds: { type: 'integer', minimum: 1, maximum: 120, default: 120 } }, additionalProperties: false } },
  { name: 'cancel_product_search', description: 'Cancel a locally saved active search. Requires user approval.', inputSchema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string' } }, additionalProperties: false } },
  { name: 'save_product_search_result', description: 'Normalize and save Codex native Web Search results in the Kontakt.az template, automatically generate the standard image-and-parameters PDF, then return the complete saved app-format result and PDF file. Always render its full parameter table, at least one exact-product image, the PDF link, and a linked per-source extracted-parameter count immediately. The original explicit product-search request authorizes the final save, so do not ask for another confirmation. Missing and conflicting fields must receive additional natural research, without fixed search modes or query limits.', inputSchema: { type: 'object', required: ['task_id', 'parameters_az', 'sources', 'product_images', 'recovery_report'], properties: {
    task_id: { type: 'string', minLength: 1, maxLength: 128 },
    parameters_az: { type: 'object', additionalProperties: { type: ['string', 'null'] } },
    parameters_ru: { type: 'object', additionalProperties: { type: ['string', 'null'] } },
    confidence: { type: 'object', additionalProperties: { type: 'string', enum: ['high', 'medium', 'low', 'unresolved'] } },
    field_evidence: { type: 'object', additionalProperties: { type: 'object', properties: { value: { type: ['string', 'null'] }, source_url: { type: 'string' }, source_type: { type: 'string' }, quote: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low', 'unresolved'] }, evidence_basis: { type: 'string', enum: ['official', 'official_regional_resolution', 'technical_document', 'independent_consensus', 'single_nonofficial', 'visual_direct', 'visual_label'] }, evidence_kind: { type: 'string', enum: ['text', 'product_photo', 'label_photo', 'manual_image', 'pdf_image'] }, image_url: { type: 'string', format: 'uri' }, image_index: { type: 'integer', minimum: 0 }, visible_detail: { type: 'string', maxLength: 4000 }, visual_confidence: { type: 'number', minimum: 0, maximum: 1 }, exact_model_visible: { type: 'boolean' }, exact_product_page_verified: { type: 'boolean' }, complete_relevant_area_visible: { type: 'boolean' }, supporting_sources: { type: 'array', maxItems: 20, items: { anyOf: [{ type: 'string', format: 'uri' }, { type: 'object', required: ['url'], properties: { url: { type: 'string' }, source_type: { type: 'string' }, quote: { type: 'string' }, exact_model_match: { type: 'boolean' } }, additionalProperties: false }] } } }, additionalProperties: false } },
    sources: { type: 'array', maxItems: 80, items: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, title: { type: 'string' }, source_type: { type: 'string' }, exact_model_match: { type: 'boolean' } }, additionalProperties: false } },
    product_images: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', required: ['image_url', 'source_url'], properties: { image_url: { type: 'string', format: 'uri', pattern: '^https://' }, source_url: { type: 'string', format: 'uri', pattern: '^https://' }, title: { type: 'string', maxLength: 500 }, exact_model_match: { type: 'boolean', const: true } }, additionalProperties: false } },
    unresolved_fields: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    recovery_report: { type: 'object', required: ['nativeWebSearchUsed', 'nativeWebSearchEventCount', 'sourcePagesOpened', 'openedSourceUrls', 'imageAnalysis', 'initialSearchCompleted', 'targetedSearches', 'conflictingFields', 'conflictResolutions', 'remainingFields', 'stoppedBecause'], properties: {
      nativeWebSearchUsed: { type: 'boolean', const: true },
      nativeWebSearchEventCount: { type: 'integer', minimum: 1 },
      sourcePagesOpened: { type: 'boolean', const: true },
      openedSourceUrls: { type: 'array', maxItems: 120, items: { type: 'string', format: 'uri' }, uniqueItems: true },
      imageAnalysis: { type: 'object', required: ['applicable', 'attempted', 'completed', 'imageAnalysisEventCount', 'inspectedImageUrls', 'observations', 'analyzedFields', 'acceptedFields', 'unavailableFields', 'unavailableReasons', 'stoppedBecause'], properties: {
        applicable: { type: 'boolean' },
        attempted: { type: 'boolean' },
        completed: { type: 'boolean' },
        imageAnalysisEventCount: { type: 'integer', minimum: 1 },
        inspectedImageUrls: { type: 'array', maxItems: 80, items: { type: 'string', format: 'uri' }, uniqueItems: true },
        observations: { type: 'array', maxItems: 80, items: { type: 'object', required: ['image_url', 'source_url', 'usable', 'observation'], properties: {
          image_url: { type: 'string', format: 'uri' },
          source_url: { type: 'string', format: 'uri' },
          exact_product_page_verified: { type: 'boolean' },
          exact_product_verified: { type: 'boolean' },
          exact_model_visible: { type: 'boolean' },
          usable: { type: 'boolean' },
          visible_fields: { type: 'array', items: { type: 'string' }, uniqueItems: true },
          fields_visibly_shown: { type: 'array', items: { type: 'string' }, uniqueItems: true },
          observation: { type: 'string', minLength: 1, maxLength: 2000 }
        }, additionalProperties: false } },
        analyzedFields: { type: 'array', items: { type: 'string' }, uniqueItems: true },
        acceptedFields: { type: 'array', items: { type: 'string' }, uniqueItems: true },
        unavailableFields: { type: 'array', items: { type: 'string' }, uniqueItems: true },
        unavailableReasons: { type: 'object', additionalProperties: { type: 'string', minLength: 1, maxLength: 1000 } },
        stoppedBecause: { type: 'string', minLength: 1, maxLength: 1000 }
      }, additionalProperties: false },
      initialSearchCompleted: { type: 'boolean', const: true },
      targetedSearches: { type: 'array', maxItems: 300, items: { type: 'object', required: ['fields', 'foundFields'], properties: { stage: { type: 'string', maxLength: 80 }, query: { type: 'string', minLength: 1, maxLength: 1000 }, queries: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 1000 } }, fields: { type: 'array', minItems: 1, maxItems: 1, items: { type: 'string' }, uniqueItems: true }, foundFields: { type: 'array', items: { type: 'string' }, uniqueItems: true } }, additionalProperties: false } },
      conflictingFields: { type: 'array', items: { type: 'string' }, uniqueItems: true },
      conflictResolutions: { type: 'array', maxItems: 80, items: { type: 'object', required: ['field'], properties: { field: { type: 'string' }, outcome: { type: 'string', enum: ['official_priority', 'independent_majority', 'unresolved'] }, resolution: { type: 'string' }, selectedValue: { type: ['string', 'null'] }, evidenceUrls: { type: 'array', maxItems: 20, items: { type: 'string', format: 'uri' }, uniqueItems: true }, officialSourceReviews: { type: 'array', maxItems: 20, items: { type: 'object', required: ['url'], properties: { url: { type: 'string', format: 'uri' }, exactVariantMatch: { type: 'boolean' }, applicable: { type: 'boolean' }, value: { type: ['string', 'null'] }, quote: { type: 'string', minLength: 1, maxLength: 4000 }, statement: { type: 'string', minLength: 1, maxLength: 4000 } }, additionalProperties: false } }, reason: { type: 'string', minLength: 1, maxLength: 2000 } }, additionalProperties: false } },
      officialSourceReviews: { type: 'array', maxItems: 40, items: { type: 'object', required: ['url'], properties: { field: { type: 'string' }, url: { type: 'string', format: 'uri' }, exactVariantMatch: { type: 'boolean' }, applicable: { type: 'boolean' }, value: { type: ['string', 'null'] }, quote: { type: 'string' }, statement: { type: 'string' } }, additionalProperties: false } },
      remainingFields: { type: 'array', items: { type: 'string' }, uniqueItems: true },
      stoppedBecause: { type: 'string', minLength: 1, maxLength: 1000 }
    }, additionalProperties: false },
    notes: { type: 'string', maxLength: 8000 }
  }, additionalProperties: false } },
];

const saveResultDefinition = toolDefinitions.find(tool => tool.name === 'save_product_search_result');
toolDefinitions.splice(toolDefinitions.indexOf(saveResultDefinition), 0, {
  name: 'validate_product_search_draft',
  description: 'Read-only validation before save. Do not present or stop on a validation failure: it is a non-terminal internal loop instruction. In the same turn, perform every requested field-specific search or metadata correction and call this tool again until valid; then call save_product_search_result and render the complete saved result.',
  inputSchema: saveResultDefinition.inputSchema,
});

function content(value, extraContent = []) { return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }, ...extraContent], structuredContent: value }; }
function pdfResource(report, productName = 'Kontakt product') {
  if (!report?.generated || !report?.fileUri) return [];
  return [{ type: 'resource_link', uri: report.fileUri, name: report.fileName, title: `${productName} - PDF`, description: 'Kontakt Parameter product report with verified image and saved parameters.', mimeType: 'application/pdf', size: report.bytes }];
}
function canonicalOutcome(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['official_priority', 'independent_majority', 'unresolved'].includes(normalized)) return normalized;
  if (normalized.includes('official')) return 'official_priority';
  if (normalized.includes('majority') || normalized.includes('consensus')) return 'independent_majority';
  return 'unresolved';
}

export function canonicalizeAnalysisArgs(args = {}) {
  const recovery = args.recovery_report && typeof args.recovery_report === 'object' ? { ...args.recovery_report } : args.recovery_report;
  if (recovery && typeof recovery === 'object') {
    const image = recovery.imageAnalysis && typeof recovery.imageAnalysis === 'object' ? { ...recovery.imageAnalysis } : recovery.imageAnalysis;
    if (image && typeof image === 'object') {
      image.observations = (Array.isArray(image.observations) ? image.observations : []).map(item => ({
        ...item,
        exact_product_page_verified: item?.exact_product_page_verified ?? item?.exact_product_verified ?? item?.exactProductPageVerified ?? false,
        exact_model_visible: item?.exact_model_visible ?? item?.exactModelVisible ?? false,
        visible_fields: item?.visible_fields ?? item?.fields_visibly_shown ?? item?.visibleFields ?? [],
      }));
      recovery.imageAnalysis = image;
    }
    recovery.targetedSearches = (Array.isArray(recovery.targetedSearches) ? recovery.targetedSearches : []).flatMap(item => {
      const queries = Array.isArray(item?.queries) ? item.queries : [item?.query];
      return queries.filter(Boolean).map(query => ({ ...item, query, queries: undefined }));
    });
    const topReviews = Array.isArray(recovery.officialSourceReviews) ? recovery.officialSourceReviews : [];
    recovery.conflictResolutions = (Array.isArray(recovery.conflictResolutions) ? recovery.conflictResolutions : []).map(item => {
      const reviews = (Array.isArray(item?.officialSourceReviews) ? item.officialSourceReviews : topReviews.filter(review => !review?.field || review.field === item?.field)).map(review => ({
        url: review?.url,
        exactVariantMatch: review?.exactVariantMatch === true,
        applicable: review?.applicable === true,
        value: review?.value ?? null,
        quote: review?.quote || review?.statement || '',
      }));
      const evidenceUrls = [...new Set([...(Array.isArray(item?.evidenceUrls) ? item.evidenceUrls : []), ...reviews.map(review => review.url)].filter(Boolean))];
      return {
        field: item?.field,
        outcome: canonicalOutcome(item?.outcome || item?.resolution),
        selectedValue: item?.selectedValue ?? null,
        evidenceUrls,
        officialSourceReviews: reviews,
        reason: item?.reason || (String(item?.resolution || '').trim() && !['official_priority', 'independent_majority', 'unresolved'].includes(String(item.resolution).trim()) ? item.resolution : recovery.stoppedBecause) || 'Additional exact-model evidence did not resolve the conflict.',
      };
    });
    delete recovery.officialSourceReviews;
  }
  const fieldEvidence = Object.fromEntries(Object.entries(args.field_evidence || {}).map(([field, evidence]) => [field, {
    ...evidence,
    supporting_sources: (Array.isArray(evidence?.supporting_sources) ? evidence.supporting_sources : []).map(source => typeof source === 'string' ? { url: source } : source),
  }]));
  return { ...args, field_evidence: fieldEvidence, recovery_report: recovery };
}

export function analysisPayload(rawArgs) {
  const args = canonicalizeAnalysisArgs(rawArgs);
  return {
    parametersAz: args.parameters_az,
    parametersRu: args.parameters_ru,
    confidence: args.confidence,
    fieldEvidence: args.field_evidence,
    sources: args.sources,
    productImages: args.product_images,
    unresolvedFields: args.unresolved_fields,
    notes: args.notes,
    recoveryReport: args.recovery_report,
  };
}
export async function callTool(name, args = {}, client = new LocalClient()) {
  if (name === 'parameter_connection_status') {
    try { return content(await client.status()); }
    catch (error) { return content({ configured: false, healthy: false, localOnly: true, databaseAccess: false, message: redactError(error) }); }
  }
  if (name === 'get_product_schema') return content(getCategorySchema(args.category));
  if (name === 'inspect_product_image') {
    const image = await fetchProductImage(args.image_url);
    return {
      content: [
        { type: 'text', text: JSON.stringify({ imageUrl: image.imageUrl, sourceUrl: args.source_url, expectedProduct: args.expected_product || '', bytes: image.bytes, instruction: 'Inspect the attached pixels. Verify exact-product identity from the source page or visible model label before using any observation as evidence.' }) },
        { type: 'image', data: image.data, mimeType: image.mimeType },
      ],
      structuredContent: { imageUrl: image.imageUrl, sourceUrl: args.source_url, expectedProduct: args.expected_product || '', bytes: image.bytes, pixelDataReturned: true },
    };
  }
  if (name === 'start_product_search') return content(await client.start(args.product_name, args.category, args.official_url));
  if (name === 'rerun_product_search') return content(await client.rerun(args.task_id));
  if (name === 'list_product_searches') return content({ searches: await client.list(args) });
  if (name === 'get_product_search') {
    const result = shapeTask(await client.getTask(args.task_id), args.view || 'summary', args.fields || []);
    const pdfReport = result?.result?.status === 'done' || result?.status === 'done' || result?.analysisProgress?.status === 'done'
      ? await existingProductPdf(result).catch(() => null)
      : null;
    const response = pdfReport ? { ...result, pdfReport } : result;
    return content(response, pdfResource(pdfReport, result.productName));
  }
  if (name === 'generate_product_search_pdf') {
    const result = shapeTask(await client.getTask(args.task_id), 'app');
    let pdfReport = await existingProductPdf(result).catch(() => null);
    if (!pdfReport) pdfReport = await (typeof client.generateProductPdf === 'function' ? client.generateProductPdf(result) : generateProductPdf(result));
    if (typeof client.uploadPdf === 'function') pdfReport = await client.uploadPdf(args.task_id, pdfReport);
    return content({ taskId: args.task_id, pdfReport }, pdfResource(pdfReport, result.productName));
  }
  if (name === 'wait_product_search') return content(await client.wait(args.task_id, args.after_heartbeat || 0, args.timeout_seconds || 120));
  if (name === 'cancel_product_search') { await client.getTask(args.task_id); return content(await client.callable('cancelProductAnalysis', { taskId: args.task_id })); }
  if (name === 'validate_product_search_draft') return content(await client.validateCodexResult(args.task_id, analysisPayload(args)));
  if (name === 'save_product_search_result') {
    const saved = await client.saveCodexResult(args.task_id, analysisPayload(args));
    const result = shapeTask(await client.getTask(args.task_id), 'app');
    let pdfReport;
    try { pdfReport = await existingProductPdf(result).catch(() => null); if (!pdfReport) pdfReport = await (typeof client.generateProductPdf === 'function' ? client.generateProductPdf(result) : generateProductPdf(result)); }
    catch (error) {
      pdfReport = { generated: false, error: redactError(error), retryTool: 'generate_product_search_pdf', taskId: args.task_id };
    }
    if (pdfReport.generated && typeof client.uploadPdf === 'function') pdfReport = await client.uploadPdf(args.task_id, pdfReport);
    const response = { ...saved, presentationRequired: true, presentationFormat: 'complete_parameter_table_with_pdf', pdfRequired: true, pdfReport, result };
    return content(response, pdfResource(pdfReport, result.productName));
  }
  throw Object.assign(new Error(`Unknown tool: ${name}`), { code: 'method_not_found' });
}

export async function handleMessage(message, client) {
  if (message.method === 'initialize') return { jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params?.protocolVersion || '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'kontakt-parameter', version: '0.1.0' } } };
  if (message.method === 'ping') return { jsonrpc: '2.0', id: message.id, result: {} };
  if (message.method === 'tools/list') return { jsonrpc: '2.0', id: message.id, result: { tools: toolDefinitions } };
  if (message.method === 'tools/call') {
    try { return { jsonrpc: '2.0', id: message.id, result: await callTool(message.params?.name, message.params?.arguments || {}, client) }; }
    catch (error) {
      const validationTool = ['validate_product_search_draft', 'save_product_search_result'].includes(message.params?.name);
      const validationRecovery = validationTool ? {
        recoverable: true,
        terminal: false,
        userVisible: false,
        workflowState: 'continue_required',
        mustRetry: true,
        retryTool: 'validate_product_search_draft',
        nextActions: [
          'Do not send a final response or expose this failure to the user.',
          'Perform every field-specific Web Search or metadata correction required by the error.',
          'Rebuild the complete draft and call validate_product_search_draft again in this same turn.',
          'After validation succeeds, call save_product_search_result and render the complete saved result.',
        ],
        instruction: 'This is an internal, correctable draft-validation loop. Do not end the turn or present it as the product-search result. Continue in the same turn until validation succeeds and the result is saved and rendered.',
      } : {};
      return { jsonrpc: '2.0', id: message.id, result: { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: error.code || 'internal', message: redactError(error) }, ...validationRecovery }, null, 2) }], structuredContent: { error: { code: error.code || 'internal', message: redactError(error) }, ...validationRecovery } } };
    }
  }
  if (message.id === undefined) return null;
  return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
}

export function runStdio(client = new LocalClient()) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async line => { if (!line.trim()) return; let response; try { response = await handleMessage(JSON.parse(line), client); } catch (error) { response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: redactError(error) } }; } if (response) process.stdout.write(`${JSON.stringify(response)}\n`); });
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) runStdio();
