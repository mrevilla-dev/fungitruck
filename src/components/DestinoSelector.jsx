import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import SalaFormModal from './SalaFormModal';

export default function DestinoSelector({ value, onChange, label = "Destino Físico", required = true }) {
  const [salas, setSalas] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Local state for hierarchy
  const [localSalaId, setLocalSalaId] = useState('');
  const [localEstanteriaId, setLocalEstanteriaId] = useState('');
  const [localEstante, setLocalEstante] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'salas'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSalas(docs);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleCreateNew = (newSala) => {
    // Automatically select the newly created sala
    onChange({ target: { name: 'destinoId', value: newSala.id, label: newSala.nombre } });
    setShowModal(false);
  };

  const emitChange = (salaId, estId, estanteNum) => {
    if (!salaId) {
      onChange({ target: { name: 'destinoId', value: '', label: '' }});
      return;
    }
    const sala = salas.find(s => s.id === salaId);
    let label = sala?.nombre || '';
    
    if (estId) {
      const estanteria = sala.estanterias?.find(e => e.id === estId);
      if (estanteria) {
        label += ` - ${estanteria.nombre}`;
        if (estanteNum) {
          label += ` (Estante ${estanteNum})`;
        }
      }
    }
    
    onChange({
      target: {
        name: 'destinoId',
        value: salaId,
        label: label
      }
    });
  };

  const handleSalaChange = (e) => {
    const val = e.target.value;
    if (val === 'ADD_NEW') {
      setShowModal(true);
      return;
    }
    setLocalSalaId(val);
    setLocalEstanteriaId('');
    setLocalEstante('');
    
    // Auto-emit if sala has no estanterias
    const sala = salas.find(s => s.id === val);
    if (!sala || !sala.estanterias || sala.estanterias.length === 0) {
      emitChange(val, null, null);
    } else {
      // Clear out the parent form value until they finish selecting
      onChange({ target: { name: 'destinoId', value: '', label: '' }});
    }
  };

  const handleEstanteriaChange = (e) => {
    const val = e.target.value;
    setLocalEstanteriaId(val);
    setLocalEstante('');
    onChange({ target: { name: 'destinoId', value: '', label: '' }});
  };

  const handleEstanteChange = (e) => {
    const val = e.target.value;
    setLocalEstante(val);
    emitChange(localSalaId, localEstanteriaId, val);
  };

  const selectedSala = salas.find(s => s.id === localSalaId);
  const selectedEstanteria = selectedSala?.estanterias?.find(e => e.id === localEstanteriaId);

  if (loading) return <div className="form-group"><label className="form-label">{label}</label><p>Cargando salas...</p></div>;

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <select
          className="form-control"
          required={required && !localSalaId}
          value={localSalaId}
          onChange={handleSalaChange}
        >
          <option value="">— Seleccioná una sala —</option>
          
          {['incubacion', 'fructificacion', 'frio', 'freezer', 'laboratorio', 'otro'].map(tipo => {
            const groupSalas = salas.filter(s => s.tipo === tipo);
            if (groupSalas.length === 0) return null;
            
            const labels = {
              incubacion: 'Salas de Incubación',
              fructificacion: 'Salas de Fructificación',
              frio: 'Almacenamiento en Frío',
              freezer: 'Ultra-Freezer',
              laboratorio: 'Laboratorio',
              otro: 'Otros Sectores'
            };

            return (
              <optgroup key={tipo} label={labels[tipo]}>
                {groupSalas.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </optgroup>
            );
          })}
          
          <option value="ADD_NEW" style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>
            ➕ Agregar / Configurar Nueva Sala
          </option>
        </select>

        {selectedSala && selectedSala.estanterias && selectedSala.estanterias.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', animation: 'fadeIn 0.3s' }}>
            <select className="form-control" style={{ flex: 2 }} value={localEstanteriaId} onChange={handleEstanteriaChange} required={required}>
              <option value="">— Estructura —</option>
              {selectedSala.estanterias.map(est => (
                <option key={est.id} value={est.id}>{est.nombre}</option>
              ))}
            </select>

            {selectedEstanteria && selectedEstanteria.cantidad > 1 && (
              <select className="form-control" style={{ flex: 1 }} value={localEstante} onChange={handleEstanteChange} required={required}>
                <option value="">— Nivel —</option>
                {Array.from({ length: selectedEstanteria.cantidad }).map((_, i) => (
                  <option key={i} value={i + 1}>Nivel {i + 1}</option>
                ))}
              </select>
            )}
            
            {/* Si la estantería solo tiene 1 nivel, lo auto-seleccionamos u ocultamos el selector de nivel */}
            {selectedEstanteria && selectedEstanteria.cantidad === 1 && (
               <input type="hidden" value="1" />
            )}
          </div>
        )}
        
        {/* Efecto secundario si solo tiene 1 nivel: auto emitir */}
        {selectedEstanteria && selectedEstanteria.cantidad === 1 && localEstante === '' && (
           setTimeout(() => handleEstanteChange({target: {value: '1'}}), 0)
        )}
      </div>

      {showModal && (
        <SalaFormModal 
          onClose={() => setShowModal(false)} 
          onSaved={handleCreateNew} 
        />
      )}
    </div>
  );
}
