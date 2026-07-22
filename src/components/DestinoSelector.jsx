import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import SalaFormModal from './SalaFormModal';
import PropTypes from 'prop-types';

export default function DestinoSelector({ value, onChange, label = "Destino Físico", required = true }) {
  const [salas, setSalas] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Local state for hierarchy
  const [localSalaId, setLocalSalaId] = useState('');
  const [localEquipoId, setLocalEquipoId] = useState('');
  const [localEstanteriaId, setLocalEstanteriaId] = useState('');
  const [localEstante, setLocalEstante] = useState('');

  // Listener: Salas
  useEffect(() => {
    const q = query(collection(db, 'salas'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSalas(docs);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Listener: Equipos que son destino de batches
  useEffect(() => {
    const q = query(collection(db, 'equipos'), where('es_destino_de_batches', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEquipos(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsubscribe;
  }, []);

  const handleCreateNew = (newSala) => {
    onChange({ target: { name: 'destinoId', value: newSala.id, label: newSala.nombre } });
    setShowModal(false);
  };

  const emitChange = (salaId, estId, estanteNum) => {
    if (!salaId) {
      onChange({ target: { name: 'destinoId', value: '', label: '' }});
      return;
    }
    const sala = salas.find(s => s.id === salaId);
    let lbl = sala?.nombre || '';

    if (estId) {
      const estanteria = sala.estanterias?.find(e => e.id === estId);
      if (estanteria) {
        lbl += ` - ${estanteria.nombre}`;
        if (estanteNum) {
          lbl += ` (Estante ${estanteNum})`;
        }
      }
    }

    onChange({ target: { name: 'destinoId', value: salaId, label: lbl } });
  };

  // Handler unificado raíz: distingue EQ: (equipo) de sala normal
  const handleRootChange = (e) => {
    const val = e.target.value;

    // --- Equipo seleccionado ---
    if (val.startsWith('EQ:')) {
      const eqId = val.slice(3);
      const eq = equipos.find(q => q.id === eqId);
      setLocalEquipoId(eqId);
      setLocalSalaId('');
      setLocalEstanteriaId('');
      setLocalEstante('');
      onChange({ target: { name: 'destinoId', value: eqId, label: eq ? `⚙️ ${eq.nombre}` : eqId } });
      return;
    }

    // --- Nueva sala ---
    if (val === 'ADD_NEW') {
      setShowModal(true);
      return;
    }

    // --- Sala seleccionada (comportamiento original) ---
    setLocalEquipoId('');
    setLocalSalaId(val);
    setLocalEstanteriaId('');
    setLocalEstante('');

    const sala = salas.find(s => s.id === val);
    if (!sala || !sala.estanterias || sala.estanterias.length === 0) {
      emitChange(val, null, null);
    } else {
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

  // Valor del select raíz: si hay equipo seleccionado, usamos el prefijo EQ:
  const rootValue = localEquipoId ? `EQ:${localEquipoId}` : localSalaId;

  const selectedSala = salas.find(s => s.id === localSalaId);
  const selectedEstanteria = selectedSala?.estanterias?.find(e => e.id === localEstanteriaId);

  if (loading) return <div className="form-group"><label className="form-label">{label}</label><p>Cargando destinos...</p></div>;

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <select
          className="form-control"
          required={required && !rootValue}
          value={rootValue}
          onChange={handleRootChange}
        >
          <option value="">— Seleccioná un destino —</option>

          {/* ⚙️ Equipos como destino directo */}
          {equipos.length > 0 && (
            <optgroup label="⚙️ Equipos (Destino directo)">
              {equipos.map(eq => (
                <option key={eq.id} value={`EQ:${eq.id}`}>
                  {eq.nombre} · {eq.categoria}
                </option>
              ))}
            </optgroup>
          )}

          {/* 🏠 Salas (igual que antes) */}
          {['incubacion', 'fructificacion', 'frio', 'freezer', 'laboratorio', 'otro'].map(tipo => {
            const groupSalas = salas.filter(s => s.tipo === tipo);
            if (groupSalas.length === 0) return null;

            const tipoLabels = {
              incubacion: '🌡️ Salas de Incubación',
              fructificacion: '🍄 Salas de Fructificación',
              frio: '❄️ Almacenamiento en Frío',
              freezer: '🧊 Ultra-Freezer',
              laboratorio: '🔬 Laboratorio',
              otro: '📦 Otros Sectores'
            };

            return (
              <optgroup key={tipo} label={tipoLabels[tipo]}>
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

        {/* Sub-selectores de estantería/estante (solo aplican a salas) */}
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

            {selectedEstanteria && selectedEstanteria.cantidad === 1 && (
               <input type="hidden" value="1" />
            )}
          </div>
        )}

        {/* Auto-emit si estantería solo tiene 1 nivel */}
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

DestinoSelector.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string,
  required: PropTypes.bool,
};
