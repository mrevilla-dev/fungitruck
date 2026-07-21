import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, serverTimestamp, addDoc, where } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import SalaFormModal from '../components/SalaFormModal';
import toast from 'react-hot-toast';

function SalaCard({ sala, onDesinfectar, onEdit }) {
  const [batches, setBatches] = useState([]);
  const [showBatches, setShowBatches] = useState(false);
  const [equipos, setEquipos] = useState([]);
  const [showEquipos, setShowEquipos] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (showBatches) {
      const q = query(collection(db, 'batches'), where('destinoId', '==', sala.id), where('status', 'not-in', ['Cosechado', 'Contaminado']));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setBatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      return unsubscribe;
    }
  }, [showBatches, sala.id]);

  useEffect(() => {
    if (showEquipos) {
      const q = query(collection(db, 'equipos'), where('sala_actual_id', '==', sala.id));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setEquipos(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      return unsubscribe;
    }
  }, [showEquipos, sala.id]);

  const getTipoLabel = (tipo) => {
    switch (tipo) {
      case 'incubacion': return '🌡️ Incubación';
      case 'fructificacion': return '🍄 Fructificación';
      case 'laboratorio': return '🔬 Lab';
      case 'deposito': return '📦 Depósito';
      default: return '📦 Otro';
    }
  };

  return (
    <div className="card sala-card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--primary-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className="sala-tipo" style={{ fontSize: '0.65rem', padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>{getTipoLabel(sala.tipo)}</span>
          <h3 style={{ margin: '0.5rem 0 0.25rem 0' }}>{sala.nombre}</h3>
        </div>
        <button className="btn-icon" onClick={onEdit}>✏️</button>
      </div>
      
      {/* JERARQUÍA FÍSICA (Sub-sectores) */}
      <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.1)', padding: '0.75rem', borderRadius: '8px' }}>
        <p style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>📍 Estructura Interna</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {sala.estanterias?.length > 0 ? (
            sala.estanterias.map(est => (
              <span key={est.id} style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-color)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                {est.nombre} ({est.cantidad} est.)
              </span>
            ))
          ) : (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Sin sub-sectores</span>
          )}
        </div>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Últ. Desinfección: <br/>
          <strong>{sala.ultimaDesinfeccion ? new Date(sala.ultimaDesinfeccion).toLocaleDateString() : '---'}</strong>
        </div>
        <div className="flex-gap">
          <button className="btn btn-outline btn-sm" onClick={() => onDesinfectar(sala.id)}>🧼 Clean</button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowEquipos(!showEquipos)}>
            {showEquipos ? 'Ocultar Eq' : `Equipos`}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowBatches(!showBatches)}>
            {showBatches ? 'Cerrar' : `Lotes (${batches.length})`}
          </button>
        </div>
      </div>

      {showBatches && (
        <div className="animate-fade-in" style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '8px' }}>
          {batches.map(b => (
            <div key={b.id} style={{ fontSize: '0.7rem', padding: '0.25rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{b.id}</span>
              <span>{b.especie}</span>
            </div>
          ))}
        </div>
      )}

      {showEquipos && (
        <div className="animate-fade-in" style={{ marginTop: '1rem', background: 'rgba(33, 150, 243, 0.1)', padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(33, 150, 243, 0.3)' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '0.75rem', color: '#2196F3' }}>⚙️ Equipos asignados</h4>
          {equipos.length === 0 ? (
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>No hay equipos en esta sala.</p>
          ) : (
            equipos.map(eq => (
              <div key={eq.id} style={{ fontSize: '0.75rem', padding: '0.35rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ display: 'block' }}>{eq.nombre}</strong>
                  <span style={{ color: 'var(--text-secondary)' }}>{eq.categoria} · {eq.estado_operativo}</span>
                </div>
                <button className="btn-secondary btn-sm" style={{ padding: '2px 6px', fontSize: '0.65rem' }} onClick={() => navigate(`/equipos/${eq.id}`)}>
                  Ficha
                </button>
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
    return onSnapshot(collection(db, 'salas'), (snap) => {
      setSalas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  const handleDesinfectar = async (salaId) => {
    try {
      const now = new Date();
      await updateDoc(doc(db, 'salas', salaId), { ultimaDesinfeccion: now.toISOString() });
      await addDoc(collection(db, `mantenimiento`), {
        tipo: 'Limpieza',
        destinoId: salaId,
        observaciones: 'Desinfección de rutina rápida desde el Panel de Salas',
        createdAt: now.toISOString(),
        operator: 'Maxi'
      });
      toast.success('Desinfección registrada');
    } catch (err) { console.error(err); }
  };

  if (loading) return <div className="p-3">Cargando infraestructura...</div>;

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Infraestructura de Laboratorio</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Gestión jerárquica de Salas y Sub-sectores</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingSala(null); setShowModal(true); }}>➕ Nueva Sala</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {salas.map(sala => (
          <SalaCard key={sala.id} sala={sala} onDesinfectar={handleDesinfectar} onEdit={() => { setEditingSala(sala); setShowModal(true); }} />
        ))}
      </div>

      {showModal && <SalaFormModal sala={editingSala} onClose={() => setShowModal(false)} onSaved={() => setShowModal(false)} />}
    </div>
  );
}
