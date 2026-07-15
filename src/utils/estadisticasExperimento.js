// src/utils/estadisticasExperimento.js
/**
 * Calcula estadísticas descriptivas (N, media, desviación estándar, min, max) por tratamiento
 * para cada variable de respuesta indicada.
 *
 * @param {Array<Object>} cosechas - Lista de objetos cosecha. Cada objeto debe contener
 *   `tratamiento_id` y los campos de variables de respuesta.
 * @param {Array<string>} variables - Nombres de las variables a analizar (ej. ['peso', 'longitud']).
 * @param {Array<Object>} tratamientos - Lista de tratamientos del experimento (para obtener labels).
 * @returns {Object} Un mapa de la forma:
 *   {
 *     <variable>: [
 *       { tratamientoId, tratamientoLabel, n, media, desvio, min, max },
 *       ...
 *     ],
 *     ...
 *   }
 */
export function calcularDescriptiva(cosechas, variables, tratamientos) {
  // Mapa id -> label (para ordenar alfabéticamente)
  const labelMap = {};
  (tratamientos || []).forEach((t) => {
    labelMap[t.id] = t.label || t.id;
  });

  const resultado = {};

  variables.forEach((varName) => {
    // Agrupar valores por tratamiento
    const porTratamiento = {};
    cosechas.forEach((c) => {
      const tratoId = c.tratamiento_id || 'sin-tratamiento';
      const valor = c[varName];
      if (valor === undefined || valor === null) return; // ignorar datos faltantes
      if (!porTratamiento[tratoId]) porTratamiento[tratoId] = [];
      porTratamiento[tratoId].push(Number(valor));
    });

    // Construir lista de resultados para la variable
    const lista = [];
    // Conjuntar tratamientos con datos y los que no tengan datos (N=0)
    const todosIds = new Set([
      ...Object.keys(porTratamiento),
      ...Object.keys(labelMap),
    ]);
    todosIds.forEach((tid) => {
      const valores = porTratamiento[tid] || [];
      const n = valores.length;
      let media = '—', desvio = '—', min = '—', max = '—';
      if (n > 0) {
        const sum = valores.reduce((a, b) => a + b, 0);
        media = (sum / n).toFixed(2);
        const sqDiff = valores.reduce((a, b) => a + Math.pow(b - media, 2), 0);
        desvio = Math.sqrt(sqDiff / n).toFixed(2);
        min = Math.min(...valores).toFixed(2);
        max = Math.max(...valores).toFixed(2);
      }
      lista.push({
        tratamientoId: tid,
        tratamientoLabel: labelMap[tid] || tid,
        n,
        media,
        desvio,
        min,
        max,
      });
    });
    // Orden alfabético por label
    lista.sort((a, b) => a.tratamientoLabel.localeCompare(b.tratamientoLabel));
    resultado[varName] = lista;
  });

  return resultado;
}
