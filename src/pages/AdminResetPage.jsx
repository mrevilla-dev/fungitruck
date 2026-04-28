import { useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

export default function AdminResetPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [options, setOptions] = useState({
    batches: true,
    esporomas: true,
    mantenimiento: true,
    counters: true,
    medios_preparados: true,
    insumos_base: true,
    salas: false
  });

  const handleReset = async () => {
    const selected = Object.keys(options).filter(k => options[k]);
    if (selected.length === 0) {
      alert("Seleccioná al menos una categoría para borrar.");
      return;
    }

    if (!window.confirm(`⚠️ ADVERTENCIA: Estás a punto de borrar los datos de: ${selected.join(', ')}. Esto es irreversible. ¿Proceder?`)) {
      return;
    }
    
    const promptValue = window.prompt("⚠️ SEGUNDA CONFIRMACIÓN: Escribí 'BORRAR' en mayúsculas para confirmar:");
    if (promptValue !== 'BORRAR') {
        alert("Borrado cancelado.");
        return;
    }

    setLoading(true);
    setStatus("Iniciando borrado masivo...");

    const collectionsToDelete = selected;

    try {
      for (const collName of collectionsToDelete) {
        setStatus(`Borrando colección: ${collName}...`);
        const querySnapshot = await getDocs(collection(db, collName));
        const total = querySnapshot.docs.length;
        if (total === 0) {
            setStatus(`${collName} ya está vacía.`);
            continue;
        }
        let count = 0;
        for (const document of querySnapshot.docs) {
          // Borrar sub-colecciones si existen
          if (collName === 'salas') {
            const desinfSnap = await getDocs(collection(db, `salas/${document.id}/desinfecciones`));
            for (const d of desinfSnap.docs) await deleteDoc(doc(db, `salas/${document.id}/desinfecciones`, d.id));
            const lectSnap = await getDocs(collection(db, `salas/${document.id}/lecturas`));
            for (const l of lectSnap.docs) await deleteDoc(doc(db, `salas/${document.id}/lecturas`, l.id));
          }
          if (collName === 'insumos_base') {
            const entrSnap = await getDocs(collection(db, `insumos_base/${document.id}/entradas`));
            for (const e of entrSnap.docs) await deleteDoc(doc(db, `insumos_base/${document.id}/entradas`, e.id));
          }

          await deleteDoc(doc(db, collName, document.id));
          count++;
          setStatus(`Borrando ${collName}... (${count}/${total})`);
        }
      }
      setStatus("✅ Borrado completo de las categorías seleccionadas.");
      alert("Operación completada con éxito.");
    } catch (error) {
      console.error(error);
      setStatus(`❌ Error durante el borrado: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in container" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center', paddingTop: '4rem' }}>
      <h1 style={{ color: 'var(--danger-color)' }}>🛠️ Panel de Administración (Peligro)</h1>
      <p style={{ marginBottom: '2rem' }}>
        Esta herramienta borrará completamente todas las colecciones de la base de datos para iniciar de cero (Hard Reset).
      </p>
      
      <div className="card" style={{ borderColor: 'var(--danger-color)', borderWidth: '2px', borderStyle: 'solid' }}>
        <h3 style={{ color: 'var(--danger-color)' }}>Seleccionar qué borrar:</h3>
        
        <div style={{ textAlign: 'left', margin: '1rem auto', display: 'inline-block' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={options.batches} onChange={e => setOptions({...options, batches: e.target.checked})} /> 🧬 Lotes / Inoculaciones
          </label>
          <label style={{ display: 'block', marginBottom: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={options.esporomas} onChange={e => setOptions({...options, esporomas: e.target.checked})} /> 🍄 Ejemplares (Esporomas)
          </label>
          <label style={{ display: 'block', marginBottom: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={options.mantenimiento} onChange={e => setOptions({...options, mantenimiento: e.target.checked})} /> 📝 Mantenimiento / Historial
          </label>
          <label style={{ display: 'block', marginBottom: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={options.medios_preparados} onChange={e => setOptions({...options, medios_preparados: e.target.checked})} /> 🧪 Medios Preparados
          </label>
          <label style={{ display: 'block', marginBottom: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={options.insumos_base} onChange={e => setOptions({...options, insumos_base: e.target.checked})} /> 📦 Insumos Maestro
          </label>
          <label style={{ display: 'block', marginBottom: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={options.counters} onChange={e => setOptions({...options, counters: e.target.checked})} /> 🔢 Contadores (Reinicia IDs a 0001)
          </label>
          <label style={{ display: 'block', marginBottom: '0.5rem', cursor: 'pointer', color: options.salas ? 'var(--danger-color)' : 'inherit' }}>
            <input type="checkbox" checked={options.salas} onChange={e => setOptions({...options, salas: e.target.checked})} /> 🏠 Salas / Sectores (Cuidado)
          </label>
        </div>

        <button 
          className="btn btn-danger" 
          onClick={handleReset} 
          disabled={loading}
          style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', marginTop: '1rem' }}
        >
          {loading ? "Procesando..." : "💥 EJECUTAR BORRADO SELECCIONADO 💥"}
        </button>
        
        {status && <p style={{ marginTop: '1rem', fontWeight: 'bold' }}>{status}</p>}
      </div>
    </div>
  );
}
