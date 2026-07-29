/* Campos medidos e fórmulas derivadas. */

export const CIRCS = [
  { key: 'neck',      label: 'Pescoço' },
  { key: 'shoulder',  label: 'Ombro' },
  { key: 'chest',     label: 'Tórax' },
  { key: 'waist',     label: 'Cintura' },
  { key: 'abdomen',   label: 'Abdômen' },
  { key: 'hip',       label: 'Quadril' },
  { key: 'armR',      label: 'Braço D' },
  { key: 'armL',      label: 'Braço E' },
  { key: 'forearmR',  label: 'Antebraço D' },
  { key: 'forearmL',  label: 'Antebraço E' },
  { key: 'thighR',    label: 'Coxa D' },
  { key: 'thighL',    label: 'Coxa E' },
  { key: 'calfR',     label: 'Panturrilha D' },
  { key: 'calfL',     label: 'Panturrilha E' },
  { key: 'wrist',     label: 'Punho' },
];

export const FOLDS = [
  { key: 'triceps',     label: 'Tríceps' },
  { key: 'subscapular', label: 'Subescapular' },
  { key: 'chest',       label: 'Peitoral' },
  { key: 'midaxillary', label: 'Axilar média' },
  { key: 'suprailiac',  label: 'Suprailíaca' },
  { key: 'abdominal',   label: 'Abdominal' },
  { key: 'thigh',       label: 'Coxa' },
];

export const POSES = [
  { key: 'front', label: 'Frente' },
  { key: 'side',  label: 'Lado' },
  { key: 'back',  label: 'Costas' },
];

/* Métricas plotáveis. `inverse: true` = subir é ruim (peso, gordura, cintura). */
export const METRICS = [
  { key: 'weight',   label: 'Peso',            unit: 'kg', get: (m) => m.weight, inverse: true },
  { key: 'bodyFat',  label: '% de gordura',    unit: '%',  get: (m, d) => d.bodyFat, inverse: true },
  { key: 'fatMass',  label: 'Massa gorda',     unit: 'kg', get: (m, d) => d.fatMass, inverse: true },
  { key: 'leanMass', label: 'Massa magra',     unit: 'kg', get: (m, d) => d.leanMass },
  { key: 'bmi',      label: 'IMC',             unit: '',   get: (m, d) => d.bmi, inverse: true },
  { key: 'whr',      label: 'Cintura/quadril', unit: '',   get: (m, d) => d.whr, inverse: true },
  { key: 'whtr',     label: 'Cintura/altura',  unit: '',   get: (m, d) => d.whtr, inverse: true },
  { key: 'foldSum',  label: 'Soma das dobras', unit: 'mm', get: (m, d) => d.foldSum, inverse: true },
  ...CIRCS.map((c) => ({
    key: 'circ.' + c.key, label: c.label, unit: 'cm', group: 'Circunferências',
    get: (m) => m.circ?.[c.key],
    inverse: ['waist', 'abdomen', 'hip'].includes(c.key),
  })),
  ...FOLDS.map((f) => ({
    key: 'fold.' + f.key, label: 'Dobra ' + f.label.toLowerCase(), unit: 'mm', group: 'Dobras',
    get: (m) => m.folds?.[f.key], inverse: true,
  })),
];

export const metricByKey = (key) => METRICS.find((m) => m.key === key);

const num = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);

