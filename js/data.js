let cachedData = null;

export async function loadData() {
  try {
    const response = await fetch('data.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    cachedData = data;
    return data;
  } catch (error) {
    console.error('Error cargando data.json:', error);
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.style.padding = '20px';
    errorDiv.textContent = 'Error al cargar data.json. Asegúrate de tener el archivo.';
    document.body.appendChild(errorDiv);
    throw error;
  }
}

export function getCurrentData() {
  return cachedData;
}