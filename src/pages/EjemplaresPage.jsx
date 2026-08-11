import { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection, addDoc, query, onSnapshot, orderBy,
  serverTimestamp, doc, updateDoc, where, getDocs, getDoc, runTransaction
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import SearchableSelect from '../components/SearchableSelect';
import NuevoEventoAislamientoModal from '../components/NuevoEventoAislamientoModal';
import toast from 'react-hot-toast';
import { uploadFileToDrive } from '../services/driveService';
import { compressImage } from '../utils/imageUtils';
import PhotoLightbox from '../components/PhotoLightbox';
import { getTipoMaterialCodigo } from '../utils/tipoMaterialCodes';
import { labelDe, opcionesDe, idCanonico } from '../utils/vocabulario';

const ESTADO_CONFIG = {
  Activo:        { badge: '🟢', color: '#10b981' },
  Criopreservado:{ badge: '🔵', color: '#0ea5e9' },
  Agotado:       { badge: '⚫', color: '#64748b' },
  Contaminado:   { badge: '🔴', color: '#ef4444' },
  'En evaluación':{ badge: '🟡', color: '#f59e0b' },
  Inviable:      { badge: '⚪', color: '#4b5563' },
};

const EMPTY_FORM = {
  genero: '',
  especie: '',
  codigo_cepa: '',
  tipo_material: 'DES',
  procedencia: 'Desconocido',
  ploidia: 'Diploide',
  tipo_micelio: 'Dicarión',
  mat: 'N/A',
  esporomaOrigenId: '',
  ejemplarPadreId: '',
  evento_aislamiento_id: '',
  tecnica_aislamiento: '',
  fecha_ingreso: new Date().toISOString().split('T')[0],
  operario: '',
  observaciones: '',
  estado: 'Activo',
  motivo_inviabilidad: '',
};

export default function EjemplaresPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [ejemplares, setEjemplares] = useState([]);
  const [esporomas, setEsporomas] = useState([]);
  const [eventosAislamiento, setEventosAislamiento] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showEventoModal, setShowEventoModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [generacionCalc, setGeneracionCalc] = useState(0);
  const [photo, setPhoto] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lightboxImage, setLightboxImage] = useState(null);

  // Filtros
  const [filtroEspecie, setFiltroEspecie] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroMicelio, setFiltroMicelio] = useState('');

  // Filtros para Eventos de Aislamiento
  const [filtroEventoTexto, setFiltroEventoTexto] = useState('');
  const [filtroEventoTecnica, setFiltroEventoTecnica] = useState('');
  const [filtroEventoOperario, setFiltroEventoOperario] = useState('');
  const [filtroEventoFechaDesde, setFiltroEventoFechaDesde] = useState('');
  const [filtroEventoFechaHasta, setFiltroEventoFechaHasta] = useState('');
  const [ordenamientoEventos, setOrdenamientoEventos] = useState('fecha_desc');

  // Usuario actual
  const [usuarioActivo, setUsuarioActivo] = useState('Sistema');

  useEffect(() => {
    const auth = getAuth();
    const u = auth.currentUser;
    if (u) setUsuarioActivo(u.displayName || u.email || 'Sistema');
  }, []);

  // Escuchar ejemplares
  useEffect(() => {
    const q = query(
      collection(db, 'ejemplares'),
      where('eliminado', '==', false),
      orderBy('fecha_ingreso', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setEjemplares(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      // fallback sin filtro si no hay índice aún
      const q2 = query(collection(db, 'ejemplares'), orderBy('createdAt', 'desc'));
      onSnapshot(q2, snap => {
        setEjemplares(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(e => !e.eliminado)
        );
      });
    });
    return unsub;
  }, []);

  // Escuchar esporomas para el select
  useEffect(() => {
    const q = query(collection(db, 'esporomas'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setEsporomas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Handle routing state for editing or opening modales
  useEffect(() => {
    if (location.state?.action === 'edit' && location.state?.ejemplarId && ejemplares.length > 0) {
      const eje = ejemplares.find(e => e.id === location.state.ejemplarId);
      if (eje) {
        openModal(eje);
        // Clear state to avoid reopening on refresh
        navigate(location.pathname, { replace: true, state: {} });
      }
    } else if (location.state?.action === 'openEventoAislamiento') {
      setShowEventoModal(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, ejemplares, navigate]);

  // Escuchar eventos_aislamiento para el select
  useEffect(() => {
    const q = query(collection(db, 'eventos_aislamiento'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setEventosAislamiento(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Calcular generación cuando cambia el padre
  useEffect(() => {
    if (!formData.ejemplarPadreId) {
      setGeneracionCalc(0);
      return;
    }
    const padre = ejemplares.find(e => e.id === formData.ejemplarPadreId);
    if (padre) {
      setGeneracionCalc((padre.generacion ?? 0) + 1);
    }
  }, [formData.ejemplarPadreId, ejemplares]);

  // Si ploidia cambia a Diploide, resetear mat a N/A
  useEffect(() => {
    if (formData.ploidia === 'Diploide') {
      setFormData(prev => ({ ...prev, mat: 'N/A' }));
    }
  }, [formData.ploidia]);

  const openModal = (eje = null) => {
    if (eje) {
      setEditingId(eje.id);
      setFormData({
        genero: eje.genero || '',
        especie: eje.especie || '',
        codigo_cepa: eje.codigo_cepa || '',
        tipo_material: eje.tipo_material || 'DES',
        procedencia: eje.procedencia || 'Desconocido',
        ploidia: eje.ploidia || 'Diploide',
        tipo_micelio: eje.tipo_micelio || 'Dicarión',
        mat: eje.mat || 'N/A',
        esporomaOrigenId: eje.esporomaOrigenId || '',
        ejemplarPadreId: eje.ejemplarPadreId || '',
        evento_aislamiento_id: eje.evento_aislamiento_id || '',
        tecnica_aislamiento: eje.tecnica_aislamiento || '',
        fecha_ingreso: eje.fecha_ingreso || new Date().toISOString().split('T')[0],
        operario: eje.operario || usuarioActivo,
        observaciones: eje.observaciones || '',
        estado: eje.estado || 'Activo',
        motivo_inviabilidad: eje.motivo_inviabilidad || '',
      });
      setGeneracionCalc(eje.generacion || 0);
    } else {
      setEditingId(null);
      setFormData({ ...EMPTY_FORM, operario: usuarioActivo });
      setGeneracionCalc(0);
    }
    setPhoto(null);
    setUploadProgress(0);
    setShowModal(true);
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setLoading(true);
    try {
      let fotoUrl = editingId
        ? (ejemplares.find(e => e.id === editingId)?.fotoUrl ?? null)
        : null;

      if (photo) {
        let fileToUpload = photo;
        try {
          if (photo.size > 1024 * 1024 * 8) {
            fileToUpload = await compressImage(photo, { maxWidth: 4000, quality: 0.9 });
          }
        } catch (ce) { console.warn('Compress error', ce); }
        const driveResult = await uploadFileToDrive(fileToUpload, p => setUploadProgress(p));
        fotoUrl = driveResult.url;
      }

      const payload = {
        ...formData,
        generacion: generacionCalc,
        fotoUrl,
        estado: formData.estado,
        motivo_inviabilidad: formData.estado === 'Inviable' ? formData.motivo_inviabilidad : '',
        updatedAt: serverTimestamp(),
        fechaIngreso: formData.fecha_ingreso,
        operator: formData.operario,
      };

      if (editingId) {
        await updateDoc(doc(db, 'ejemplares', editingId), payload);
        toast.success('Ejemplar actualizado');
      } else {
        const fechaStr = formData.fecha_ingreso;
        const yymmdd = fechaStr.replace(/-/g, '').substring(2);
        const seqKey = `EJE_${yymmdd}`;
        const counterRef = doc(db, 'metadata', 'counters');

        let newId = '';
        await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          const data = counterDoc.exists() ? counterDoc.data() : {};
          const currentSeq = (data[seqKey] || 0) + 1;
          transaction.set(counterRef, { [seqKey]: currentSeq }, { merge: true });

          const g = (formData.genero || '').substring(0, 3).toUpperCase().replace(/\s/g, '');
          const e = (formData.especie || '').substring(0, 3).toUpperCase().replace(/\s/g, '');
          const cepa = formData.codigo_cepa ? `-${formData.codigo_cepa}` : '';
          const tm = getTipoMaterialCodigo(formData.tipo_material);
          const nnn = String(currentSeq).padStart(3, '0');
          
          newId = `EJE-${g}${e}${cepa}-${tm}-${yymmdd}-${nnn}`;
          
          const newDocRef = doc(collection(db, 'ejemplares'));
          transaction.set(newDocRef, {
            ...payload,
            id_semantico: newId,
            eliminado: false,
            createdAt: serverTimestamp(),
          });
        });

        toast.success('Ejemplar registrado con ID: ' + newId);
      }

      setShowModal(false);
      setEditingId(null);
      setUploadProgress(0);
    } catch (err) {
      console.error(err);
      toast.error('Error: ' + (err.message || 'Error desconocido'));
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  const handleSoftDelete = async (eje) => {
    if (!window.confirm(`¿Eliminar ejemplar ${eje.id_semantico || eje.id}? Se marcará como eliminado.`)) return;
    await updateDoc(doc(db, 'ejemplares', eje.id), { eliminado: true, updatedAt: serverTimestamp() });
  };

  // Filtros aplicados
  const especies = [...new Set(ejemplares.map(e => e.especie).filter(Boolean))].sort();
  const miceliotipos = [...new Set(ejemplares.map(e => e.tipo_micelio).filter(Boolean))].sort();

  const tecnicasUnicas = [...new Set(eventosAislamiento.map(e => e.tecnica).filter(Boolean))].sort();
  const operariosUnicos = [...new Set(eventosAislamiento.map(e => e.operario).filter(Boolean))].sort();

  const filtered = ejemplares.filter(e => {
    if (filtroEspecie && e.especie !== filtroEspecie) return false;
    if (filtroEstado && e.estado !== filtroEstado) return false;
    if (filtroMicelio && e.tipo_micelio !== filtroMicelio) return false;
    return true;
  });

  const eventosFiltrados = eventosAislamiento.filter(ev => {
    if (filtroEventoTexto) {
      const s = filtroEventoTexto.toLowerCase();
      const matchId = (ev.id_semantico || ev.id || '').toLowerCase().includes(s);
      const matchTecnica = (ev.tecnica || '').toLowerCase().includes(s);
      const matchOperario = (ev.operario || '').toLowerCase().includes(s);
      if (!matchId && !matchTecnica && !matchOperario) return false;
    }
    if (filtroEventoTecnica && ev.tecnica !== filtroEventoTecnica) return false;
    if (filtroEventoOperario && ev.operario !== filtroEventoOperario) return false;
    if (filtroEventoFechaDesde && ev.fecha < filtroEventoFechaDesde) return false;
    if (filtroEventoFechaHasta && ev.fecha > filtroEventoFechaHasta) return false;
    return true;
  }).sort((a, b) => {
    if (ordenamientoEventos === 'fecha_desc') return (b.fecha || '').localeCompare(a.fecha || '');
    if (ordenamientoEventos === 'fecha_asc') return (a.fecha || '').localeCompare(b.fecha || '');
    if (ordenamientoEventos === 'tecnica') return (a.tecnica || '').localeCompare(b.tecnica || '');
    if (ordenamientoEventos === 'operario') return (a.operario || '').localeCompare(b.operario || '');
    return 0;
  });

  const esporomasOptions = esporomas.map(e => ({
    id: e.id,
    nombre: `${e.id} — ${e.genero} ${e.especie}`
  }));

  const ejemplaresOptions = ejemplares
    .filter(e => !editingId || e.id !== editingId)
    .map(e => ({
      id: e.id,
      nombre: `${e.id_semantico || e.id} · ${e.especie} · Gen${e.generacion ?? 0} · ${e.mat}`
    }));

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>🧬 Ejemplares — Linajes Genéticos</h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Identidades genéticas / linajes de cultivo. {ejemplares.length} registros totales.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" style={{ width: 'auto' }} onClick={() => setShowEventoModal(true)}>
            🔬 Nuevo Evento de Aislamiento
          </button>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => openModal()}>
            ➕ Nuevo Ejemplar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="no-print" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <select
          className="form-control"
          style={{ width: 'auto', minWidth: '160px' }}
          value={filtroEspecie}
          onChange={e => setFiltroEspecie(e.target.value)}
        >
          <option value="">Todas las especies</option>
          {especies.map(sp => <option key={sp} value={sp}>{sp}</option>)}
        </select>

        <select
          className="form-control"
          style={{ width: 'auto', minWidth: '150px' }}
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {Object.keys(ESTADO_CONFIG).map(st => <option key={st} value={st}>{ESTADO_CONFIG[st].badge} {st}</option>)}
        </select>

        <select
          className="form-control"
          style={{ width: 'auto', minWidth: '160px' }}
          value={filtroMicelio}
          onChange={e => setFiltroMicelio(e.target.value)}
        >
          <option value="">Todos los micelios</option>
          {miceliotipos.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {(filtroEspecie || filtroEstado || filtroMicelio) && (
          <button
            className="btn btn-outline"
            style={{ width: 'auto' }}
            onClick={() => { setFiltroEspecie(''); setFiltroEstado(''); setFiltroMicelio(''); }}
          >
            ✕ Limpiar filtros
          </button>
        )}

        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', alignSelf: 'center', marginLeft: 'auto' }}>
          Mostrando {filtered.length} de {ejemplares.length}
        </span>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          {ejemplares.length === 0
            ? '🧬 No hay ejemplares registrados. Creá el primero.'
            : '🔍 Ningún ejemplar coincide con los filtros.'}
        </div>
      ) : (
        <div className="salas-grid">
          {filtered.map(eje => {
            const estadoCfg = ESTADO_CONFIG[eje.estado] || ESTADO_CONFIG.Activo;
            return (
              <div key={eje.id} className="card sala-card" style={{ position: 'relative' }}>
                {/* Badge estado */}
                <div style={{
                  position: 'absolute', top: '0.75rem', right: '0.75rem',
                  background: estadoCfg.color + '22',
                  color: estadoCfg.color,
                  border: `1px solid ${estadoCfg.color}44`,
                  borderRadius: '20px', padding: '0.2rem 0.6rem',
                  fontSize: '0.75rem', fontWeight: 'bold'
                }}>
                  {estadoCfg.badge} {eje.estado}
                </div>

                {/* Foto */}
                {eje.fotoUrl && (
                  <img
                    src={eje.fotoUrl}
                    alt={eje.especie}
                    className="no-print"
                    onClick={() => setLightboxImage(eje.fotoUrl)}
                    style={{ width: '100%', height: '130px', objectFit: 'cover', borderRadius: '10px', marginBottom: '0.75rem', cursor: 'pointer' }}
                  />
                )}

                {/* ID semántico */}
                <div style={{
                  fontSize: '0.75rem', fontFamily: 'monospace',
                  background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                  borderRadius: '6px', padding: '0.2rem 0.5rem',
                  display: 'inline-block', marginBottom: '0.5rem'
                }}>
                  {eje.id_semantico || eje.id}
                </div>

                <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>
                  <em>{eje.genero}</em> {eje.especie}
                </h3>

                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.75rem' }}>
                  <span>🧫 {eje.tipo_micelio} · {eje.ploidia}</span>
                  {eje.mat && eje.mat !== 'N/A' && <span>🔀 {eje.mat}</span>}
                  <span>🔢 Generación {eje.generacion ?? 0}</span>
                  {eje.fecha_ingreso && <span>📅 {eje.fecha_ingreso}</span>}
                  {eje.operario && <span>👤 {eje.operario}</span>}
                  {eje.evento_aislamiento_id && <span>🔬 Evento Origen: {eje.evento_aislamiento_id}</span>}
                  {eje.batch_origen_id && <span>📍 Batch Origen: {eje.batch_origen_id}</span>}
                </div>

                {eje.observaciones && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
                    {eje.observaciones}
                  </p>
                )}

                {/* Acciones */}
                <div className="flex-gap no-print" style={{ marginTop: 'auto' }}>
                  <button className="edit-icon-btn" title="Editar" onClick={() => openModal(eje)}>✏️</button>
                  <button
                    className="edit-icon-btn"
                    title="Criopreservar"
                    style={{ color: '#3b82f6' }}
                    onClick={() => navigate('/criobanco/nuevo/ejemplar/' + eje.id)}
                  >
                    🧊
                  </button>
                  <button
                    className="edit-icon-btn"
                    title="Eliminar"
                    style={{ color: 'var(--danger-color)' }}
                    onClick={() => handleSoftDelete(eje)}
                  >🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============ EVENTOS DE AISLAMIENTO ============ */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3rem', marginBottom: '1.5rem' }}>
        <h2>📋 Eventos de Aislamiento</h2>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowEventoModal(true)}>
          ➕ Nuevo Evento
        </button>
      </div>

      {/* Filtros de Eventos de Aislamiento */}
      <div className="no-print" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>🔍 Buscar</label>
          <input
            type="text"
            className="form-control"
            placeholder="ID, técnica, operario..."
            value={filtroEventoTexto}
            onChange={e => setFiltroEventoTexto(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Técnica</label>
          <select
            className="form-control"
            value={filtroEventoTecnica}
            onChange={e => setFiltroEventoTecnica(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">Todas las técnicas</option>
            {tecnicasUnicas.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Operario</label>
          <select
            className="form-control"
            value={filtroEventoOperario}
            onChange={e => setFiltroEventoOperario(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">Todos los operarios</option>
            {operariosUnicos.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Desde</label>
          <input
            type="date"
            className="form-control"
            value={filtroEventoFechaDesde}
            onChange={e => setFiltroEventoFechaDesde(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Hasta</label>
          <input
            type="date"
            className="form-control"
            value={filtroEventoFechaHasta}
            onChange={e => setFiltroEventoFechaHasta(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Ordenar por</label>
          <select
            className="form-control"
            value={ordenamientoEventos}
            onChange={e => setOrdenamientoEventos(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="fecha_desc">Más recientes primero</option>
            <option value="fecha_asc">Más antiguos primero</option>
            <option value="tecnica">Por técnica (A-Z)</option>
            <option value="operario">Por operario (A-Z)</option>
          </select>
        </div>
        {(filtroEventoTexto || filtroEventoTecnica || filtroEventoOperario || filtroEventoFechaDesde || filtroEventoFechaHasta) && (
          <button
            className="btn btn-outline"
            style={{ width: 'auto', alignSelf: 'flex-end' }}
            onClick={() => {
              setFiltroEventoTexto('');
              setFiltroEventoTecnica('');
              setFiltroEventoOperario('');
              setFiltroEventoFechaDesde('');
              setFiltroEventoFechaHasta('');
            }}
          >
            ✕ Limpiar
          </button>
        )}
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', alignSelf: 'center', marginLeft: 'auto' }}>
          Mostrando {eventosFiltrados.length} de {eventosAislamiento.length}
        </span>
      </div>

      {eventosFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          {eventosAislamiento.length === 0
            ? 'No hay eventos de aislamiento registrados.'
            : '🔍 Ningún evento coincide con los filtros.'}
        </div>
      ) : (
        <div className="salas-grid">
          {eventosFiltrados.map(ev => (
            <div key={ev.id} className="card" style={{ padding: '1rem', borderLeft: '4px solid #10b981' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '1.1rem' }}>{ev.id_semantico || ev.id}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>📅 {ev.fecha} | 👨‍🔬 {ev.operario}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                    {ev.tecnica}
                  </span>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '1rem', fontSize: '0.85rem' }}>
                {ev.ejemplar_origen_id && <span>🧬 Origen: {ejemplares.find(e => e.id === ev.ejemplar_origen_id)?.id_semantico || ev.ejemplar_origen_id}</span>}
                {ev.medio_utilizado && <span>🧫 Medio: {ev.medio_utilizado}</span>}
                {ev.temperatura_C && <span>🌡️ Temp: {ev.temperatura_C}°C</span>}
                {ev.dias_incubacion && <span>⏳ Incubación: {ev.dias_incubacion} días</span>}
              </div>
              {ev.observaciones && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                  📝 {ev.observaciones}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ============ MODAL ============ */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box animate-fade-in" style={{ maxWidth: '680px', width: '95%' }}>
            <div className="modal-header">
              <h3>{editingId ? '✏️ Editar Ejemplar' : '🧬 Registrar Nuevo Ejemplar'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.25rem' }}>

              {/* Género / Especie */}
              <div className="grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Género <span style={{ color: 'red' }}>*</span></label>
                  <input
                    type="text" className="form-control" required
                    placeholder="Ej: Cordyceps"
                    value={formData.genero}
                    onChange={e => setFormData({ ...formData, genero: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Especie <span style={{ color: 'red' }}>*</span></label>
                  <input
                    type="text" className="form-control" required
                    placeholder="Ej: militaris"
                    value={formData.especie}
                    onChange={e => setFormData({ ...formData, especie: e.target.value })}
                  />
                </div>
              </div>

              {/* Código Cepa / Procedencia */}
              <div className="grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Código de cepa</label>
                  <input
                    type="text" className="form-control"
                    placeholder="Ej: He3, A01"
                    value={formData.codigo_cepa}
                    onChange={e => setFormData({ ...formData, codigo_cepa: e.target.value })}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>⚠️ Evitar puntos (.) y guiones (-)</p>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Procedencia <span style={{ color: 'red' }}>*</span></label>
                  <select
                    className="form-control" required
                    value={formData.procedencia}
                    onChange={e => setFormData({ ...formData, procedencia: e.target.value })}
                  >
                    <option value="Desconocido">Desconocido</option>
                    <option value="Recolección propia">Recolección propia</option>
                    <option value="Compra a productor">Compra a productor</option>
                    <option value="Comercial">Comercial</option>
                    <option value="Generado internamente">Generado internamente</option>
                  </select>
                </div>
              </div>

              {/* Tipo Material */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Forma de ingreso del material <span style={{ color: 'red' }}>*</span></label>
                <select
                  className="form-control" required
                  value={formData.tipo_material}
                  onChange={e => setFormData({ ...formData, tipo_material: e.target.value })}
                >
                  <option value="ESP">Esporas (placa/sella) [ESP]</option>
                  <option value="EXP">Explanto [EXP]</option>
                  <option value="JER">Jeringa (LC) [JER]</option>
                  <option value="AGA">Micelio en agar [AGA]</option>
                  <option value="GRA">Micelio en grano [GRA]</option>
                  <option value="DES">Desconocido [DES]</option>
                </select>
              </div>

              {/* Ploidía / Tipo micelio */}
              <div className="grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Ploidía <span style={{ color: 'red' }}>*</span></label>
                  <select
                    className="form-control"
                    value={formData.ploidia}
                    onChange={e => setFormData({ ...formData, ploidia: e.target.value })}
                  >
                    <option value="Haploide">Haploide</option>
                    <option value="Diploide">Diploide</option>
                    <option value="No determinado">No determinado</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tipo de Micelio <span style={{ color: 'red' }}>*</span></label>
                  <select
                    className="form-control"
                    value={formData.tipo_micelio}
                    onChange={e => setFormData({ ...formData, tipo_micelio: e.target.value })}
                  >
                    <option value="Monocarión">Monocarión</option>
                    <option value="Dicarión">Dicarión</option>
                    <option value="Polispórico">Polispórico</option>
                    <option value="Población">Población</option>
                  </select>
                </div>
              </div>

              {/* MAT — solo si Haploide */}
              {formData.ploidia === 'Haploide' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">MAT (Tipo de Apareamiento) <span style={{ color: 'red' }}>*</span></label>
                  <select
                    className="form-control"
                    value={formData.mat}
                    onChange={e => setFormData({ ...formData, mat: e.target.value })}
                    required
                  >
                    <option value="MAT 1-1">MAT 1-1</option>
                    <option value="MAT 1-2">MAT 1-2</option>
                    <option value="Desconocido">Desconocido</option>
                    <option value="Polispórico">Polispórico</option>
                  </select>
                </div>
              )}

              {/* Esporoma origen */}
              <div className="form-group" style={{ marginBottom: 0, position: 'relative', zIndex: 1300 }}>
                <label className="form-label">Esporoma de Origen (opcional)</label>
                <SearchableSelect
                  options={esporomasOptions}
                  value={formData.esporomaOrigenId}
                  onChange={val => setFormData({ ...formData, esporomaOrigenId: val })}
                  placeholder="— Buscar esporoma —"
                />
              </div>

              {/* Evento de aislamiento vinculado */}
              <div className="form-group" style={{ marginBottom: 0, position: 'relative', zIndex: 1200 }}>
                <label className="form-label">Evento de Aislamiento vinculado (opcional)</label>
                <SearchableSelect
                  options={eventosAislamiento.map(ev => ({
                    id: ev.id,
                    nombre: `${ev.id_semantico || ev.id} · ${ev.tecnica ?? ''} · ${ev.fecha ?? ''}`,
                  }))}
                  value={formData.evento_aislamiento_id}
                  onChange={val => setFormData({ ...formData, evento_aislamiento_id: val })}
                  placeholder="— Buscar evento de aislamiento —"
                />
              </div>

              {/* Técnica de aislamiento directa */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Técnica de aislamiento (opcional)</label>
                <select
                  className="form-control"
                  value={idCanonico('tecnica', formData.tecnica_aislamiento)}
                  onChange={e => setFormData({ ...formData, tecnica_aislamiento: e.target.value })}
                >
                  <option value="">— Seleccionar —</option>
                  {opcionesDe('tecnica').map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Ejemplar padre */}
              <div className="form-group" style={{ marginBottom: 0, position: 'relative', zIndex: 1100 }}>
                <label className="form-label">Ejemplar Padre (opcional)</label>
                <SearchableSelect
                  options={ejemplaresOptions}
                  value={formData.ejemplarPadreId}
                  onChange={val => setFormData({ ...formData, ejemplarPadreId: val })}
                  placeholder="— Buscar ejemplar padre —"
                />
                {formData.ejemplarPadreId && (
                  <p style={{ fontSize: '0.78rem', color: '#10b981', marginTop: '0.3rem' }}>
                    ✅ Generación calculada: <strong>{generacionCalc}</strong> (padre Gen{generacionCalc - 1})
                  </p>
                )}
              </div>

              {/* Generación — solo lectura */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Generación (calculada automáticamente)</label>
                <input
                  type="number" className="form-control"
                  value={generacionCalc} readOnly
                  style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', cursor: 'default' }}
                />
                {!formData.ejemplarPadreId && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Sin padre = Origen Cero (Generación 0)
                  </p>
                )}
              </div>

              {/* Fecha / Operario */}
              <div className="grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha de Ingreso <span style={{ color: 'red' }}>*</span></label>
                  <input
                    type="date" className="form-control" required
                    value={formData.fecha_ingreso}
                    onChange={e => setFormData({ ...formData, fecha_ingreso: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Operario <span style={{ color: 'red' }}>*</span></label>
                  <input
                    type="text" className="form-control" required
                    value={formData.operario}
                    onChange={e => setFormData({ ...formData, operario: e.target.value })}
                  />
                </div>
              </div>

              {/* Estado */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Estado</label>
                <select
                  className="form-control"
                  value={formData.estado}
                  onChange={e => setFormData({ ...formData, estado: e.target.value })}
                >
                  {Object.keys(ESTADO_CONFIG).map(st => (
                    <option key={st} value={st}>{ESTADO_CONFIG[st].badge} {st}</option>
                  ))}
                </select>
              </div>

              {formData.estado === 'Inviable' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Motivo de inviabilidad (opcional)</label>
                  <textarea
                    className="form-control" rows="2"
                    placeholder="Ej: Incompatibilidad MAT, sin crecimiento, morfología anómala..."
                    value={formData.motivo_inviabilidad}
                    onChange={e => setFormData({ ...formData, motivo_inviabilidad: e.target.value })}
                  />
                </div>
              )}

              {/* Observaciones */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Observaciones</label>
                <textarea
                  className="form-control" rows="2"
                  placeholder="Notas adicionales..."
                  value={formData.observaciones}
                  onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
                />
              </div>

              {/* Foto */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Foto del Ejemplar</label>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <label className="btn btn-outline" style={{ width: 'auto', cursor: 'pointer', margin: 0 }}>
                    📷 Cámara
                    <input
                      type="file" accept="image/*" capture="environment"
                      style={{ display: 'none' }}
                      onChange={e => setPhoto(e.target.files[0])}
                    />
                  </label>
                  <label className="btn btn-outline" style={{ width: 'auto', cursor: 'pointer', margin: 0 }}>
                    🖼️ Galería
                    <input
                      type="file" accept="image/*"
                      style={{ display: 'none' }}
                      onChange={e => setPhoto(e.target.files[0])}
                    />
                  </label>
                  {photo && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                      📎 {photo.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Barra de progreso de upload */}
              {loading && uploadProgress > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                    <span>Subiendo imagen...</span>
                    <span>{Math.round(uploadProgress)}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--primary-color)', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              )}

              <button type="submit" className="btn btn-primary" disabled={loading} style={{ minHeight: '48px', fontSize: '1rem' }}>
                {loading
                  ? (uploadProgress > 0 ? '⬆️ Subiendo imagen...' : '💾 Guardando...')
                  : (editingId ? '💾 Guardar Cambios' : '🧬 Registrar Ejemplar')}
              </button>
            </form>
          </div>
        </div>
      )}

      {lightboxImage && (
        <PhotoLightbox
          imageUrl={lightboxImage}
          onClose={() => setLightboxImage(null)}
        />
      )}

      {/* Modal Evento de Aislamiento */}
      {showEventoModal && (
        <NuevoEventoAislamientoModal onClose={() => setShowEventoModal(false)} />
      )}
    </div>
  );
}
