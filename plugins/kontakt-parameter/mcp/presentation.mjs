import { normalizeRussianValues } from './bilingual.mjs';
import { getCategorySchema } from './schema.mjs';

function publicLink(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function renderParameterTable(rows) {
  const cell = value => String(value ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  return ['| № | Parametr / Параметр | AZ | RU | Mənbə / Источник |', '|---:|---|---|---|---|', ...rows.map((row, index) => {
    const proof = row.sources.map(source => `[${cell(source.label)}](<${source.url.replace(/>/g, '%3E').replace(/</g, '%3C')}>)`).join(' · ')
      || (row.value === '—' ? '—' : 'Mənbə yoxdur / Нет источника');
    return `| ${index + 1} | ${cell(row.name)}<br>${cell(row.nameRu)} | ${cell(row.value)} | ${cell(row.valueRu)} | ${proof} |`;
  })].join('\n');
}

export function buildParameterRows(result) {
  const values = result?.displayParams || {};
  const fields = getCategorySchema(result?.category).fields;
  const schema = fields.map(field => field.key);
  const ru = normalizeRussianValues(values, result?.displayParamsRU || result?.scrapedParamsRU, result?.category);
  const keys = [...schema.filter(key => Object.hasOwn(values, key)), ...Object.keys(values).filter(key => !schema.includes(key))];
  const evidenceRows = result?.scrapedData?.results || [];
  return keys.map(name => {
    const value = values[name] ?? '—';
    const links = new Map();
    const add = (url, title) => {
      const safe = publicLink(url);
      if (safe && !links.has(safe)) links.set(safe, { url: safe, label: new URL(safe).hostname.replace(/^www\./, ''), title: title || '' });
    };
    if (value !== '—' && String(value).trim()) {
      for (const row of evidenceRows) {
        if (row.exactModelMatch === false) continue;
        const evidence = (row.fieldEvidence || row.evidence || {})[name];
        const supported = (row.parameters || row.params || {})[name] ?? evidence?.value;
        if (String(supported ?? '') !== String(value)) continue;
        add(evidence?.sourceUrl || evidence?.source_url || row.sourceUrl || row.url, row.title);
        for (const source of evidence?.supportingSources || evidence?.supporting_sources || []) {
          if (source?.exactModelMatch === false || source?.exact_model_match === false) continue;
          add(typeof source === 'string' ? source : source.sourceUrl || source.source_url || source.url, source.title);
        }
      }
    }
    return { name, nameRu: fields.find(field => field.key === name)?.labelRu || name, value, valueRu: ru[name] || '—', sources: [...links.values()] };
  });
}
