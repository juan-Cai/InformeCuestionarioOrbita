import { classifyQuestion, getGradeColor, avg, getQualityCounts } from './calculations.js';
import { loadData, getCurrentData } from './data.js';
import { generateFullPDF } from './pdf.js';

let mainCharts = {};

// Registrar plugin de datalabels para mostrar porcentajes
Chart.register(ChartDataLabels);
Chart.defaults.set('plugins.datalabels', {
  color: '#1e293b',
  font: { weight: 'bold', size: 12 },
  formatter: (value, context) => {
    const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
    return `${percentage}%`;
  },
  anchor: 'center',
  align: 'center',
  offset: 4
});

function updateKPI(data) {
  const questions = data.questions;
  const avgFac = avg(questions.map(q => q.facility));
  const avgDisc = avg(questions.map(q => q.discrimination));
  const criticalCount = questions.filter(q => classifyQuestion(q) === 'Crítica').length;

  // Animación de conteo para KPI
  animateValue('kpiQuestions', 0, questions.length, 500);
  animateValue('kpiFacility', 0, Math.round(avgFac * 100), 500, '%');
  animateValue('kpiDisc', 0, Math.round(avgDisc * 100), 500, '', 2);
  animateValue('kpiCritical', 0, criticalCount, 500);
}

function animateValue(elementId, start, end, duration, suffix = '', decimals = 0) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const range = end - start;
  const stepTime = Math.abs(Math.floor(duration / range));
  let current = start;
  const timer = setInterval(() => {
    current += (range > 0 ? 1 : -1);
    if (decimals > 0) {
      element.innerText = (current / Math.pow(10, decimals)).toFixed(decimals) + suffix;
    } else {
      element.innerText = current + suffix;
    }
    if (current === end) clearInterval(timer);
  }, stepTime);
}

function updateTable(data) {
  const tbody = document.getElementById('simpleTableBody');
  tbody.innerHTML = '';
  
  data.questions.forEach((q, index) => {
    const status = classifyQuestion(q);
    const statusClass = status === 'Buena' ? 'buena' : (status === 'Revisar' ? 'revisar' : 'critica');
    const facilityPercent = Math.round(q.facility * 100);
    const discValue = q.discrimination.toFixed(2);
    
    // Crear fila con indicadores visuales
    const row = document.createElement('tr');
    row.style.animation = `slideUp 0.3s ease-out forwards`;
    row.style.opacity = '0';
    row.style.animationDelay = `${index * 0.02}s`;
    
    row.innerHTML = `
      <td><span class="q-badge">${q.q}</span></td>
      <td><strong>${escapeHtml(q.name)}</strong></td>
      <td>${q.attempts}</td>
      <td>
        <div class="progress-bar-container" data-tooltip="Facilidad: ${facilityPercent}%">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill facility" style="width: ${facilityPercent}%"></div>
          </div>
          <span class="progress-value">${facilityPercent}%</span>
        </div>
      </td>
      <td>
        <div class="progress-bar-container" data-tooltip="Discriminación: ${discValue}">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill discrimination" style="width: ${Math.min(100, (q.discrimination / 0.7) * 100)}%"></div>
          </div>
          <span class="progress-value">${discValue}</span>
        </div>
      </td>
      <td><span class="status-badge ${statusClass}">${status}</span></td>
    `;
    tbody.appendChild(row);
  });
  
  // Actualizar contador de tabla
  const tableCount = document.getElementById('tableCount');
  if (tableCount) tableCount.innerText = `${data.questions.length} preguntas`;
}