export function ageAt(birthdate, isoDate) {
  if (!birthdate) return null;
  const b = new Date(birthdate + 'T00:00:00');
  const d = new Date((isoDate || todayISO()) + 'T00:00:00');
  if (isNaN(b) || isNaN(d)) return null;
  let age = d.getFullYear() - b.getFullYear();
  const md = d.getMonth() - b.getMonth();
  if (md < 0 || (md === 0 && d.getDate() < b.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

export function todayISO(date = new Date()) {
  const off = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - off).toISOString().slice(0, 10);
}

/* ---------- densidade corporal: Jackson & Pollock ---------- */
const JP7 = ['triceps', 'subscapular', 'chest', 'midaxillary', 'suprailiac', 'abdominal', 'thigh'];
const JP3_M = ['chest', 'abdominal', 'thigh'];
const JP3_F = ['triceps', 'suprailiac', 'thigh'];

function sumOf(folds, keys) {
  let total = 0;
  for (const k of keys) {
    const v = num(folds?.[k]);
    if (v === null) return null;
    total += v;
  }
  return total;
}

export function bodyDensity(folds, sex, age) {
  if (!folds || age === null) return null;
  const female = sex === 'female';

  const s7 = sumOf(folds, JP7);
  if (s7 !== null) {
    const d = female
      ? 1.097 - 0.00046971 * s7 + 0.00000056 * s7 * s7 - 0.00012828 * age
      : 1.112 - 0.00043499 * s7 + 0.00000055 * s7 * s7 - 0.00028826 * age;
    return { density: d, sum: s7, method: '7 dobras (Jackson & Pollock)' };
  }

  const s3 = sumOf(folds, female ? JP3_F : JP3_M);
  if (s3 !== null) {
    const d = female
      ? 1.0994921 - 0.0009929 * s3 + 0.0000023 * s3 * s3 - 0.0001392 * age
      : 1.10938 - 0.0008267 * s3 + 0.0000016 * s3 * s3 - 0.0002574 * age;
    return { density: d, sum: s3, method: '3 dobras (Jackson & Pollock)' };
  }
  return null;
}

/* Siri (1961): converte densidade em percentual de gordura. */
export const siri = (density) => 495 / density - 450;

/* ---------- classificações ---------- */
export function bmiClass(bmi) {
  if (bmi === null) return null;
  if (bmi < 18.5) return { label: 'Abaixo do peso', tone: 'warn' };
  if (bmi < 25)   return { label: 'Peso normal', tone: 'good' };
  if (bmi < 30)   return { label: 'Sobrepeso', tone: 'warn' };
  if (bmi < 35)   return { label: 'Obesidade I', tone: 'bad' };
  if (bmi < 40)   return { label: 'Obesidade II', tone: 'bad' };
  return { label: 'Obesidade III', tone: 'bad' };
}

/* Faixas de referência de % de gordura (ACE). */
export function bodyFatClass(bf, sex) {
  if (bf === null) return null;
  const scale = sex === 'female'
    ? [[13, 'Essencial', 'warn'], [21, 'Atleta', 'good'], [25, 'Em forma', 'good'], [32, 'Aceitável', 'warn'], [Infinity, 'Acima', 'bad']]
    : [[6, 'Essencial', 'warn'], [14, 'Atleta', 'good'], [18, 'Em forma', 'good'], [25, 'Aceitável', 'warn'], [Infinity, 'Acima', 'bad']];
  for (const [max, label, tone] of scale) if (bf < max) return { label, tone };
  return null;
}

export function whrClass(whr, sex) {
  if (whr === null) return null;
  const [low, mid] = sex === 'female' ? [0.80, 0.85] : [0.90, 0.95];
  if (whr < low) return { label: 'Risco baixo', tone: 'good' };
  if (whr < mid) return { label: 'Risco moderado', tone: 'warn' };
  return { label: 'Risco alto', tone: 'bad' };
}

export function whtrClass(whtr) {
  if (whtr === null) return null;
  if (whtr < 0.4)  return { label: 'Abaixo', tone: 'warn' };
  if (whtr < 0.5)  return { label: 'Saudável', tone: 'good' };
  if (whtr < 0.6)  return { label: 'Atenção', tone: 'warn' };
  return { label: 'Risco alto', tone: 'bad' };
}

/* ---------- cálculo principal ---------- */
export function derive(measurement, profile) {
  const m = measurement || {};
  const p = profile || {};
  const weight = num(m.weight);
  const height = num(p.height);
  const age = ageAt(p.birthdate, m.date);
  const sex = p.sex === 'female' ? 'female' : 'male';

  const out = {
    weight, height, age, sex,
    bmi: null, bmiClass: null,
    bodyFat: null, bodyFatMethod: null, bodyFatClass: null,
    fatMass: null, leanMass: null, foldSum: null,
    whr: null, whrClass: null, whtr: null, whtrClass: null,
    bmr: null, bmrMethod: null, idealWeight: null,
  };

  if (weight && height) {
    const hm = height / 100;
    out.bmi = weight / (hm * hm);
    out.bmiClass = bmiClass(out.bmi);
    out.idealWeight = [18.5 * hm * hm, 24.9 * hm * hm];
  }

  const dens = bodyDensity(m.folds, sex, age);
  if (dens) {
    const bf = siri(dens.density);
    if (bf > 2 && bf < 70) {
      out.bodyFat = bf;
      out.bodyFatMethod = dens.method;
      out.bodyFatClass = bodyFatClass(bf, sex);
      out.foldSum = dens.sum;
      if (weight) {
        out.fatMass = (weight * bf) / 100;
        out.leanMass = weight - out.fatMass;
      }
    }
  }
  if (out.foldSum === null) {
    const s = sumOf(m.folds, JP7) ?? sumOf(m.folds, sex === 'female' ? JP3_F : JP3_M);
    if (s !== null) out.foldSum = s;
  }

  const waist = num(m.circ?.waist);
  const hip = num(m.circ?.hip);
  if (waist && hip) { out.whr = waist / hip; out.whrClass = whrClass(out.whr, sex); }
  if (waist && height) { out.whtr = waist / height; out.whtrClass = whtrClass(out.whtr); }

  if (out.leanMass) {
    out.bmr = 370 + 21.6 * out.leanMass;          // Katch-McArdle
    out.bmrMethod = 'Katch-McArdle';
  } else if (weight && height && age !== null) {
    out.bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'female' ? -161 : 5); // Mifflin-St Jeor
    out.bmrMethod = 'Mifflin-St Jeor';
  }

  return out;
}

/* ---------- formatação ---------- */
export function fmt(value, decimals = 1) {
  if (value === null || value === undefined || !isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtDate(iso, style = 'short') {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return '—';
  return style === 'long'
    ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function daysBetween(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00'), b = new Date(isoB + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

export function relativeDays(days) {
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  if (days < 30) { const w = Math.floor(days / 7); return `há ${w} ${w === 1 ? 'semana' : 'semanas'}`; }
  if (days < 365) { const mo = Math.floor(days / 30); return `há ${mo} ${mo === 1 ? 'mês' : 'meses'}`; }
  const y = Math.floor(days / 365);
  return `há ${y} ${y === 1 ? 'ano' : 'anos'}`;
}
