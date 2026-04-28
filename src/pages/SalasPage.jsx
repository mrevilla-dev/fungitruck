import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, serverTimestamp, addDoc, where } from 'firebase/firestore';
import SalaFormModal from '../components/SalaFormModal';

function SalaCard({ sala, onDesinfectar, onEdit }) {
  const [batches, setBatches] = useState([]);
  const [showBatches, setShowBatches] = useState(false);
  const [showLectura, setShowLectura] = useState(false);
  const [lectura, setLectura] = useState({ tempMin: '', tempMax: '', humMin: '', humMax: '' });

  useEffect(() => {
    if (showBatches) {
      const q = query(collection(db, 'batches'), where('destinoId', '==', sala.id), where('status', 'not-in', ['Cosechado', 'Contaminado']));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setBatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      return unsubscribe;
    }
  }, [showBatches, sala.id]);

  const getTipoLabel = (tipo) => {
    switch (tipo) {
      case 'incubacion': return '🌡️ Incubación';
      case 'fructificacion': return '🍄 Fructificación';
      case 'frio': return '❄️ Frío';
      case 'freezer': return '🧊 Freezer -80';
      case 'laboratorio': return '🔬 Lab';
      case 'deposito': return '📦 Depósito';
      default: return '📦 Otro';
    }
  };

  const handleSaveLectura = async () => {
    try {
      await addDoc(collection(db, `salas/${sala.id}/lecturas`), {
        tempMin: Number(lectura.tempMin),
        tempMax: Number(lectura.tempMax),
        humMin: Number(lectura.humMin),
        humMax: Number(lectura.humMax),
        timestamp: serverTimestamp()
      });
      setShowLectura(false);
      setLectura({ tempMin: '', tempMax: '', humMin: '', humMax: '' });
      alert('✅ Lectura ambiental registrada.');
    } catch (err) {
      console.error(err);
      alert('Error al guardar la lectura.');
    }
  };

  return (
    <div className="card sala-card" style={{ cursor: 'default' }}>
      <div className="sala-header">
        <span className="sala-tipo">{getTipoLabel(sala.tipo)}</span>
        <div className="flex-gap">
          <button className="edit-icon-btn" onClick={onEdit}>✏️</button>
        </div>
      </div>
      
      <h3 style={{ margin: '0.5rem 0' }}>{sala.nombre}</h3>
      
      <div className="sala-info">
        {sala.capacidadMax && <p><strong>Capacidad:</strong> {sala.capacidadMax} unidades</p>}
        {sala.parametrosIdeales && (
          <div className="params-badges">
            {sala.parametrosIdeales.tempMin && <span>🌡️ {sala.parametrosIdeales.tempMin}-{sala.parametrosIdeales.tempMax}°C</span>}
            {sala.parametrosIdeales.humMin && <span>💧 {sala.parametrosIdeales.humMin}-{sala.parametrosIdeales.humMax}%</span>}
          </div>
        )}
      </div>

      <div className="desinfeccion-status" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          ✨ Última desinfección: <br/>
          <strong>{sala.ultimaDesinfeccion ? new Date(sala.ultimaDesinfeccion).toLocaleString('es-AR') : 'Sin registros'}</strong>
        </p>
        <div className="flex-gap" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.4rem' }} onClick={() => onDesinfectar(sala.id)}>🧼 Desinfectar</button>
          <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.4rem' }} onClick={() => setShowLectura(!showLectura)}>
            🌡️ Registrar Clima
          </button>
          <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.4rem', marginLeft: 'auto' }} onClick={() => setShowBatches(!showBatches)}>
            {showBatches ? '🙈 Ocultar Lotes' : `👁️ Lotes (${batches.length || '?'})`}
          </button>
        </div>
      </div>

      {showLectura && (
        <div className="batches-inside animate-fade-in" style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0.75rem' }}>
          <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Registrar Lectura del Día</p>
          <div className="grid-2" style={{ gap: '0.5rem' }}>
            <input type="number" step="0.1" className="form-control" placeholder="Temp Min (°C)" value={lectura.tempMin} onChange={e => setLectura({...lectura, tempMin: e.target.value})} />
            <input type="number" step="0.1" className="form-control" placeholder="Temp Max (°C)" value={lectura.tempMax} onChange={e => setLectura({...lectura, tempMax: e.target.value})} />
            <input type="number" step="1" className="form-control" placeholder="Hum Min (%)" value={lectura.humMin} onChange={e => setLectura({...lectura, humMin: e.target.value})} />
            <input type="number" step="1" className="form-control" placeholder="Hum Max (%)" value={lectura.humMax} onChange={e => setLectura({...lectura, humMax: e.target.value})} />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem', padding: '0.4rem' }} onClick={handleSaveLectura} disabled={!lectura.tempMax || !lectura.humMax}>
            Guardar Lectura
          </button>
        </div>
      )}

      {showBatches && (
        <div className="batches-inside" style={{ marginTop: '1.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0.5rem' }}>
          {batches.length === 0 ? (
            <p style={{ fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>No hay lotes activos aquí.</p>
          ) : (
            batches.map(b => (
              <div key={b.id} style={{ fontSize: '0.75rem', padding: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between' }}>
                <span><strong>{b.id}</strong> - {b.genero}</span>
                <span style={{ color: 'var(--text-secondary)' }}>G{b.generacion}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function SalasPage() {
  const [salas, setSalas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSala, setEditingSala] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'salas'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSalas(docs);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleDesinfectar = async (salaId) => {
    try {
      const now = new Date();
      // Update main doc
      await updateDoc(doc(db, 'salas', salaId), {
        ultimaDesinfeccion: now.toISOString(),
      });
      // Add to history
      await addDoc(collection(db, `salas/${salaId}/desinfecciones`), {
        fecha: now.toISOString(),
        operator: 'Maxi', // Default for now
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      alert('Error al registrar desinfección');
    }
  };

  if (loading) return <div className="animate-fade-in">Cargando salas...</div>;

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>Gestión de Salas</h2>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => { setEditingSala(null); setShowModal(true); }}>
          ➕ Nueva Sala
        </button>
      </div>

      <div className="salas-grid">
        {salas.map(sala => (
          <SalaCard key={sala.id} sala={sala} onDesinfectar={handleDesinfectar} onEdit={() => { setEditingSala(sala); setShowModal(true); }} />
        ))}
      </div>

      {salas.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p>No hay salas configuradas todavía.</p>
        </div>
      )}

      {showModal && (
        <SalaFormModal 
          sala={editingSala} 
          onClose={() => setShowModal(false)} 
          onSaved={() => setShowModal(false)} 
        />
      )}
    </div>
  );
}
