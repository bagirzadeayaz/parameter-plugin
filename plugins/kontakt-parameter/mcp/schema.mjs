import { readFileSync } from 'node:fs';
import { normalizeRussianValues } from './bilingual.mjs';

const schemas = JSON.parse(readFileSync(new URL('../schemas.json', import.meta.url), 'utf8'));

const booleanRule = { format: 'Kontakt boolean', example: 'Var / Yox' };
const textRule = example => ({ format: 'Short Kontakt catalogue value; no sentence or explanation', example });
const unitRule = (format, example) => ({ format, example });

const CATEGORY_DIRECT_VISUAL_RULES = Object.freeze({
  phone: Object.freeze({
    'Rəng': 'Use a neutral, well-lit exact-product image.',
    'Enerji toplama növü': 'The charging connector must be clearly visible.',
    'Qulaqlıq interfeysi': 'The complete connector edge must be visible.',
    'Barmaq izi oxuyucusu': 'Its physical location must be directly visible; an under-display reader cannot be inferred from appearance.',
    'Korpusun materialı': 'The material must be visually unambiguous or explicitly identified in the image.',
    'Komplektasiya': 'Every claimed item must be visibly present in an exact-variant box-contents image.',
  }),
  tablet: Object.freeze({
    'Rəng': 'Use a neutral, well-lit exact-product image.',
    'Girişlər': 'The complete relevant device edges must clearly show the ports.',
    'Korpusun materialı': 'The material must be visually unambiguous or explicitly identified in the image.',
    'Barmaq izi oxuyucu': 'A physical reader must be clearly visible; an under-display reader cannot be inferred.',
    'Komplektasiya': 'Every claimed item must be visibly present in an exact-variant box-contents image.',
    'Qulaqlıq üçün giriş': 'The complete connector edge must clearly show the port.',
  }),
  notebook: Object.freeze({
    'Rəng': 'Use a neutral, well-lit exact-product image.',
    'Klaviaturanın dili': 'The complete keyboard legends must be readable.',
    '360 dərəcə fırlanma': 'A complete exact-product image must directly show the 360-degree folded configuration.',
    'Girişlər': 'All relevant sides must be visible before listing the ports.',
  }),
  fridge: Object.freeze({
    'Növ': 'The complete appliance layout must clearly establish one or two chambers.',
    'Quraşdırılma növü': 'The installation context or cabinet construction must clearly establish solo or built-in installation.',
    'Rəng': 'Use a neutral, well-lit exact-product image.',
    'Qapıların sayı': 'The complete exterior or open appliance must show every door division.',
    'Buz generatoru': 'A concrete ice-making component must be visible; absence requires every likely area to be visible.',
    'İdarəetmə növü': 'The actual knob, touch panel, or hybrid control must be visible.',
    'Dondurucu kameranın yerləşməsi': 'The freezer position must be directly visible.',
    'Rəflərin materialı': 'An open, unobstructed interior must clearly show the shelves.',
    'Displey': 'Presence requires a visible display; absence requires every possible display area to be visible.',
    'Tutacaqların növü': 'The complete handle area must show a protruding or integrated handle.',
    'Təravət bölməsi': 'The full lower refrigerator interior must be visible.',
    'Kameraların sayı': 'Every separately accessible compartment must be exposed.',
  }),
  washing_machine: Object.freeze({
    'Quraşdırılma növü': 'The complete appliance and installation construction must establish solo or built-in installation.',
    'Displey': 'Presence requires a visible display; absence requires a complete control-panel view.',
    'Rəng': 'Use a neutral, well-lit exact-product image.',
    'Yükləmə növü': 'The complete appliance must clearly show a front or top-loading door.',
    'Qalıq zamanın göstəricisi': 'A powered display must visibly show a remaining-time indicator.',
  }),
});

function visualRule(category, field) {
  const directRule = CATEGORY_DIRECT_VISUAL_RULES[category]?.[field];
  if (directRule) return {
    eligible: true,
    mode: 'direct_product_photo',
    minimumConfidence: 0.88,
    requirement: directRule,
  };
  return {
    eligible: true,
    mode: 'readable_exact_model_label_only',
    minimumConfidence: 0.9,
    requirement: 'Do not infer this technical value from appearance. Accept it only when readable text on an exact-model label, specification image, manual page, or energy label explicitly states the value.',
  };
}

