import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParameterRows } from '../mcp/presentation.mjs';
import { buildPdfData } from '../mcp/pdf.mjs';
import { shapeTask } from '../mcp/firestore.mjs';

test('chat and PDF attach only evidence for the saved field and value', () => {
  const task = {
    category: 'fridge', finalParams: { Brend: 'Teka', Rəng: 'Ağ', Displey: '—' },
    scrapedData: { results: [
      { url: 'https://manufacturer.example/specs', parameters: { Brend: 'Teka', Rəng: 'Ağ', Displey: 'Var' }, fieldEvidence: { Rəng: { value: 'Ağ', sourceUrl: 'https://manufacturer.example/specs', supportingSources: [{ sourceUrl: 'https://review.example/model' }] } } },
      { url: 'https://other.example/black', parameters: { Rəng: 'Qara' } },
      { url: 'javascript:alert(1)', parameters: { Rəng: 'Ağ' } },
      { url: 'https://wrong-variant.example/model', exactModelMatch: false, parameters: { Rəng: 'Ağ' } },
    ] },
  };
  const app = shapeTask(task, 'app');
  const rows = buildParameterRows({ ...task, displayParams: task.finalParams });
  const color = rows.find(row => row.name === 'Rəng');
  assert.deepEqual(color.sources.map(source => source.url), ['https://manufacturer.example/specs', 'https://review.example/model']);
  assert.deepEqual(rows.find(row => row.name === 'Displey').sources, []);
  assert.deepEqual(app.parameterRows, rows);
  assert.deepEqual(buildPdfData(app, 'photo.jpg').parameters, rows);
});
