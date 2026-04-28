// Funciones de cálculo y utilidades puras

export function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

export function avg(arr) {
  return arr.length ? sum(arr) / arr.length : 0;
}

export function classifyQuestion(q) {
  if (q.discrimination < 0 || q.efficiency < 0 || q.facility < 0.25 || q.facility > 0.92) return 'Crítica';
  if (q.discrimination < 0.2 || q.efficiency < 0.15 || q.randomScore > 0.22) return 'Revisar';
  return 'Buena';
}

export function getGradeColor(label) {
  return label === 'Buena' ? '#21c17a' : label === 'Revisar' ? '#f6b23c' : '#ef5b5b';
}

export function computeSummary(questions) {
  return {
    attempts: sum(questions.map(q => q.attempts)),
    avgFacility: avg(questions.map(q => q.facility)),
    avgStd: avg(questions.map(q => q.stdDev)),
    avgRandom: avg(questions.map(q => q.randomScore)),
    avgPred: avg(questions.map(q => q.predictedWeight)),
    avgEff: avg(questions.map(q => q.effectiveWeight)),
    avgDisc: avg(questions.map(q => q.discrimination)),
    avgEfficiency: avg(questions.map(q => q.efficiency)),
    critCount: questions.filter(q => classifyQuestion(q) === 'Crítica').length
  };
}

export function getQualityCounts(questions) {
  return {
    Buena: questions.filter(q => classifyQuestion(q) === 'Buena').length,
    Revisar: questions.filter(q => classifyQuestion(q) === 'Revisar').length,
    Crítica: questions.filter(q => classifyQuestion(q) === 'Crítica').length
  };
}