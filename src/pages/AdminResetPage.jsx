import { useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, deleteDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';

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

  const handleSeedEnvases = async () => {
    if (!window.confirm("¿Estás seguro de que querés precargar todos los envases estándar? Esto agregará nuevos items a la colección 'insumos_base'.")) {
      return;
    }

    setLoading(true);
    setStatus("Precargando envases...");

    const envases = [
      { nombre: "Tubo Eppendorf 0.2 ml (PCR)", categoria: "Envases", subcategoria: "Micro-contenedores", tipo_uso: "descartable", perfil_impresion: "PERFIL_MICRO_TUBOS" },
      { nombre: "Tubo Eppendorf 0.5 ml", categoria: "Envases", subcategoria: "Micro-contenedores", tipo_uso: "descartable", perfil_impresion: "PERFIL_MICRO_TUBOS" },
      { nombre: "Tubo Eppendorf 1.5 ml", categoria: "Envases", subcategoria: "Micro-contenedores", tipo_uso: "descartable", perfil_impresion: "PERFIL_MICRO_TUBOS" },
      { nombre: "Tubo Eppendorf 2.0 ml", categoria: "Envases", subcategoria: "Micro-contenedores", tipo_uso: "descartable", perfil_impresion: "PERFIL_MICRO_TUBOS" },
      { nombre: "Criovial 2.0 ml", categoria: "Envases", subcategoria: "Micro-contenedores", tipo_uso: "descartable", perfil_impresion: "PERFIL_MICRO_TUBOS" },
      { nombre: "Criovial 5.0 ml", categoria: "Envases", subcategoria: "Micro-contenedores", tipo_uso: "descartable", perfil_impresion: "PERFIL_MICRO_TUBOS" },
      
      { nombre: "Tubo Falcon 15 ml", categoria: "Envases", subcategoria: "Tubos y Placas", tipo_uso: "descartable", perfil_impresion: "PERFIL_SLIM_PETRI" },
      { nombre: "Tubo Falcon 50 ml", categoria: "Envases", subcategoria: "Tubos y Placas", tipo_uso: "descartable", perfil_impresion: "PERFIL_SLIM_PETRI" },
      { nombre: "Placa de Petri Chica (3 ml / 35mm)", categoria: "Envases", subcategoria: "Tubos y Placas", tipo_uso: "descartable", perfil_impresion: "PERFIL_SLIM_PETRI" },
      { nombre: "Placa de Petri Mediana (6 ml / 60mm)", categoria: "Envases", subcategoria: "Tubos y Placas", tipo_uso: "descartable", perfil_impresion: "PERFIL_SLIM_PETRI" },
      { nombre: "Placa de Petri Estándar (9 ml / 90mm)", categoria: "Envases", subcategoria: "Tubos y Placas", tipo_uso: "descartable", perfil_impresion: "PERFIL_SLIM_PETRI" },
      { nombre: "Placa de Petri Grande (12 ml / 150mm)", categoria: "Envases", subcategoria: "Tubos y Placas", tipo_uso: "descartable", perfil_impresion: "PERFIL_SLIM_PETRI" },
      
      { nombre: "Frasco de Vidrio 250 ml (Café Aglomerado / Común)", categoria: "Envases", subcategoria: "Vidriería y Frascos", tipo_uso: "reutilizable", perfil_impresion: "PERFIL_MEDIO_ESTANDAR" },
      { nombre: "Frasco tipo Nescafé Grande", categoria: "Envases", subcategoria: "Vidriería y Frascos", tipo_uso: "reutilizable", perfil_impresion: "PERFIL_MEDIO_ESTANDAR" },
      { nombre: "Frasco de Vidrio 1 Litro (Schott Duran)", categoria: "Envases", subcategoria: "Vidriería y Frascos", tipo_uso: "reutilizable", perfil_impresion: "PERFIL_MEDIO_ESTANDAR" },
      { nombre: "Frasco Gotero Ámbar 60 ml", categoria: "Envases", subcategoria: "Vidriería y Frascos", tipo_uso: "reutilizable", perfil_impresion: "PERFIL_MEDIO_ESTANDAR" },
      
      { nombre: "Matraz Erlenmeyer 125 ml", categoria: "Envases", subcategoria: "Vidriería y Frascos", tipo_uso: "reutilizable", perfil_impresion: "PERFIL_MEDIO_ESTANDAR" },
      { nombre: "Matraz Erlenmeyer 250 ml", categoria: "Envases", subcategoria: "Vidriería y Frascos", tipo_uso: "reutilizable", perfil_impresion: "PERFIL_MEDIO_ESTANDAR" },
      { nombre: "Matraz Erlenmeyer 500 ml", categoria: "Envases", subcategoria: "Vidriería y Frascos", tipo_uso: "reutilizable", perfil_impresion: "PERFIL_MEDIO_ESTANDAR" },
      { nombre: "Matraz Erlenmeyer 1 Litro", categoria: "Envases", subcategoria: "Vidriería y Frascos", tipo_uso: "reutilizable", perfil_impresion: "PERFIL_MEDIO_ESTANDAR" },
      { nombre: "Matraz Erlenmeyer 2 Litros", categoria: "Envases", subcategoria: "Vidriería y Frascos", tipo_uso: "reutilizable", perfil_impresion: "PERFIL_MEDIO_ESTANDAR" },
      
      { nombre: "Probeta Graduada 10 ml", categoria: "Envases", subcategoria: "Vidriería y Frascos", tipo_uso: "reutilizable", perfil_impresion: "PERFIL_MEDIO_ESTANDAR" },
      { nombre: "Probeta Graduada 50 ml", categoria: "Envases", subcategoria: "Vidriería y Frascos", tipo_uso: "reutilizable", perfil_impresion: "PERFIL_MEDIO_ESTANDAR" },
      { nombre: "Probeta Graduada 500 ml", categoria: "Envases", subcategoria: "Vidriería y Frascos", tipo_uso: "reutilizable", perfil_impresion: "PERFIL_MEDIO_ESTANDAR" },
      { nombre: "Probeta Graduada 1 Litro", categoria: "Envases", subcategoria: "Vidriería y Frascos", tipo_uso: "reutilizable", perfil_impresion: "PERFIL_MEDIO_ESTANDAR" },
      { nombre: "Probeta Graduada 2 Litros", categoria: "Envases", subcategoria: "Vidriería y Frascos", tipo_uso: "reutilizable", perfil_impresion: "PERFIL_MEDIO_ESTANDAR" },
      
      { nombre: "Bolsa de Incubación Chica (20 cm)", categoria: "Envases", subcategoria: "Bolsas de Cultivo", tipo_uso: "descartable", perfil_impresion: "PERFIL_MAXI_BOLSA" },
      { nombre: "Bolsa de Incubación Mediana (30 cm)", categoria: "Envases", subcategoria: "Bolsas de Cultivo", tipo_uso: "descartable", perfil_impresion: "PERFIL_MAXI_BOLSA" },
      { nombre: "Bolsa de Incubación Grande (60 cm)", categoria: "Envases", subcategoria: "Bolsas de Cultivo", tipo_uso: "descartable", perfil_impresion: "PERFIL_MAXI_BOLSA" },
      
      { nombre: "Portaobjetos Estándar (75x25mm)", categoria: "Envases", subcategoria: "Microscopía", tipo_uso: "descartable", perfil_impresion: "PERFIL_PORTAOBJETOS" }
    ];

    try {
      const insumosRef = collection(db, 'insumos_base');
      for (const envase of envases) {
        await addDoc(insumosRef, {
          ...envase,
          stock: 0,
          unidad_medida: 'unidades',
          alerta_minimo: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setStatus("✅ Precarga de Envases completada. Ya están disponibles en Insumos Maestro.");
      alert("Se agregaron " + envases.length + " envases a la base de datos.");
    } catch (error) {
      console.error(error);
      setStatus(`❌ Error al precargar: ${error.message}`);
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

      <div className="card" style={{ marginTop: '2rem', borderColor: 'var(--primary-color)', borderWidth: '2px', borderStyle: 'solid' }}>
        <h3 style={{ color: 'var(--primary-color)' }}>🛠️ Utilidades de Precarga (Seeding)</h3>
        <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
          Usá estas opciones para popular la base de datos con información estándar para arrancar rápido.
        </p>
        <button 
          className="btn btn-primary" 
          onClick={handleSeedEnvases} 
          disabled={loading}
          style={{ width: '100%', padding: '1rem', fontSize: '1.2rem' }}
        >
          {loading ? "Procesando..." : "📦 Precargar Envases Estándar"}
        </button>
      </div>
    </div>
  );
}
