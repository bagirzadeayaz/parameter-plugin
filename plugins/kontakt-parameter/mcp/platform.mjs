const ENDPOINT = 'https://us-central1-kontakt-parameter.cloudfunctions.net/submitAnonymousPluginSearch';

export async function submitPlatform(task, action, payload, fetchImpl = fetch) {
  if (!task.platform?.capability) return null; // Never migrate historical local searches implicitly.
  const allowed = ['parametersAz', 'parametersRu', 'bilingualVersion', 'confidence', 'fieldEvidence', 'sources', 'productImages', 'unresolvedFields', 'notes', 'recoveryReport'];
  const research = payload ? Object.fromEntries(allowed.filter(key => payload[key] !== undefined).map(key => [key, payload[key]])) : null;
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({ data: { action, capability: task.platform.capability, productName: task.productName, category: task.category,
      ...(task.platform.pdfUploadEnabled ? { pdfUploadVersion: 1 } : {}),
      ...(action === 'pdf' ? { pdfBase64: payload?.pdfBase64 } : research ? { payload: research } : {}) } }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error?.message || 'Platform submission failed. Local data is retained.');
  const result = body.result || body.data;
  if (!result?.taskId || (action === 'validate' ? result.valid !== true : result.stored !== true)) throw new Error('Platform did not confirm storage. Local data is retained.');
  return result;
}