const CATEGORY_RULES = {
  phone: {
    'Brend': textRule('Apple'), 'Daxili yaddaş': unitRule('Capacity with a space before GB/TB', '128 GB'), 'Operativ yaddaş': unitRule('Capacity with a space before GB', '8 GB'),
    'Əsas kamera': unitRule('Lens resolutions joined with space-plus-space; MP on every value', '48 MP + 12 MP'), 'Ön kamera': unitRule('Resolution with MP', '12 MP'), 'Nüvə sayı': unitRule('Integer only', '8'),
    'SIM-kart növü': textRule('Nano SIM + eSIM / Nano SIM + multi eSIM'), 'SIM-kart sayı': unitRule('Physical SIM count as an integer', '1'), 'Prosessorun adı': textRule('Qualcomm'),
    'Əməliyyat sistemi': textRule('Android'), 'Əməliyyat sistemin versiyası': textRule('Android 15'), 'NFC': booleanRule, 'Prosessorun növü': textRule('Qualcomm Snapdragon 8 Elite'),
    'Displey növü': unitRule('Canonical panel name; preserve meaningful subtype such as Dynamic LTPO, LTPO 8T, Plus, XDR, or 2X', 'pOLED / Dynamic LTPO AMOLED 2X / LTPO 8T AMOLED'), 'Simsiz enerji': booleanRule, 'İnfraqırmızı port': booleanRule, 'Üz tanıma': booleanRule, 'Sürətli enerji yığma': booleanRule,
    'Qorunma dərəcəsi': textRule('IPX8 / IP68 / IP69K'), 'Görüntü imkanı': unitRule('Width × height, no px suffix; preserve main / cover display pairs', '1856 × 2160 / 968 × 2376'), 'Ölçülər': unitRule('H × E × D in mm; preserve unfolded / folded pairs', '153.5 × 132.6 × 5.6 mm / 153.5 × 68.1 × 12.1 mm'),
    'Yaddaş kartı dəstəyi': booleanRule, 'Giroskop': booleanRule, 'İşıq sensoru': booleanRule, 'Yaxınlaşdırma sensoru': booleanRule, 'Optik sabitləşmə': booleanRule,
    'Video formatı': unitRule('Single highest supported recording quality only', '4K'), 'Bluetooth versiyası': unitRule('Version number only', '5.3'), 'Avtofokus əsas kamera': booleanRule,
    'Video icazəsi və kadr tezliyi': unitRule('Highest recording quality + minimum-maximum frame rate', '4K, 24-240 kadr/s'), 'Video asta çəkiliş': booleanRule, 'Rəng': textRule('Black'),
    'Enerji toplama növü': textRule('USB Type-C'), 'Qulaqlıq interfeysi': textRule('USB Type-C'), 'Batareya növü': textRule('Li-Ion'), 'Akselerometr': booleanRule,
    'Enerji yığma gücü': unitRule('Number + space + Vt', '30 Vt'), 'İstehsal ili': unitRule('Four-digit year', '2026'), 'Barmaq izi oxuyucusu': unitRule('Kontakt location value, Var, or Yox', 'Displeydə / Korpusda / Var / Yox'),
    'Korpusun materialı': textRule('Alüminium və şüşə'), 'Komplektasiya': textRule('Smartfon, USB Type-C naqili, təlimat kitabçası'),
    'Akkumulyatorun tutumu': unitRule('Number + space + mAh', '5000 mAh'), 'Seriya': textRule('iPhone 16'), 'Çəki': unitRule('Number + space + qr', '170 qr'),
    'Şəbəkə standartı': unitRule('Single highest supported mobile network generation only', '5G'), 'Ekran': unitRule('Decimal + double-quote; for foldables preserve main/internal + cover/external diagonals in that order, separated by space-slash-space', '6.7" / 3.4"'),
  },
  tablet: {
    'Brend': textRule('Samsung'), 'Seriya': textRule('Samsung Galaxy Tab A11'), 'Ekranın diaqonalı': unitRule('Decimal + double-quote', '8.7"'),
    'Əməliyyat sistemi': textRule('Android'), 'Əməliyyat sisteminin versiyası': textRule('Android 15'), 'Prosessorun adı': textRule('MediaTek Helio G99'),
    'Prosessorun tezliyi': unitRule('Maximum clock, number + space + GHz', '2.2 GHz'), 'Ekran görüntüsü': unitRule('Width × height, no px suffix', '800 × 1340'),
    'Daxili yaddaş': unitRule('Capacity with a space before GB/TB', '128 GB'), 'Akkumulyatorun tutumu': unitRule('Number + space + mAh', '5100 mAh'),
    'Operativ yaddaş': unitRule('Capacity with a space before GB', '8 GB'), 'Ön kamera': unitRule('Resolution with MP', '5 MP'), 'Əsas kamera': unitRule('Lens resolutions joined with space-plus-space', '13 MP + 8 MP'),
    'Video keyfiyyəti': textRule('4K / 1080p'), 'Bluetooth versiyası': unitRule('Version number only', '5.3'), 'WiFi standartları': textRule('Wi-Fi 6 (802.11ax)'),
    'Qorunma dərəcəsi': textRule('IP68'), 'Yaddaş kartı dəstəyi': booleanRule, 'Displey növü': unitRule('Canonical panel name; preserve meaningful subtype', 'OLED / IPS LCD / TFT LCD / pOLED'), 'Korpusun materialı': textRule('Alüminium, plastik'),
    'Barmaq izi oxuyucu': booleanRule, 'Üz tanıma': booleanRule, 'Naviqasiya sistemi': unitRule('Comma-separated systems; preserve iBeacon and rəqəmsal kompas when evidenced', 'GPS, GLONASS, Galileo, BDS, QZSS'), 'SIM kartın sayı': unitRule('Integer, or Yox for Wi-Fi-only models', '1'),
    'Girişlər': unitRule('Comma-separated ports; preserve USB-C generation and Thunderbolt', 'USB-C 4 (Thunderbolt 3), 3.5 mm (mini-jack)'), 'Nüvə sayı': unitRule('Integer only', '8'), 'Buraxılış ili': unitRule('Four-digit year', '2025'), 'Şəbəkə': textRule('GSM / HSPA / LTE / 5G'),
    'Komplektasiya': textRule('Planşet, USB Type-C naqili, təlimat kitabçası'), 'Stilus (qələm) ilə istifadənin dəstəklənməsi': booleanRule, 'Rəng': textRule('Grey'),
    'SIM kartın növü': textRule('Nano SIM + eSIM'), 'Qrafik prosessor': textRule('Mali-G57 MC2'), 'Kadr tezliyi': unitRule('Maximum video frame rate + space + kadr/s', '240 kadr/s'),
    'Fləş': booleanRule, 'Avtofokus': booleanRule, 'Optik sabitləşmə': booleanRule, 'Çəki': unitRule('Number + space + qr', '335 qr'),
    'Videonun asta çəkilişi': booleanRule, 'Zəng funksiyası': booleanRule, 'Giroskop': booleanRule, 'Qulaqlıq üçün giriş': textRule('3.5 mm (mini jack)'),
    'Enerji yığma gücü': unitRule('Number + space + Vt', '25 Vt'), 'Sürətli enerji yığma': booleanRule, 'Ölçülər': unitRule('H × E × D in mm', '211 × 124.7 × 8 mm'),
  },
  notebook: {
    'Brend': textRule('Lenovo'), 'Model': textRule('LOQ 15ARP9'), 'Videokartın növü': textRule('Xarici NVIDIA'), 'Wi-Fi': textRule('Wi-Fi 6 (802.11ax)'),
    'Sensorlu ekran': booleanRule, '360 dərəcə fırlanma': booleanRule, 'Klaviaturanın dili': textRule('İngilis, rus'), 'Rəng': textRule('Luna Grey'),
    'Çəki': unitRule('Number + space + kq', '2.38 kq'), 'Kateqoriya': textRule('Oyun'), 'Ölçülər': unitRule('E × D × H in mm', '359.86 × 258.7 × 23.9 mm'),
    'Veb-kamera': textRule('1 MP (720p)'), 'Prosessor': textRule('AMD Ryzen 7 7435HS, 3.1 - 4.5 GHz'),
    'Akkumulyatorun tutumu': unitRule('Wh as Vt*s, optionally followed by runtime', '60 Vt*s, 3.8 saatadək'),
    'Operativ yaddaş': textRule('DDR5 24GB, 4800 MHz'), 'Daxili yaddaş': textRule('SSD 1 TB'), 'Videokart': textRule('GeForce RTX 4060, 8 GB'),
    'Displey': textRule('FullHD (1920 × 1080), 144 Hz'), 'Ekranın diaqonalı': unitRule('Decimal + double-quote', '15.6"'),
    'Əməliyyat sistemi': textRule('Win11 Home'), 'Girişlər': textRule('3× USB 3.2 Gen 1 Type-A, USB 3.2 Gen 2 Type-C, HDMI, Ethernet (RJ-45)'),
  },
  fridge: {
    'Brend': textRule('Electrolux'), 'Növ': textRule('İkikameralı / Butulka soyuducusu for an evidenced commercial cooler'),
    'Toplam faydalı həcm': { ...unitRule('Number + space + lt', '288 lt'), meaning: 'Total net/usable capacity. Do not compare it with gross/nominal total capacity.' },
    'Soyuducu kameranın faydalı həcmi': { ...unitRule('Number + space + lt', '216 lt'), meaning: 'Net/usable refrigerator-compartment capacity. Do not compare it with a gross compartment capacity.' },
    'Dondurucu kameranın faydalı həcmi': { ...unitRule('Number + space + lt', '72 lt'), meaning: 'Net/usable freezer-compartment capacity. Do not compare it with a gross compartment capacity.' },
    'Əritmə sistemi': textRule('No Frost'), 'Səs səviyyəsi': unitRule('Number + space + dB', '35 dB'), 'Enerji istifadə sinfi': textRule('A++'),
    'Quraşdırılma növü': textRule('Quraşdırılan'), 'Rəng': textRule('Ağ'), 'Qapıların sayı': unitRule('Integer only', '2'), 'Buz generatoru': booleanRule,
    'İdarəetmə növü': textRule('Elektron'), 'Əlavə xüsusiyyətlər': textRule('Humidity Control, Fresh Zone'), 'Dondurucu kameranın yerləşməsi': textRule('Aşağıda'),
    'Hündürlük': unitRule('Number + space + sm', '188.4 sm'), 'En': unitRule('Number + space + sm', '54 sm'), 'Dərinlik': unitRule('Number + space + sm', '54.9 sm'),
    'Kompressor tipi': textRule('İnvertor / İnvertor-xətti / Sadə'), 'Qapı istiqamətinin dəyişdirilməsi': booleanRule, 'İqlim sinfi': { ...textRule('SN, N, ST, T / SN-T / commercial class 4 or CC2'), meaning: 'Keep the source classification system; numeric commercial climate class 4 and cabinet class CC2 are not interchangeable.' },
    'Rəflərin materialı': textRule('Şüşə / Şüşə, Plastik / Metal'), 'Displey': booleanRule, 'Tutacaqların növü': textRule('Gizli'), 'Təravət bölməsi': booleanRule,
    'Kameraların sayı': unitRule('Integer only', '2'), 'Ölçülər (H × E × D)': unitRule('H × E × D in sm', '188.4 × 54 × 54.9 sm'),
    'İstehsalçı ölkə': textRule('Türkiyə'),
    'Toplam həcm': { ...unitRule('Number + space + lt', '300 lt'), meaning: 'Gross/nominal total capacity. It may legitimately be larger than Toplam faydalı həcm.' },
  },
  washing_machine: {
    'Brend': textRule('Samsung'), 'İstehsalçı ölkə': textRule('Polşa'), 'Buxarla yuma': booleanRule, 'Quraşdırılma növü': textRule('Solo'),
    'Camaşırların maksimum yüklənməsi': unitRule('Number + space + kq', '9 kq'), 'Qurutma növü': booleanRule,
    'Çamaşırların qurutma zamanı maksimum yüklənməsi': unitRule('Number + space + kq, or Yox', '6 kq'),
    'Ölçülər (H × E × D)': unitRule('H × E × D in sm', '85 × 60 × 59.5 sm'), 'Displey': booleanRule, 'Enerji istifadə sinfi': textRule('A+++'),
    'Proqramların sayı': unitRule('Integer only', '23'), 'Yuma sinfi': textRule('A'), 'Sıxma sürəti sinfi': textRule('B'),
    'Maksimal sıxma sürəti': unitRule('Integer + space + dövr/dəq', '1400 dövr/dəq'), 'Sıxma sürətinin seçimi': booleanRule,
    'Rəng': textRule('Qara'), 'Xüsusiyyətlər': textRule('Eco Bubble, Smart Things'), 'Yuma zamanı yükləmə imkanı': booleanRule,
    'Dərinlik': unitRule('Number + space + sm', '59.5 sm'), 'Gecikdirilmiş start': booleanRule, 'Qalıq zamanın göstəricisi': booleanRule,
    'Yuma zamanı səs səviyyəsi': unitRule('Number + space + dB', '53 dB'), 'Sıxma zamanı səs səviyyəsi': unitRule('Number + space + dB', '74 dB'),
    'Hündürlük': unitRule('Number + space + sm', '85 sm'), 'En': unitRule('Number + space + sm', '60 sm'), '"Uşaq geyiminin yuyulması" proqramı': booleanRule,
    'Yuma zamanı su sərfiyyatı': unitRule('Number + space + lt', '54 lt'), 'Wi-Fi': booleanRule, 'Növ': textRule('Yuyan'), 'Yükləmə növü': textRule('Frontal'),
    'Uşaq kilidi': booleanRule, 'Mühərrik növü': textRule('İnvertor'),
  },
};

