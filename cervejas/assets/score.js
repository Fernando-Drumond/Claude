/* Escalas de avaliação, listas de apoio e cálculos. */

/* Fatores técnicos (0–5). A nota técnica é a média ponderada convertida para 0–10. */
export const FACTORS = [
  {
    key: 'appearance', label: 'Aparência', weight: 0.10, hint: 'Cor, limpidez e espuma',
    levels: [
      'Defeito claro: cor estranha, sem espuma ou partículas indevidas',
      'Sem atrativo: espuma some na hora, aspecto sem vida',
      'Aceitável, mas com falhas visíveis',
      'Correta para o estilo',
      'Bonita: cor viva, boa limpidez, espuma persistente',
      'Impecável: espuma cremosa e duradoura, marca o copo',
    ],
  },
  {
    key: 'aroma', label: 'Aroma', weight: 0.20, hint: 'Intensidade e qualidade do cheiro',
    levels: [
      'Desagradável ou com defeito (papelão, manteiga, enxofre, solvente)',
      'Quase sem aroma ou com nota estranha',
      'Fraco e pouco definido',
      'Agradável e típico do estilo',
      'Intenso e convidativo, com várias camadas',
      'Marcante e complexo, dá vontade de ficar cheirando',
    ],
  },
  {
    key: 'flavor', label: 'Sabor', weight: 0.30, hint: 'Qualidade e complexidade do gosto',
    levels: [
      'Defeituoso ou intragável',
      'Sem graça, aguado ou com gosto estranho',
      'Simples, com algum desequilíbrio ou nota fora',
      'Bom e limpo, entrega o que o estilo promete',
      'Saboroso, com camadas que aparecem a cada gole',
      'Excepcional: rico, complexo, memorável',
    ],
  },
  {
    key: 'mouthfeel', label: 'Corpo', weight: 0.10, hint: 'Textura, carbonatação, peso na boca',
    levels: [
      'Totalmente errado: choca ou espumando sem controle',
      'Aguada demais ou pesada/grudenta demais',
      'Corpo ou gás um pouco fora do ideal',
      'Adequado ao estilo',
      'Textura agradável, gás no ponto',
      'Perfeito: a textura valoriza o sabor',
    ],
  },
  {
    key: 'balance', label: 'Equilíbrio', weight: 0.15, hint: 'Malte × lúpulo × álcool',
    levels: [
      'Algo domina e estraga (álcool quente, amargor agressivo, doce enjoativo)',
      'Bem desequilibrada',
      'Um elemento sobressai mais do que devia',
      'Equilibrada',
      'Muito harmônica',
      'Integração perfeita, nada sobra nem falta',
    ],
  },
  {
    key: 'finish', label: 'Final', weight: 0.15, hint: 'Retrogosto e vontade de beber outra',
    levels: [
      'Retrogosto desagradável, não termina o copo',
      'Final ruim ou que cansa rápido',
      'Final curto ou um pouco incômodo',
      'Final limpo, beberia outra',
      'Final agradável e persistente, pede outro gole',
      'Final memorável, beberia sempre',
    ],
  },
];

/* Descritores de perfil (0–5). Não entram na nota; servem para busca e comparação. */
export const DESCRIPTORS = [
  { key: 'bitter', label: 'Amargor', tag: 'Amarga' },
  { key: 'sweet', label: 'Dulçor', tag: 'Doce' },
  { key: 'sour', label: 'Acidez', tag: 'Ácida' },
  { key: 'malt', label: 'Malte', tag: 'Maltada' },
  { key: 'hop', label: 'Lúpulo', tag: 'Lupulada' },
  { key: 'roast', label: 'Torra', tag: 'Torrada' },
];
export const DESCRIPTOR_LEVELS = ['Nada', 'Muito leve', 'Leve', 'Médio', 'Forte', 'Muito forte'];
/* Média a partir da qual a cerveja recebe a etiqueta do descritor (ex.: "Amarga"). */
export const TAG_THRESHOLD = 3.5;

export const STYLES = [
  'American Lager', 'Pilsen', 'Puro Malte', 'Helles', 'Vienna Lager', 'Bock', 'Dunkel', 'Kölsch',
  'Weiss', 'Witbier', 'Belgian Blond', 'Dubbel', 'Tripel', 'Saison',
  'APA', 'IPA', 'Session IPA', 'NEIPA', 'Double IPA', 'Red Ale', 'Amber Ale', 'ESB',
  'Brown Ale', 'Porter', 'Stout', 'Imperial Stout', 'Catharina Sour', 'Sour', 'Fruit Beer',
  'Lambic', 'Barley Wine', 'Sem álcool',
];

export const VOLUMES = [
  { ml: 269, label: 'Lata 269' },
  { ml: 350, label: 'Lata 350' },
  { ml: 473, label: 'Latão 473' },
  { ml: 355, label: 'Long neck 355' },
  { ml: 600, label: 'Garrafa 600' },
  { ml: 300, label: 'Chope 300' },
  { ml: 500, label: 'Chope 500' },
];

/* Nota técnica 0–10. Só existe quando os seis fatores foram preenchidos. */
export function technicalScore(factors) {
  if (!factors) return null;
  let sum = 0;
  for (const f of FACTORS) {
    const v = factors[f.key];
    if (v === null || v === undefined) return null;
    sum += f.weight * v;
  }
  return Math.round((sum / 5) * 100) / 10;
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/* Resume uma cerveja a partir dos seus registros de consumo. */
export function summarize(beer, entries) {
  const rated = entries.filter((e) => e.rating);
  const subj = rated.map((e) => e.rating.overall).filter((v) => typeof v === 'number');
  const tech = rated.map((e) => technicalScore(e.rating.factors)).filter((v) => v !== null);

  const factors = {};
  for (const f of FACTORS) {
    const vals = rated.map((e) => e.rating.factors?.[f.key]).filter((v) => typeof v === 'number');
    factors[f.key] = avg(vals);
  }
  const descriptors = {};
  for (const d of DESCRIPTORS) {
    const vals = rated.map((e) => e.rating.descriptors?.[d.key]).filter((v) => typeof v === 'number');
    descriptors[d.key] = avg(vals);
  }
  const tags = DESCRIPTORS.filter((d) => descriptors[d.key] !== null && descriptors[d.key] >= TAG_THRESHOLD)
    .map((d) => d.tag);

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  return {
    beer,
    entries: sorted,
    subjective: avg(subj),
    technical: avg(tech),
    factors,
    descriptors,
    tags,
    count: entries.reduce((n, e) => n + (e.qty || 0), 0),
    liters: entries.reduce((n, e) => n + litersOf(e), 0),
    lastDate: sorted[0]?.date || null,
  };
}

export const litersOf = (e) => ((e.qty || 0) * (e.volumeMl || 0)) / 1000;

/* ---------- formatação ---------- */
export const fmtScore = (v) => (v === null || v === undefined ? '—' : v.toFixed(1).replace('.', ','));
export const fmtNum = (v, d = 1) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: d });

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/* Remove acentos e caixa para comparar textos na busca. */
export const norm = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* Cor aproximada de cerveja para uma nota 0–10 (palha → âmbar → marrom). */
export function scoreColor(v) {
  if (v === null || v === undefined) return 'var(--muted-bg)';
  if (v >= 8.5) return '#c9730a';
  if (v >= 7) return '#e39b17';
  if (v >= 5) return '#efc24a';
  return '#b9a98a';
}
