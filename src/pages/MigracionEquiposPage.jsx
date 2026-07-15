import { useState } from 'react';
import { migrarEquiposDesdeInsumos } from '../utils/migrarEquipos';

export default function MigracionEquiposPage() {
  const [estado, setEstado] = useState('idle'); // idle | ejecutando | completado | error
  const [resultados, setResultados] = useState(null);

  async function ejecutarMigracion() {
    setEstado('ejecutando');
    try {
      const res = await migrarEquiposDesdeInsumos();
      setResultados(res);
      setEstado('completado');
    } catch (err) {
      setEstado('error');
      console.error(err);
    }
  }

  return (
    <div style={{ padding: '32px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Migración de Equipos</h1>
      <p>
        Esta herramienta migra los ítems de <strong>insumos_base</strong> con
        categoría "Equipamiento" a la nueva colección <strong>equipos</strong>.
        Los originales no se eliminan — quedan marcados como migrados.
      </p>

      {estado === 'idle' && (
        <button
          onClick={ejecutarMigracion}
          style={{ padding: '12px 24px', backgroundColor: '#FF9800', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}
        >
          Ejecutar migración
        </button>
      )}

      {estado === 'ejecutando' && <p>⏳ Migrando equipos...</p>}

      {estado === 'completado' && resultados && (
        <div>
          <p>✅ Migración completada</p>
          <p>Migrados: <strong>{resultados.migrados}</strong></p>
          <p>Omitidos (ya migrados): <strong>{resultados.omitidos}</strong></p>
          {resultados.errores.length > 0 && (
            <div>
              <p>❌ Errores ({resultados.errores.length}):</p>
              <pre>{JSON.stringify(resultados.errores, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