function fieldsWithRules(category, fields) {
  const rules = CATEGORY_RULES[category];
  if (!rules) throw Object.assign(new Error('Unsupported product category.'), { code: 'invalid_argument' });
  return fields.map(field => {
    const normalization = rules[field.key];
    if (!normalization) throw new Error(`Missing Kontakt normalization rule for ${category}:${field.key}`);
    return {
      ...field,
      normalization: { ...normalization, unresolvedValue: '—', russian: { label: field.labelRu, example: normalizeRussianValues({ [field.key]: normalization.example }, {}, category)[field.key], rule: 'Translate the same fact into compact Russian catalogue wording. Preserve all numbers, variants and evidence. Есть/Нет; ГБ, ТБ, ГГц, МГц, Гц, мАч, Вт, Вт*ч, г, кг, мм, см, л, дБ, об/мин, кадр/с. International model/technology names remain unchanged. Unresolved: — in both languages.' } },
      imageAnalysis: visualRule(category, field.key),
    };
  });
}

export function getCategorySchema(category) {
  const rawFields = schemas[category];
  if (!Array.isArray(rawFields)) throw Object.assign(new Error('Unsupported product category.'), { code: 'invalid_argument' });
  const fields = fieldsWithRules(category, rawFields);
  return {
    category,
    fieldCount: fields.length,
    fields,
    normalizationTemplate: 'kontakt.az',
    normalizationAppliedOnSave: true,
    allFieldsHaveNormalizationRules: true,
    imageAnalysis: {
      enabled: true,
      scope: 'all_supported_categories',
      directProductPhotoFields: Object.keys(CATEGORY_DIRECT_VISUAL_RULES[category] || {}),
      labelOnlyFields: fields.filter(field => !CATEGORY_DIRECT_VISUAL_RULES[category]?.[field.key]).map(field => field.key),
    },
  };
}

export function categorySchemas() {
  return Object.fromEntries(Object.entries(schemas).map(([category, fields]) => [category, fieldsWithRules(category, fields)]));
}
