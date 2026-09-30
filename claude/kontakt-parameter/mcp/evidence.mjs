// Validation checks submitted evidence consistency; it cannot authenticate web calls
// or prove that an arbitrary natural-language quotation entails a claim.
const present = value => value != null && !/^(?:\s*|—|–|-|null|undefined)$/i.test(String(value).trim());
export const sourceUrl = source => typeof source === 'string' ? source : source?.url || source?.source_url || source?.sourceUrl || '';
export function canonicalSource(source) {
  return { ...(typeof source === 'object' && source || {}), url: sourceUrl(source) };
}
export function canonicalEvidence(evidence = {}) {
  return Object.fromEntries(Object.entries(evidence && typeof evidence === 'object' ? evidence : {}).map(([field, raw]) => [field, {
    ...raw, source_url: sourceUrl(raw),
    supporting_sources: (Array.isArray(raw?.supporting_sources || raw?.supportingSources) ? raw.supporting_sources || raw.supportingSources : []).map(canonicalSource),
  }]));
}
const comparable = value => String(value).trim().toLocaleLowerCase('az').replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ');
function masses(text) {
  return [...String(text).replace(/(\d),(\d)/g, '$1.$2').matchAll(/(\d+(?:\.\d+)?)\s*(kg|kq|кг|grams?|qr|г|g|lbs?|pounds?|oz)(?![\p{L}])/giu)]
    .map(([, value, unit]) => Number(value) * (/^(kg|kq|кг)$/i.test(unit) ? 1 : /^(lbs?|pounds?)$/i.test(unit) ? 0.45359237 : /^oz$/i.test(unit) ? 0.028349523125 : 0.001));
}
export function evidenceIssues(parameters, rawEvidence = {}, recovery = {}, { derivedFields = [] } = {}) {
  const evidence = canonicalEvidence(rawEvidence);
  const opened = new Set(recovery.openedSourceUrls || []);
  const issues = [];
  for (const [field, value] of Object.entries(parameters || {})) {
    if (!present(value)) continue;
    const proof = evidence[field];
    if (!proof && derivedFields.includes(field)) continue;
    const fail = reason => issues.push({ field, reason });
    if (!proof) { fail('Filled value requires field evidence.'); continue; }
    if (!present(proof.value)) fail('Evidence must retain the submitted claim in value.');
    else if (comparable(proof.value) !== comparable(value)) fail('Evidence value differs from the submitted value.');
    if (proof.confidence === 'unresolved') fail('Filled value cannot have unresolved evidence.');
    try { if (!['http:', 'https:'].includes(new URL(proof.source_url).protocol)) throw new Error(); }
    catch { fail('Evidence requires a valid HTTP source URL.'); }
    if (!opened.has(proof.source_url)) fail('Evidence source must appear in openedSourceUrls.');
    const visual = ['product_photo', 'label_photo', 'manual_image', 'pdf_image'].includes(proof.evidence_kind || proof.evidenceKind);
    const passage = visual ? proof.visible_detail || proof.visibleDetail : proof.quote;
    if (!present(passage)) fail(visual ? 'Image evidence requires a visible detail.' : 'Text evidence requires a source quotation.');
    // Weight has an unambiguous physical unit. Do not apply naive numeric matching
    // to processor names, clocks, port counts, or other compound specifications.
    if (field === 'Çəki' && !visual && present(passage)) {
      const claimed = masses(value), quoted = masses(passage);
      if (claimed.length === 1 && !quoted.some(mass => Math.abs(mass - claimed[0]) <= Math.max(0.001, claimed[0] * 0.005)))
        fail('Weight quotation must contain the claimed weight or an equivalent unit conversion.');
    }
  }
  return issues;
}
export function assertFieldEvidence(parameters, evidence, recovery, options) {
  const issues = evidenceIssues(parameters, evidence, recovery, options);
  if (issues.length) throw Object.assign(new Error(issues.map(({ field, reason }) => `${field}: ${reason}`).join(' ')), { code: 'failed-precondition', fieldIssues: issues });
}
