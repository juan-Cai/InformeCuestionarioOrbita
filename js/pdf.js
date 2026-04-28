import { classifyQuestion, getGradeColor, computeSummary, getQualityCounts } from './calculations.js';
import { getCurrentData } from './data.js';

export async function generateFullPDF() {
  const data = getCurrentData();
  if (!data) {
    alert('Aún no hay datos cargados. Espera a que termine la carga.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const questions = data.questions;
  const sorted = [...questions].sort((a, b) => a.q - b.q);
  const summary = computeSummary(questions);

  // ─── Constantes de página ────────────────────────────────────────────────────
  const PAGE_W  = doc.internal.pageSize.getWidth();   // 210 mm
  const PAGE_H  = doc.internal.pageSize.getHeight();  // 297 mm
  const MARGIN  = 14;
  const CONTENT = PAGE_W - MARGIN * 2;                // 182 mm

  // ─── Paleta ──────────────────────────────────────────────────────────────────
  const C = {
    orange:   [242, 122,  75],
    orangeL:  [253, 224, 204],
    dark:     [ 15,  23,  42],
    mid:      [ 51,  65,  85],
    muted:    [100, 116, 139],
    light:    [226, 232, 240],
    lightBg:  [248, 250, 252],
    white:    [255, 255, 255],
    green:    [ 33, 193, 122],
    yellow:   [246, 178,  60],
    red:      [239,  91,  91],
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function newPage() {
    doc.addPage();
    drawPageFrame();
    return MARGIN + 10;
  }

  function checkY(y, needed = 20) {
    if (y + needed > PAGE_H - MARGIN - 10) return newPage();
    return y;
  }

  function drawPageFrame() {
    // Línea naranja superior
    doc.setDrawColor(...C.orange);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, 8, PAGE_W - MARGIN, 8);
    // Línea inferior
    doc.setDrawColor(...C.light);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, PAGE_H - 12, PAGE_W - MARGIN, PAGE_H - 12);
  }

  function sectionTitle(text, y) {
    // Acento lateral naranja
    doc.setFillColor(...C.orange);
    doc.rect(MARGIN, y - 4, 3, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.dark);
    doc.text(text, MARGIN + 6, y);
    return y + 5;
  }

  function kpiBox(label, value, x, y, w, h, colorBadge) {
    // Fondo
    doc.setFillColor(...C.lightBg);
    doc.roundedRect(x, y, w, h, 2, 2, 'F');
    // Borde superior de color
    doc.setFillColor(...colorBadge);
    doc.rect(x, y, w, 1.2, 'F');
    // Valor
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...C.dark);
    doc.text(String(value), x + w / 2, y + h / 2 + 1, { align: 'center' });
    // Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(label, x + w / 2, y + h - 3.5, { align: 'center' });
  }

  // ─── Helper para gráficos con proporciones correctas ─────────────────────────
  // pxW / pxH → tamaño del canvas; mmW → ancho final en mm, mmH se calcula
  async function getChartImage(chartConfig, pxW, pxH) {
    const container = document.createElement('div');
    container.style.cssText = `position:fixed;left:-9999px;top:0;width:${pxW}px;height:${pxH}px`;
    const canvas = document.createElement('canvas');
    canvas.width  = pxW;
    canvas.height = pxH;
    container.appendChild(canvas);
    document.body.appendChild(container);
    const ctx   = canvas.getContext('2d');
    const chart = new Chart(ctx, chartConfig);
    await new Promise(r => setTimeout(r, 400));
    const url = canvas.toDataURL('image/png');
    chart.destroy();
    container.remove();
    return { url, ratio: pxH / pxW };   // ratio para mantener proporciones en PDF
  }

  function addChartImage(imgData, x, y, mmW) {
    const mmH = mmW * imgData.ratio;
    doc.addImage(imgData.url, 'PNG', x, y, mmW, mmH);
    return mmH;
  }

  // ─── Configuraciones de gráficos ─────────────────────────────────────────────
  const chartDefaults = {
    plugins: { legend: { labels: { font: { size: 11 }, color: '#334155' } } },
    layout:  { padding: 8 },
  };

  const scatterConfig = {
    type: 'scatter',
    data: {
      datasets: [
        { label: 'Buena',   data: sorted.filter(q => classifyQuestion(q) === 'Buena').map(q   => ({ x: q.facility, y: q.discrimination })), backgroundColor: '#21c17a', pointRadius: 6, pointHoverRadius: 8 },
        { label: 'Revisar', data: sorted.filter(q => classifyQuestion(q) === 'Revisar').map(q => ({ x: q.facility, y: q.discrimination })), backgroundColor: '#f6b23c', pointRadius: 6, pointHoverRadius: 8 },
        { label: 'Crítica', data: sorted.filter(q => classifyQuestion(q) === 'Crítica').map(q => ({ x: q.facility, y: q.discrimination })), backgroundColor: '#ef5b5b', pointRadius: 6, pointHoverRadius: 8 },
      ]
    },
    options: {
      ...chartDefaults,
      maintainAspectRatio: false,
      scales: {
        x: { min: 0, max: 1, title: { display: true, text: 'Facilidad', color: '#64748b' }, grid: { color: '#e2e8f0' } },
        y: { min: -0.1, max: 0.7, title: { display: true, text: 'Discriminación', color: '#64748b' }, grid: { color: '#e2e8f0' } },
      },
      plugins: { ...chartDefaults.plugins, legend: { position: 'top', labels: { font: { size: 11 }, color: '#334155' } } },
    }
  };

  const qualityCount  = getQualityCounts(questions);
  const qualityConfig = {
    type: 'doughnut',
    data: {
      labels: Object.keys(qualityCount),
      datasets: [{ data: Object.values(qualityCount), backgroundColor: ['#21c17a', '#f6b23c', '#ef5b5b'], borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      ...chartDefaults,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: { legend: { position: 'bottom', labels: { font: { size: 12 }, color: '#334155', padding: 12 } } },
    }
  };

  const discConfig = {
    type: 'bar',
    data: {
      labels: sorted.map(q => `Q${q.q}`),
      datasets: [{ label: 'Discriminación', data: sorted.map(q => q.discrimination), backgroundColor: sorted.map(q => getGradeColor(classifyQuestion(q))), borderRadius: 3, borderSkipped: false }]
    },
    options: {
      ...chartDefaults,
      maintainAspectRatio: false,
      indexAxis: 'x',
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { title: { display: true, text: 'Discriminación', color: '#64748b' }, grid: { color: '#e2e8f0' } },
      },
      plugins: { legend: { display: false } },
    }
  };

  const facilConfig = {
    type: 'bar',
    data: {
      labels: sorted.map(q => `Q${q.q}`),
      datasets: [{ label: 'Facilidad', data: sorted.map(q => q.facility), backgroundColor: '#f27a4b', borderRadius: 3, borderSkipped: false }]
    },
    options: {
      ...chartDefaults,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { min: 0, max: 1, title: { display: true, text: 'Facilidad', color: '#64748b' }, grid: { color: '#e2e8f0' } },
      },
      plugins: { legend: { display: false } },
    }
  };

  const weightConfig = {
    type: 'bar',
    data: {
      labels: sorted.map(q => `Q${q.q}`),
      datasets: [
        { label: 'Ponderación prevista', data: sorted.map(q => q.predictedWeight * 100), backgroundColor: 'rgba(242,122,75,.75)', borderRadius: 3 },
        { label: 'Ponderación efectiva', data: sorted.map(q => q.effectiveWeight * 100), backgroundColor: 'rgba(100,116,139,.65)', borderRadius: 3 },
      ]
    },
    options: {
      ...chartDefaults,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { title: { display: true, text: '% ponderación', color: '#64748b' }, grid: { color: '#e2e8f0' } },
      },
    }
  };

  const randomConfig = {
    type: 'radar',
    data: {
      labels: sorted.map(q => `Q${q.q}`),
      datasets: [{ label: 'Riesgo de azar (%)', data: sorted.map(q => q.randomScore * 100), backgroundColor: 'rgba(242,122,75,.15)', borderColor: '#f27a4b', borderWidth: 2, pointBackgroundColor: '#f27a4b', fill: true }]
    },
    options: {
      ...chartDefaults,
      maintainAspectRatio: false,
      scales: { r: { beginAtZero: true, max: 40, ticks: { stepSize: 10, font: { size: 9 } }, grid: { color: '#e2e8f0' }, pointLabels: { font: { size: 10 } } } },
    }
  };

  // ─── Generar imágenes ─────────────────────────────────────────────────────────
  const [scatterImg, qualityImg, discImg, facilImg, weightImg, randomImg] = await Promise.all([
    getChartImage(scatterConfig,  560, 360),   // 1.56 : 1
    getChartImage(qualityConfig,  380, 340),   // 1.12 : 1
    getChartImage(discConfig,     560, 300),   // 1.87 : 1
    getChartImage(facilConfig,    560, 300),
    getChartImage(weightConfig,   560, 300),
    getChartImage(randomConfig,   460, 400),   // 1.15 : 1
  ]);

  // ═══════════════════════════════════════════════════════════════════════════════
  //  PÁGINA 1 – Portada + KPIs
  // ═══════════════════════════════════════════════════════════════════════════════
  // Banda naranja de cabecera
  doc.setFillColor(...C.orange);
  doc.rect(0, 0, PAGE_W, 28, 'F');

  // Título principal
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...C.white);
  doc.text('ÓRBITA  ·  Informe de Quiz', MARGIN, 13);

  // Subtítulo / meta
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(253, 224, 204);
  doc.text(`Curso: ${data.course}   ·   ${new Date().toLocaleString('es-CO')}`, MARGIN, 21);

  // Línea base del header
  doc.setDrawColor(...C.orange);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, PAGE_H - 12, PAGE_W - MARGIN, PAGE_H - 12);

  let y = 38;

  // ─── KPIs en caja 2 × 4 ───────────────────────────────────────────────────────
  const KPI_COLS  = 4;
  const KPI_GAP   = 3;
  const KPI_W     = (CONTENT - KPI_GAP * (KPI_COLS - 1)) / KPI_COLS;  // ≈ 43 mm
  const KPI_H     = 18;

  const kpis = [
    { label: 'Intentos totales',    value: summary.attempts,                          color: C.orange },
    { label: 'Preguntas',           value: questions.length,                          color: C.orange },
    { label: 'Facilidad media',     value: `${Math.round(summary.avgFacility*100)}%`, color: C.green  },
    { label: 'Desv. estándar',      value: summary.avgStd.toFixed(2),                 color: C.muted  },
    { label: 'Discriminación media',value: summary.avgDisc.toFixed(2),                color: C.green  },
    { label: 'Preguntas críticas',  value: summary.critCount,                         color: C.red    },
    { label: 'Riesgo azar medio',   value: `${Math.round(summary.avgRandom*100)}%`,   color: C.yellow },
    { label: 'Eficiencia media',    value: summary.avgEfficiency.toFixed(2),          color: C.orange },
  ];

  kpis.forEach((k, i) => {
    const col = i % KPI_COLS;
    const row = Math.floor(i / KPI_COLS);
    kpiBox(k.label, k.value, MARGIN + col * (KPI_W + KPI_GAP), y + row * (KPI_H + KPI_GAP), KPI_W, KPI_H, k.color);
  });

  y += 2 * (KPI_H + KPI_GAP) + 6;

  // ─── Sección: Análisis gráfico ────────────────────────────────────────────────
  y = sectionTitle('Análisis gráfico — Dispersión de preguntas y distribución de calidad', y) + 4;

  // Scatter (izquierda, 60%) + Doughnut (derecha, 38%)
  const scatterW  = CONTENT * 0.59;
  const qualityW  = CONTENT * 0.39;
  const scatterH  = scatterW  * scatterImg.ratio;   // proporciones reales
  const qualityH  = qualityW  * qualityImg.ratio;
  const rowH      = Math.max(scatterH, qualityH);

  y = checkY(y, rowH + 6);
  doc.addImage(scatterImg.url, 'PNG', MARGIN,                       y, scatterW, scatterH);
  doc.addImage(qualityImg.url, 'PNG', MARGIN + scatterW + CONTENT * 0.02, y, qualityW, qualityH);
  y += rowH + 8;

  // ─── Discriminación y Facilidad ──────────────────────────────────────────────
  y = checkY(y, 6);
  y = sectionTitle('Discriminación y facilidad por pregunta', y) + 4;

  const halfW = (CONTENT - 4) / 2;
  const discH  = halfW * discImg.ratio;
  const facilH = halfW * facilImg.ratio;
  const row2H  = Math.max(discH, facilH);

  y = checkY(y, row2H + 6);
  doc.addImage(discImg.url,  'PNG', MARGIN,            y, halfW, discH);
  doc.addImage(facilImg.url, 'PNG', MARGIN + halfW + 4, y, halfW, facilH);
  y += row2H + 8;

  // ═══════════════════════════════════════════════════════════════════════════════
  //  PÁGINA 2 – Ponderación · Azar · Tabla detallada
  // ═══════════════════════════════════════════════════════════════════════════════
  y = newPage();

  y = sectionTitle('Ponderación prevista vs. efectiva, y riesgo de azar', y) + 4;

  const weightW  = CONTENT * 0.59;
  const randomW  = CONTENT * 0.38;
  const weightH  = weightW * weightImg.ratio;
  const randomH  = randomW * randomImg.ratio;
  const row3H    = Math.max(weightH, randomH);

  y = checkY(y, row3H + 6);
  doc.addImage(weightImg.url, 'PNG', MARGIN,                        y, weightW, weightH);
  doc.addImage(randomImg.url, 'PNG', MARGIN + weightW + CONTENT * 0.03, y, randomW, randomH);
  y += row3H + 8;

  // ─── Tabla detallada ─────────────────────────────────────────────────────────
  y = checkY(y, 20);
  y = sectionTitle('Detalle por pregunta — todos los indicadores', y) + 4;

  const tableColumns = [
    { title: 'Q#',         dataKey: 'q'   },
    { title: 'Nombre',     dataKey: 'name'},
    { title: 'Intentos',   dataKey: 'att' },
    { title: 'Facilidad',  dataKey: 'fac' },
    { title: 'Desv.Est',   dataKey: 'std' },
    { title: 'Azar',       dataKey: 'azar'},
    { title: 'P.Prevista', dataKey: 'pp'  },
    { title: 'P.Efectiva', dataKey: 'pe'  },
    { title: 'Discrim.',   dataKey: 'disc'},
    { title: 'Eficiencia', dataKey: 'ef'  },
    { title: 'Estado',     dataKey: 'est' },
  ];

  const tableRows = sorted.map(q => ({
    q:    q.q,
    name: q.name,
    att:  q.attempts,
    fac:  `${(q.facility * 100).toFixed(0)}%`,
    std:  q.stdDev.toFixed(2),
    azar: `${(q.randomScore * 100).toFixed(0)}%`,
    pp:   `${(q.predictedWeight * 100).toFixed(0)}%`,
    pe:   `${(q.effectiveWeight * 100).toFixed(0)}%`,
    disc: q.discrimination.toFixed(2),
    ef:   q.efficiency.toFixed(2),
    est:  classifyQuestion(q),
  }));

  const estadoColor = (v) =>
    v === 'Buena'   ? [...C.green,  0.15] :
    v === 'Revisar' ? [...C.yellow, 0.15] :
                      [...C.red,    0.15];

  doc.autoTable({
    startY:  y,
    columns: tableColumns,
    body:    tableRows,
    theme:   'plain',
    headStyles: {
      fillColor:  C.dark,
      textColor:  C.white,
      fontStyle:  'bold',
      fontSize:   8,
      cellPadding: 3,
      lineColor:  C.dark,
      lineWidth:  0,
    },
    styles: {
      fontSize:    7.5,
      cellPadding: 2.5,
      overflow:    'linebreak',
      textColor:   C.mid,
    },
    alternateRowStyles: { fillColor: C.lightBg },
    columnStyles: {
      0:  { halign: 'center', cellWidth: 8,  fontStyle: 'bold', textColor: C.orange },
      1:  { cellWidth: 36 },
      2:  { halign: 'center', cellWidth: 14 },
      3:  { halign: 'center', cellWidth: 16 },
      4:  { halign: 'center', cellWidth: 14 },
      5:  { halign: 'center', cellWidth: 12 },
      6:  { halign: 'center', cellWidth: 18 },
      7:  { halign: 'center', cellWidth: 18 },
      8:  { halign: 'center', cellWidth: 14 },
      9:  { halign: 'center', cellWidth: 16 },
      10: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
    },
    willDrawCell(data) {
      if (data.column.dataKey === 'est' && data.section === 'body') {
        const v   = data.cell.raw;
        const col = estadoColor(v);
        const tc  = v === 'Buena' ? C.green : v === 'Revisar' ? C.yellow : C.red;
        doc.setTextColor(tc[0], tc[1], tc[2]);
      }
    },
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT,
  });

  y = doc.lastAutoTable.finalY + 10;

  // ═══════════════════════════════════════════════════════════════════════════════
  //  PÁGINA 3 – Recomendaciones y alertas
  // ═══════════════════════════════════════════════════════════════════════════════
  if (y + 60 > PAGE_H - MARGIN - 12) y = newPage();
  else {
    // Solo dibujar el frame de página si estamos continuando en la misma
    y = checkY(y, 20);
  }

  y = sectionTitle('Recomendaciones y alertas', y) + 5;

  const criticalQ    = sorted.filter(q => classifyQuestion(q) === 'Crítica');
  const reviewQ      = sorted.filter(q => classifyQuestion(q) === 'Revisar');
  const bestDisc     = [...sorted].sort((a, b) => b.discrimination - a.discrimination)[0];
  const highestRand  = [...sorted].sort((a, b) => b.randomScore - a.randomScore)[0];
  const facilLevel   =
    summary.avgFacility > 0.7  ? 'Quiz fácil — considera aumentar el nivel de reto.' :
    summary.avgFacility < 0.45 ? 'Quiz difícil — equilibra los contenidos.' :
                                  'Nivel equilibrado.';

  const alerts = [
    { icon: '●', color: C.red,    text: `Preguntas críticas: ${criticalQ.length}${criticalQ.length ? ` (${criticalQ.map(q=>`Q${q.q}`).join(', ')})` : ''}. Requieren revisión inmediata por discriminación baja o negativa.` },
    { icon: '●', color: C.yellow, text: `Para revisar: ${reviewQ.length} ítem${reviewQ.length !== 1 ? 's' : ''} con potencial de mejora. Analiza sus distractores y el enunciado.` },
    { icon: '●', color: C.green,  text: `Mejor discriminación: Q${bestDisc.q} — "${bestDisc.name}" con valor ${bestDisc.discrimination.toFixed(2)}. Úsala como referencia de buena construcción.` },
    { icon: '●', color: C.orange, text: `Mayor riesgo de azar: Q${highestRand.q} con ${(highestRand.randomScore * 100).toFixed(0)}% de acierto aleatorio. Revisa el número de opciones.` },
    { icon: '●', color: C.muted,  text: `Facilidad media del quiz: ${(summary.avgFacility * 100).toFixed(0)}% → ${facilLevel}` },
  ];

  const ALERT_H  = 12;
  const ALERT_GAP = 3;

  alerts.forEach(alert => {
    y = checkY(y, ALERT_H + ALERT_GAP);
    // Fondo
    doc.setFillColor(...C.lightBg);
    doc.roundedRect(MARGIN, y, CONTENT, ALERT_H, 2, 2, 'F');
    // Borde izquierdo coloreado
    doc.setFillColor(...alert.color);
    doc.rect(MARGIN, y, 2.5, ALERT_H, 'F');
    // Texto
    const lines = doc.splitTextToSize(alert.text, CONTENT - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.mid);
    doc.text(lines[0], MARGIN + 6, y + ALERT_H / 2 + 1.5);
    y += ALERT_H + ALERT_GAP;

    // Si hay más líneas, añadirlas como párrafo adicional
    if (lines.length > 1) {
      for (let l = 1; l < lines.length; l++) {
        y = checkY(y, 5);
        doc.text(lines[l], MARGIN + 6, y);
        y += 5;
      }
      y += 1;
    }
  });

  // ─── Pie de todas las páginas ────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(
      `Órbita Analytics  ·  ${data.course}  ·  Generado ${new Date().toLocaleString('es-CO')}`,
      MARGIN,
      PAGE_H - 6
    );
    doc.text(
      `Página ${i} de ${pageCount}`,
      PAGE_W - MARGIN,
      PAGE_H - 6,
      { align: 'right' }
    );
  }

  // ─── Guardar ─────────────────────────────────────────────────────────────────
  doc.save(`orbita_informe_quiz_${new Date().toISOString().slice(0, 10)}.pdf`);
}