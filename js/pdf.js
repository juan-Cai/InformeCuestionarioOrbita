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

  // Helper: genera una imagen a partir de una configuración de Chart.js
  async function getChartImage(chartConfig, width = 400, height = 300) {
    const container = document.createElement('div');
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    container.appendChild(canvas);
    document.body.appendChild(container);
    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, chartConfig);
    await new Promise(r => setTimeout(r, 300));
    const url = canvas.toDataURL('image/png');
    chart.destroy();
    container.remove();
    return url;
  }

  // Configuraciones de los gráficos (mismos que en el dashboard)
  const scatterConfig = {
    type: 'scatter',
    data: {
      datasets: [
        { label: 'Buena', data: sorted.filter(q => classifyQuestion(q) === 'Buena').map(q => ({ x: q.facility, y: q.discrimination })), backgroundColor: '#21c17a', pointRadius: 5 },
        { label: 'Revisar', data: sorted.filter(q => classifyQuestion(q) === 'Revisar').map(q => ({ x: q.facility, y: q.discrimination })), backgroundColor: '#f6b23c', pointRadius: 5 },
        { label: 'Crítica', data: sorted.filter(q => classifyQuestion(q) === 'Crítica').map(q => ({ x: q.facility, y: q.discrimination })), backgroundColor: '#ef5b5b', pointRadius: 5 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: true, scales: { x: { min: 0, max: 1, title: { display: true, text: 'Facilidad' } }, y: { min: -0.1, max: 0.7, title: { display: true, text: 'Discriminación' } } } }
  };

  const qualityCount = getQualityCounts(questions);
  const qualityConfig = {
    type: 'doughnut',
    data: { labels: Object.keys(qualityCount), datasets: [{ data: Object.values(qualityCount), backgroundColor: ['#21c17a', '#f6b23c', '#ef5b5b'] }] },
    options: { cutout: '60%', plugins: { legend: { position: 'bottom' } } }
  };

  const discConfig = {
    type: 'bar',
    data: { labels: sorted.map(q => `Q${q.q}`), datasets: [{ label: 'Discriminación', data: sorted.map(q => q.discrimination), backgroundColor: sorted.map(q => getGradeColor(classifyQuestion(q))) }] },
    options: { indexAxis: 'y', maintainAspectRatio: true, scales: { x: { title: { display: true, text: 'Valor' } } } }
  };

  const facilConfig = {
    type: 'bar',
    data: { labels: sorted.map(q => `Q${q.q}`), datasets: [{ label: 'Facilidad', data: sorted.map(q => q.facility), backgroundColor: '#f27a4b' }] },
    options: { scales: { y: { min: 0, max: 1, title: { display: true, text: 'Facilidad' } } } }
  };

  const weightConfig = {
    type: 'bar',
    data: {
      labels: sorted.map(q => `Q${q.q}`),
      datasets: [
        { label: 'Ponderación prevista', data: sorted.map(q => q.predictedWeight * 100), backgroundColor: 'rgba(242,122,75,.7)' },
        { label: 'Ponderación efectiva', data: sorted.map(q => q.effectiveWeight * 100), backgroundColor: 'rgba(100,116,139,.7)' }
      ]
    },
    options: { scales: { y: { title: { display: true, text: '% ponderación' } } } }
  };

  const randomConfig = {
    type: 'radar',
    data: { labels: sorted.map(q => `Q${q.q}`), datasets: [{ label: 'Riesgo de azar (%)', data: sorted.map(q => q.randomScore * 100), backgroundColor: 'rgba(242,122,75,.2)', borderColor: '#f27a4b', fill: true }] },
    options: { scales: { r: { beginAtZero: true, max: 40, ticks: { stepSize: 10 } } } }
  };

  // Generar todas las imágenes en paralelo
  const [scatterImg, qualityImg, discImg, facilImg, weightImg, randomImg] = await Promise.all([
    getChartImage(scatterConfig, 500, 350),
    getChartImage(qualityConfig, 300, 300),
    getChartImage(discConfig, 500, 320),
    getChartImage(facilConfig, 500, 320),
    getChartImage(weightConfig, 500, 320),
    getChartImage(randomConfig, 500, 350)
  ]);

  // --- Construcción del PDF ---
  const margin = 15;
  let y = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 2 * margin;

  // Cabecera
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(242, 122, 75);
  doc.text('Órbita - Informe completo de Quiz', margin, y);
  y += 8;
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text(`Curso: ${data.course}  |  Generado: ${new Date().toLocaleString('es-CO')}`, margin, y);
  y += 10;

  // KPIs resumidos (tabla)
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumen ejecutivo de métricas', margin, y);
  y += 8;
  const kpiData = [
    ['Intentos totales', summary.attempts, 'Preguntas analizadas', questions.length],
    ['Facilidad promedio', `${Math.round(summary.avgFacility * 100)}%`, 'Desviación estándar', summary.avgStd.toFixed(2)],
    ['Azar promedio', `${Math.round(summary.avgRandom * 100)}%`, 'Eficiencia discrim.', summary.avgEfficiency.toFixed(2)],
    ['Pond. prevista', `${Math.round(summary.avgPred * 100)}%`, 'Pond. efectiva', `${Math.round(summary.avgEff * 100)}%`],
    ['Discriminación media', summary.avgDisc.toFixed(2), 'Preguntas críticas', summary.critCount]
  ];
  doc.autoTable({
    startY: y,
    body: kpiData,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { fontStyle: 'bold', textColor: [100, 116, 139] }, 2: { fontStyle: 'bold', textColor: [100, 116, 139] } },
    margin: { left: margin, right: margin },
    tableWidth: contentWidth
  });
  y = doc.lastAutoTable.finalY + 8;

  // Gráficos (2 columnas)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Análisis gráfico detallado', margin, y);
  y += 6;
  const halfWidth = contentWidth / 2 - 5;
  doc.addImage(scatterImg, 'PNG', margin, y, halfWidth, 45);
  doc.addImage(qualityImg, margin + halfWidth + 5, y, halfWidth, 45);
  y += 52;
  if (y > 270) { doc.addPage(); y = 20; }
  doc.addImage(discImg, 'PNG', margin, y, halfWidth, 45);
  doc.addImage(facilImg, margin + halfWidth + 5, y, halfWidth, 45);
  y += 52;
  if (y > 270) { doc.addPage(); y = 20; }
  doc.addImage(weightImg, 'PNG', margin, y, halfWidth, 45);
  doc.addImage(randomImg, margin + halfWidth + 5, y, halfWidth, 45);
  y += 52;
  if (y > 270) { doc.addPage(); y = 20; }

  // Tabla detallada por pregunta
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Detalle por pregunta (todos los indicadores)', margin, y);
  y += 6;
  const tableColumns = ['Q#', 'Nombre', 'Intentos', 'Facilidad', 'Desv.Est', 'Azar', 'Pond.Prev', 'Pond.Efec', 'Discrim', 'Eficiencia', 'Estado'];
  const tableRows = sorted.map(q => [
    q.q, q.name, q.attempts, (q.facility * 100).toFixed(0) + '%', q.stdDev.toFixed(2), (q.randomScore * 100).toFixed(0) + '%',
    (q.predictedWeight * 100).toFixed(0) + '%', (q.effectiveWeight * 100).toFixed(0) + '%',
    q.discrimination.toFixed(2), q.efficiency.toFixed(2), classifyQuestion(q)
  ]);
  doc.autoTable({
    startY: y,
    head: [tableColumns],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [242, 122, 75], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    columnStyles: { 1: { cellWidth: 30 }, 10: { cellWidth: 18, fontStyle: 'bold' } },
    margin: { left: margin, right: margin },
    tableWidth: contentWidth
  });
  y = doc.lastAutoTable.finalY + 10;

  // Recomendaciones y alertas
  if (y > 270) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Recomendaciones y alertas', margin, y);
  y += 6;
  const criticalQ = sorted.filter(q => classifyQuestion(q) === 'Crítica');
  const reviewQ = sorted.filter(q => classifyQuestion(q) === 'Revisar');
  const bestDisc = [...sorted].sort((a, b) => b.discrimination - a.discrimination)[0];
  const highestRandom = [...sorted].sort((a, b) => b.randomScore - a.randomScore)[0];
  const alerts = [
    `🔴 Preguntas críticas: ${criticalQ.length} (${criticalQ.map(q => `Q${q.q}`).join(', ') || 'ninguna'}). Requieren revisión inmediata por discriminación baja o negativa.`,
    `🟡 Para revisar: ${reviewQ.length} ítems con potencial de mejora.`,
    `📊 Discriminación más alta: Q${bestDisc.q} (${bestDisc.name}) con valor ${bestDisc.discrimination.toFixed(2)}.`,
    `🎲 Mayor riesgo de azar: Q${highestRandom.q} con ${(highestRandom.randomScore * 100).toFixed(0)}% de acierto aleatorio.`,
    `📈 Facilidad media del quiz: ${(summary.avgFacility * 100).toFixed(0)}% → ${summary.avgFacility > 0.7 ? 'Quiz fácil, aumentar reto.' : summary.avgFacility < 0.45 ? 'Quiz difícil, equilibrar contenidos.' : 'Nivel equilibrado.'}`
  ];
  doc.setFontSize(10);
  doc.setTextColor(50, 50, 70);
  let alertY = y;
  alerts.forEach(alert => {
    const lines = doc.splitTextToSize(alert, contentWidth - 5);
    doc.text(lines, margin + 2, alertY);
    alertY += (lines.length * 5) + 3;
  });

  // Numeración de páginas
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 170);
    doc.text(`Órbita Analytics · Página ${i} de ${pageCount}`, pageWidth - 35, doc.internal.pageSize.getHeight() - 8);
  }

  // Guardar PDF
  doc.save(`orbita_informe_quiz_${new Date().toISOString().slice(0, 10)}.pdf`);
}