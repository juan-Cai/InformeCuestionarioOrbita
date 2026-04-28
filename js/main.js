import { classifyQuestion, getGradeColor, avg, getQualityCounts } from './calculations.js';
import { loadData, getCurrentData } from './data.js';
import { generateFullPDF } from './pdf.js';

let mainCharts = {};

function updateKPI(data) {
  const questions = data.questions;
  const avgFac = avg(questions.map(q => q.facility));
  const avgDisc = avg(questions.map(q => q.discrimination));
  const criticalCount = questions.filter(q => classifyQuestion(q) === 'Crítica').length;

  document.getElementById('kpiQuestions').innerText = questions.length;
  document.getElementById('kpiFacility').innerText = `${Math.round(avgFac * 100)}%`;
  document.getElementById('kpiDisc').innerText = avgDisc.toFixed(2);
  document.getElementById('kpiCritical').innerText = criticalCount;
}

function updateTable(data) {
  const tbody = document.getElementById('simpleTableBody');
  tbody.innerHTML = '';
  data.questions.forEach(q => {
    const status = classifyQuestion(q);
    tbody.innerHTML += `
      <tr>
        <td><span class="q-badge">${q.q}</span></td>
        <td><strong>${q.name}</strong></td>
        <td>${q.attempts}</td>
        <td>${Math.round(q.facility * 100)}%</td>
        <td>${q.discrimination.toFixed(2)}</td>
        <td style="color:${getGradeColor(status)};font-weight:bold;">${status}</td>
      </tr>
    `;
  });
}

function renderMainCharts(questions) {
  const sorted = [...questions].sort((a, b) => a.q - b.q);
  const statusMap = sorted.map(q => classifyQuestion(q));
  const colors = statusMap.map(s => getGradeColor(s));

  if (mainCharts.scatter) mainCharts.scatter.destroy();
  const ctxScatter = document.getElementById('scatterChart').getContext('2d');
  mainCharts.scatter = new Chart(ctxScatter, {
    type: 'scatter',
    data: {
      datasets: [
        { label: 'Buena', data: sorted.filter(q => classifyQuestion(q) === 'Buena').map(q => ({ x: q.facility, y: q.discrimination })), backgroundColor: '#21c17a', pointRadius: 5 },
        { label: 'Revisar', data: sorted.filter(q => classifyQuestion(q) === 'Revisar').map(q => ({ x: q.facility, y: q.discrimination })), backgroundColor: '#f6b23c', pointRadius: 5 },
        { label: 'Crítica', data: sorted.filter(q => classifyQuestion(q) === 'Crítica').map(q => ({ x: q.facility, y: q.discrimination })), backgroundColor: '#ef5b5b', pointRadius: 5 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: true, scales: { x: { min: 0, max: 1, title: { display: true, text: 'Facilidad' } }, y: { min: -0.1, max: 0.7, title: { display: true, text: 'Discriminación' } } } }
  });

  if (mainCharts.quality) mainCharts.quality.destroy();
  const qualityCount = getQualityCounts(questions);
  mainCharts.quality = new Chart(document.getElementById('qualityChart'), {
    type: 'doughnut',
    data: { labels: Object.keys(qualityCount), datasets: [{ data: Object.values(qualityCount), backgroundColor: ['#21c17a', '#f6b23c', '#ef5b5b'] }] },
    options: { cutout: '60%' }
  });

  if (mainCharts.disc) mainCharts.disc.destroy();
  mainCharts.disc = new Chart(document.getElementById('discriminationChart'), {
    type: 'bar',
    data: { labels: sorted.map(q => `Q${q.q}`), datasets: [{ label: 'Discriminación', data: sorted.map(q => q.discrimination), backgroundColor: colors }] },
    options: { indexAxis: 'y', responsive: true }
  });

  if (mainCharts.facility) mainCharts.facility.destroy();
  mainCharts.facility = new Chart(document.getElementById('facilityChart'), {
    type: 'bar',
    data: { labels: sorted.map(q => `Q${q.q}`), datasets: [{ label: 'Facilidad', data: sorted.map(q => q.facility), backgroundColor: '#f27a4b' }] },
    options: { responsive: true, scales: { y: { min: 0, max: 1 } } }
  });
}

async function refreshDashboard() {
  try {
    const data = await loadData();
    if (!data) return;
    document.getElementById('coursePill').innerText = data.course || 'Curso Demo';
    updateKPI(data);
    updateTable(data);
    renderMainCharts(data.questions);
  } catch (error) {
    console.error('Error al refrescar el dashboard:', error);
  }
}

// Event listeners
document.getElementById('refreshBtn').addEventListener('click', refreshDashboard);
document.getElementById('exportBtn').addEventListener('click', generateFullPDF);

// Inicializar
refreshDashboard();