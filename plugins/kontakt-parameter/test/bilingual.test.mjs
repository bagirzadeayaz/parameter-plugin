import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRussianValues as normalize } from '../mcp/bilingual.mjs';
import { categorySchemas } from '../mcp/schema.mjs';
import { shapeTask } from '../mcp/result.mjs';
import { buildPdfData } from '../mcp/pdf.mjs';
import catalog from '../mcp/bilingual-catalog.mjs';

test('all category fields have Russian labels and bilingual normalization guidance', () => {
  const schemas = categorySchemas(); assert.equal(Object.keys(schemas).length, 5);
  for (const fields of Object.values(schemas)) for (const field of fields) {
    assert.ok(/[А-Яа-яЁё]/.test(field.labelRu) || ['NFC','Wi-Fi'].includes(field.labelRu));
    assert.ok(field.normalization.russian.rule);
  }
});
test('all catalog examples retain numbers and have accepted Russian equivalents', () => {
  for (const [category, fields] of Object.entries(catalog)) for (const [field, examples] of Object.entries(fields)) for (const example of examples) {
    assert.notEqual(normalize({ [field]: example.az }, { [field]: example.ru }, category, { strict: true })[field], '—');
  }
});
test('Russian catalogue units, appliance terminology and missing values', () => {
  assert.deepEqual(normalize({ 'Şəbəkə': 'Yox', 'Daxili yaddaş': '256 GB', 'Çəki': '510 qr' }, {}, 'tablet', {strict:true}), {'Şəbəkə':'Нет','Daxili yaddaş':'256 ГБ','Çəki':'510 г'});
  assert.deepEqual(normalize({ 'Növ':'İkikameralı', 'Quraşdırılma növü':'Quraşdırılan', 'Toplam faydalı həcm':'243 lt', 'Rəflərin materialı':'Şüşə' }, {}, 'fridge', {strict:true}), {'Növ':'Двухкамерный','Quraşdırılma növü':'Встраиваемый','Toplam faydalı həcm':'243 л','Rəflərin materialı':'Стеклянный'});
  assert.equal(normalize({'Maksimal sıxma sürəti':'1400 dövr/dəq'}, {}, 'washing_machine', {strict:true})['Maksimal sıxma sürəti'], '1400 об/мин');
  assert.equal(normalize({'NFC':'—'}, {'NFC':'Есть'}, 'phone').NFC,'—');
  assert.throws(()=>normalize({'Daxili yaddaş':'128 GB'},{'Daxili yaddaş':'256 ГБ'},'phone',{strict:true}));
  assert.throws(()=>normalize({'Komplektasiya':'Naməlum mətn'}, {}, 'tablet',{strict:true}));
});
test('chat and PDF share Russian rows without AZ fallback or doubled evidence', () => {
  const app = shapeTask({ category:'tablet', scrapedParams:{ 'Şəbəkə':'Yox', 'Daxili yaddaş':'256 GB' }, scrapedParamsRU:{ 'Şəbəkə':'Нет','Daxili yaddaş':'256 ГБ' }, scrapedData:{results:[{url:'https://example.com/spec',parameters:{'Şəbəkə':'Yox'}}]} }, 'app');
  assert.equal(app.displayParamsRU['Şəbəkə'],'Нет');
  assert.match(app.parameterTableMarkdown,/AZ \| RU/);
  assert.equal(app.parameterTableMarkdown.split('\n')[0], '| № | Parametr | AZ | RU | Mənbə |');
  assert.match(app.parameterTableMarkdown, /Daxili yaddaş<br>Внутренняя память/);
  assert.match(app.parameterTableMarkdown, /256 GB \| 256 ГБ/);
  assert.deepEqual(buildPdfData(app,'image.png').parameters,app.parameterRows);
  assert.equal(app.parameterRows.find(r=>r.name==='Şəbəkə').sources.length,1);
});
