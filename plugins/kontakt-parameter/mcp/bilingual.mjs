

// AZ remains the evidence key; RU is a localized view of the same fact.
import catalog from './bilingual-catalog.mjs';
const missing = value => value == null || /^(?:\s*|—|–|-|null|undefined)$/i.test(String(value).trim());
const overrides = {
  'Var': 'Есть', 'Yox': 'Нет', 'Ağ': 'Белый', 'Qara': 'Черный', 'Boz': 'Серый', 'Gümüşü': 'Серебристый',
  'Solo': 'Отдельностоящий', 'Quraşdırılan': 'Встраиваемый', 'İkikameralı': 'Двухкамерный', 'Birkameralı': 'Однокамерный',
  'Butulka soyuducusu': 'Холодильник для бутылок', 'Elektron': 'Электронный', 'Mexaniki': 'Механический', 'Sensor': 'Сенсорный',
  'Aşağıda': 'Снизу', 'Yuxarıda': 'Сверху', 'Yanda': 'Сбоку', 'İnvertor': 'Инверторный', 'İnvertor-xətti': 'Линейно-инверторный', 'Sadə': 'Обычный',
  'Şüşə': 'Стеклянный', 'Metal': 'Металлический', 'Plastik': 'Пластиковый', 'Gizli': 'Скрытый', 'Xarici': 'Внешний',
  'Frontal': 'Фронтальная', 'Şaquli': 'Вертикальная', 'Yuyan': 'Стиральная', 'Yuyan-qurudan': 'Стирально-сушильная',
  'Türkiyə': 'Турция', 'Çin': 'Китай', 'Polşa': 'Польша', 'Almaniya': 'Германия', 'İtaliya': 'Италия', 'Rusiya': 'Россия',
};
const key = value => String(value).trim().toLocaleLowerCase('az');
const units = value => String(value)
  .replace(/\bVt\*s\b/g, 'Вт*ч').replace(/\bdövr\/dəq\b/g, 'об/мин').replace(/kadr\/s/g, 'кадр/с')
  .replace(/(\d)\s*(GB|TB|GHz|MHz|Hz|mAh|Vt|mm|sm|kq|qr|lt|dB)\b/g, (_, n, u) => n + ' ' + ({GB:'ГБ',TB:'ТБ',GHz:'ГГц',MHz:'МГц',Hz:'Гц',mAh:'мАч',Vt:'Вт',mm:'мм',sm:'см',kq:'кг',qr:'г',lt:'л',dB:'дБ'}[u]));
const numbers = value => JSON.stringify(String(value).replace(/(\d),(\d)/g, '$1.$2').match(/\d+(?:\.\d+)?/g) || []);

export function normalizeRussianValues(az, ru = {}, category, { strict = false } = {}) {
  const result = {}; const errors = [];
  for (const [field, value] of Object.entries(az)) {
    if (missing(value)) { result[field] = '—'; continue; }
    if (['Brend', 'Model', 'Seriya'].includes(field)) { result[field] = String(value); continue; }
    const hit = catalog[category]?.[field]?.find(pair => key(pair.az) === key(value));
    const material = { 'Şüşə': 'Стекло', 'Metal': 'Металл', 'Plastik': 'Пластик', 'Alüminium': 'Алюминий', 'Alüminium və şüşə': 'Алюминий и стекло', 'Alüminium, plastik': 'Алюминий, пластик' };
    let translated = (field === 'Korpusun materialı' ? material[value] : null) || overrides[value] || hit?.ru;
    // Catalogues occasionally contain AZ strings in RU cells: never repeat that error.
    if (translated && /[əğıİ]/.test(translated)) translated = null;
    const converted = units(value);
    if (!translated && (converted !== value || /^[\d\s.,+×/"%–-]+$/.test(value))) translated = converted;
    if (!translated && !missing(ru[field])) translated = units(ru[field]);
    if (!translated && !/[əğıİşçöü]/i.test(value) && !['Növ','Quraşdırılma növü','İdarəetmə növü','Komplektasiya','Korpusun materialı','Əlavə xüsusiyyətlər','Xüsusiyyətlər','Klaviaturanın dili','Kateqoriya','İstehsalçı ölkə','Rəflərin materialı','Tutacaqların növü','Mühərrik növü','Kompressor tipi','Videokartın növü'].includes(field)) translated = value;
    if (!translated || /[əğıİ]/.test(translated) || numbers(translated) !== numbers(value)) {
      errors.push(field); result[field] = '—';
    } else result[field] = units(translated).replace(/МП/g, 'MP');
    if (!missing(ru[field]) && numbers(ru[field]) !== numbers(value)) errors.push(field);
    if (!missing(ru[field]) && ['Var', 'Yox'].includes(value) && ![value, overrides[value], value === 'Var' ? 'Да' : 'Нет'].includes(String(ru[field]).trim())) errors.push(field);
    const expectedUnits = units(value).match(/ГБ|ТБ|ГГц|МГц|мАч|Вт\*ч|Вт|кг|мм|см/g);
    const submittedUnits = units(ru[field] || '').match(/ГБ|ТБ|ГГц|МГц|мАч|Вт\*ч|Вт|кг|мм|см/g);
    if (expectedUnits && submittedUnits && JSON.stringify(expectedUnits) !== JSON.stringify(submittedUnits)) errors.push(field);
  }
  if (strict && errors.length) throw Object.assign(new Error(`Provide an equivalent Russian catalogue value for: ${[...new Set(errors)].join(', ')}. Keep the same numbers, units, variant and facts.`), { code: 'failed-precondition' });
  return result;
}