// Función auxiliar para escapar HTML
function escapeHtml(str) {
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function renderMainCharts(questions) {
  const sorted = [...questions].sort((a, b) => a.q - b.q);
  const statusMap = sorted.map(q => classifyQuestion(q));
  const colors = statusMap.map(s => getGradeColor(s));

  // Scatter plot
  if (mainCharts.scatter) mainCharts.scatter.destroy();
  const ctxScatter = document.getElementById('scatterChart').getContext('2d');
  mainCharts.scatter = new Chart(ctxScatter, {
    type: 'scatter',
    data: {
      datasets: [
        { label: 'Buena', data: sorted.filter(q => classifyQuestion(q) === 'Buena').map(q => ({ x: q.facility, y: q.discrimination })), backgroundColor: '#21c17a', pointRadius: 6, pointHoverRadius: 8 },
        { label: 'Revisar', data: sorted.filter(q => classifyQuestion(q) === 'Revisar').map(q => ({ x: q.facility, y: q.discrimination })), backgroundColor: '#f6b23c', pointRadius: 6, pointHoverRadius: 8 },
        { label: 'Crítica', data: sorted.filter(q => classifyQuestion(q) === 'Crítica').map(q => ({ x: q.facility, y: q.discrimination })), backgroundColor: '#ef5b5b', pointRadius: 6, pointHoverRadius: 8 }
      ]
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: true,
      plugins: {
        tooltip: { callbacks: { label: (ctx) => `Facilidad: ${ctx.parsed.x.toFixed(2)}, Discriminación: ${ctx.parsed.y.toFixed(2)}` } },
        datalabels: { display: false } // Desactivar datalabels en scatter
      },
      scales: { x: { min: 0, max: 1, title: { display: true, text: 'Facilidad', font: { weight: 'bold' } } }, y: { min: -0.1, max: 0.7, title: { display: true, text: 'Discriminación', font: { weight: 'bold' } } } }
    }
  });

  // Quality Doughnut con porcentajes
  if (mainCharts.quality) mainCharts.quality.destroy();
  const qualityCount = getQualityCounts(questions);
  mainCharts.quality = new Chart(document.getElementById('qualityChart'), {
    type: 'doughnut',
    data: { labels: Object.keys(qualityCount), datasets: [{ data: Object.values(qualityCount), backgroundColor: ['#21c17a', '#f6b23c', '#ef5b5b'], borderWidth: 0, hoverOffset: 8 }] },
    options: { 
      cutout: '65%', 
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10, font: { size: 11 } } },
        datalabels: { 
          color: '#fff',
          backgroundColor: 'rgba(0,0,0,0.6)',
          borderRadius: 12,
          padding: { left: 6, right: 6, top: 4, bottom: 4 },
          font: { weight: 'bold', size: 11 },
          formatter: (value, context) => {
            const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            return `${percentage}%`;
          }
        }
      }
    }
  });

  // Discrimination Bar Chart (horizontal)
  if (mainCharts.disc) mainCharts.disc.destroy();
  mainCharts.disc = new Chart(document.getElementById('discriminationChart'), {
    type: 'bar',
    data: { labels: sorted.map(q => `Q${q.q}`), datasets: [{ label: 'Discriminación', data: sorted.map(q => q.discrimination), backgroundColor: colors, borderRadius: 8, barPercentage: 0.7 }] },
    options: { 
      indexAxis: 'y', 
      responsive: true,
      plugins: { 
        tooltip: { callbacks: { label: (ctx) => `Discriminación: ${ctx.raw.toFixed(3)}` } },
        datalabels: { 
          display: true,
          anchor: 'end',
          align: 'right',
          formatter: (value) => value.toFixed(2),
          color: '#475569',
          font: { size: 10 }
        }
      }
    }
  });

  // Facility Bar Chart
  if (mainCharts.facility) mainCharts.facility.destroy();
  mainCharts.facility = new Chart(document.getElementById('facilityChart'), {
    type: 'bar',
    data: { labels: sorted.map(q => `Q${q.q}`), datasets: [{ label: 'Facilidad', data: sorted.map(q => q.facility), backgroundColor: '#f27a4b', borderRadius: 8, barPercentage: 0.6 }] },
    options: { 
      responsive: true, 
      scales: { y: { min: 0, max: 1, title: { display: true, text: 'Facilidad', font: { weight: 'bold' } }, ticks: { callback: (val) => `${Math.round(val * 100)}%` } } },
      plugins: { 
        tooltip: { callbacks: { label: (ctx) => `Facilidad: ${(ctx.raw * 100).toFixed(1)}%` } },
        datalabels: { 
          display: true,
          anchor: 'end',
          align: 'top',
          formatter: (value) => `${Math.round(value * 100)}%`,
          color: '#f27a4b',
          font: { weight: 'bold', size: 10 }
        }
      }
    }
  });
}

async function refreshDashboard() {
  try {
    // Mostrar efecto de carga
    const tbody = document.getElementById('simpleTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;">🔄 Cargando datos...</td></tr>';
    
    const data = await loadData();
    if (!data) return;
    
    document.getElementById('coursePill').innerText = data.course || 'Curso Demo';
    updateKPI(data);
    updateTable(data);
    renderMainCharts(data.questions);
  } catch (error) {
    console.error('Error al refrescar el dashboard:', error);
    const tbody = document.getElementById('simpleTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#ef5b5b;">❌ Error al cargar los datos</td></tr>';
  }
}

// Event listeners
document.getElementById('refreshBtn').addEventListener('click', refreshDashboard);
document.getElementById('exportBtn').addEventListener('click', generateFullPDF);

// Inicializar con animación
document.addEventListener('DOMContentLoaded', () => {
  refreshDashboard();
});