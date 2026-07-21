import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

export default function HibridacionEjemplarModal({ 
  batchIds, 
  ejemplarPadre, 
  ejemplarMadre, 
  placaOrigen1Id,
  placaOrigen2Id,
  fechaIngreso, 
  operario,
  modoRepique = false,
  onSaved 
}) {
  const [loading, setLoading] = useState(false);
  const [origenDeclaradoAgotado, setOrigenDeclaradoAgotado] = useState(false);
  const [formData, setFormData] = useState({
    genero: ejemplarPadre?.data?.genero || ejemplarMadre?.data?.genero || '',
    especie: ejemplarPadre?.data?.especie || ejemplarMadre?.data?.especie || '',
    codigo_cepa: '',
    ploidia: 'Diploide',
    tipo_micelio: 'Dicarión',
    mat: 'No determinado',
    observaciones: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const yymmdd = fechaIngreso.replace(/-/g, '').substring(2);
      const seqKey = `EJE_${yymmdd}`;
      const counterRef = doc(db, 'metadata', 'counters');

      await runTransaction(db, async (transaction) => {
        // 1. Generate new Ejemplar ID
        const counterDoc = await transaction.get(counterRef);
        const data = counterDoc.exists() ? counterDoc.data() : {};
        const currentSeq = (data[seqKey] || 0) + 1;
        transaction.set(counterRef, { [seqKey]: currentSeq }, { merge: true });

        const g = (formData.genero || '').substring(0, 3).toUpperCase().replace(/\s/g, '');
        const esp = (formData.especie || '').substring(0, 3).toUpperCase().replace(/\s/g, '');
        const cepa = formData.codigo_cepa ? `-${formData.codigo_cepa}` : '';
        const tm = 'AGA'; // Assume micelio en agar for hibridaciones in placa
        const nnn = String(currentSeq).padStart(3, '0');
        
        const newId = `EJE-${g}${esp}${cepa}-${tm}-${yymmdd}-${nnn}`;
        
        const genPadre = ejemplarPadre?.data?.generacion || 0;
        const genMadre = ejemplarMadre?.data?.generacion || 0;
        const genHijo = Math.max(genPadre, genMadre) + 1;

        // 2. Create the Ejemplar
        const newDocRef = doc(collection(db, 'ejemplares'));
        transaction.set(newDocRef, {
          genero: formData.genero,
          especie: formData.especie,
          codigo_cepa: formData.codigo_cepa,
          ploidia: formData.ploidia,
          tipo_micelio: formData.tipo_micelio,
          mat: formData.mat,
          batch_origen_id: batchIds[0],
          ejemplar_padre_id: ejemplarPadre?.id || null,
          ejemplar_madre_id: ejemplarMadre?.id || null,
          estado: 'En evaluación',
          fecha_ingreso: fechaIngreso,
          observaciones: formData.observaciones,
          operario: operario,
          generacion: genHijo,
          id_semantico: newId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          eliminado: false,
          tipo_material: tm,
          procedencia: 'Generado internamente'
        });

        // 3. Update all related hibridacion batches
        for (const bId of batchIds) {
          const batchRef = doc(db, 'batches', bId);
          transaction.update(batchRef, {
            ejemplar_resultado_id: newId
          });
        }

        // 4. Mark origin plates as depleted if checked
        if (origenDeclaradoAgotado) {
          if (placaOrigen1Id) transaction.update(doc(db, 'batches', placaOrigen1Id), { status: 'Agotado' });
          if (placaOrigen2Id) transaction.update(doc(db, 'batches', placaOrigen2Id), { status: 'Agotado' });
        }
      });

      setLoading(false);
      onSaved();
    } catch (error) {
      console.error(error);
      toast.error('Error al registrar la identidad genética: ' + error.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal-box animate-fade-in" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3>{modoRepique ? '🔬 Registrar Ejemplar por selección de colonia' : 'Registrar nueva identidad genética'}</h3>
        </div>
        <div style={{ padding: '0 1.5rem 1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          {modoRepique
            ? 'Este repique con selección de colonia genera un nuevo Ejemplar derivado. Completá los datos genéticos del derivado seleccionado.'
            : 'Este cruce genera un nuevo Ejemplar. Completá los datos conocidos ahora. Podés editar cuando confirmes viabilidad.'}
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div className="grid-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Género</label>
              <input 
                type="text" className="form-control" required
                value={formData.genero} onChange={e => setFormData({...formData, genero: e.target.value})} 
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Especie</label>
              <input 
                type="text" className="form-control" required
                value={formData.especie} onChange={e => setFormData({...formData, especie: e.target.value})} 
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Código de cepa (opcional)</label>
            <input 
              type="text" className="form-control" 
              placeholder="Ej: HIB-01"
              value={formData.codigo_cepa} onChange={e => setFormData({...formData, codigo_cepa: e.target.value})} 
            />
          </div>

          <div className="grid-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Ploidía</label>
              <select className="form-control" value={formData.ploidia} onChange={e => setFormData({...formData, ploidia: e.target.value})}>
                <option value="Haploide">Haploide</option>
                <option value="Diploide">Diploide</option>
                <option value="No determinado">No determinado</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Tipo de micelio</label>
              <select className="form-control" value={formData.tipo_micelio} onChange={e => setFormData({...formData, tipo_micelio: e.target.value})}>
                <option value="Monocarión">Monocarión</option>
                <option value="Dicarión">Dicarión</option>
                <option value="Polispórico">Polispórico</option>
                <option value="Población">Población</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">MAT</label>
            <select className="form-control" value={formData.mat} onChange={e => setFormData({...formData, mat: e.target.value})}>
              <option value="MAT 1-1">MAT 1-1</option>
              <option value="MAT 1-2">MAT 1-2</option>
              <option value="No determinado">No determinado</option>
              <option value="Desconocido">Desconocido</option>
              <option value="Polispórico">Polispórico</option>
              <option value="N/A">N/A</option>
            </select>
          </div>

          {!modoRepique && (
            <div className="grid-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Padre (MAT 1-1)</label>
                <input type="text" className="form-control" value={ejemplarPadre?.data?.id_semantico || ejemplarPadre?.id || ''} readOnly disabled title={ejemplarPadre?.id} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Madre (MAT 1-2)</label>
                <input type="text" className="form-control" value={ejemplarMadre?.data?.id_semantico || ejemplarMadre?.id || ''} readOnly disabled title={ejemplarMadre?.id} />
              </div>
            </div>
          )}

          {modoRepique && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Ejemplar origen (colonia padre)</label>
              <input type="text" className="form-control" value={ejemplarPadre?.data?.id_semantico || ejemplarPadre?.id || ''} readOnly disabled title={ejemplarPadre?.id} />
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Estado</label>
            <input type="text" className="form-control" value="En evaluación" readOnly disabled style={{ color: '#f59e0b', fontWeight: 'bold' }} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Observaciones</label>
            <textarea 
              className="form-control" rows="2" 
              value={formData.observaciones} onChange={e => setFormData({...formData, observaciones: e.target.value})} 
            />
          </div>

          {!modoRepique && (
            <div className="form-group" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, fontWeight: 'bold' }}>
                <input type="checkbox" checked={origenDeclaradoAgotado} onChange={e => setOrigenDeclaradoAgotado(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem' }} />
                Declarar placas origen como agotadas después de esta inoculación
              </label>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '1.7rem', marginTop: '0.2rem' }}>
                Se marcarán como "Agotado" las placas usadas de ambos padres.
              </p>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '1rem' }}>
            {loading ? 'Guardando...' : '💾 Registrar Identidad Genética'}
          </button>
        </form>
      </div>
    </div>
  );
}
