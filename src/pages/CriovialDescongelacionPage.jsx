import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCriovialById, registrarDescongelacion } from '../services/criobancService';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import toast from 'react-hot-toast';

export default function CriovialDescongelacionPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [criovial, setCriovial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Opciones de inventario (Medios, Salas)
  const [medios, setMedios] = useState([]);
  const [salas, setSalas] = useState([]);

  // Formulario principal
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [operario, setOperario] = useState('');
  const [usoParcial, setUsoParcial] = useState(false);
  const [motivo, setMotivo] = useState('');

  // Viabilidad
  const [metodoViabilidad, setMetodoViabilidad] = useState('Sin evaluación');
  const [viabilidadData, setViabilidadData] = useState({
    colonias: '',
    dilucion: '',
    volumen: '',
    porcentaje: '',
    notas_otro: ''
  });

  // Batch (Lote) Nuevo
  const [generarBatch, setGenerarBatch] = useState(false);
  const [batchData, setBatchData] = useState({
    fecha_inoculacion: new Date().toISOString().split('T')[0],
    medio_cultivo: '',
    sala: ''
  });

  useEffect(() => {
    // Cargar el criovial
    getCriovialById(id)
      .then(data => {
        if (data.estado !== 'Criopreservado') {
          setError('El criovial no está activo (Criopreservado).');
        }
        setCriovial(data);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));

    // Cargar listas de medios y salas
    const unsubMedios = onSnapshot(query(collection(db, 'medios'), orderBy('fecha_preparacion', 'desc')), snap => {
      setMedios(snap.docs.map(d => ({id: d.id, ...d.data()})));
    });
    const unsubSalas = onSnapshot(query(collection(db, 'salas'), orderBy('nombre', 'asc')), snap => {
      setSalas(snap.docs.map(d => ({id: d.id, ...d.data()})));
    });

    return () => {
      unsubMedios();
      unsubSalas();
    };
  }, [id]);

  const ufcCalculado = React.useMemo(() => {
    if (metodoViabilidad === 'UFC placa') {
      const col = parseFloat(viabilidadData.colonias);
      const dil = parseFloat(viabilidadData.dilucion);
      const vol = parseFloat(viabilidadData.volumen);
      if (!isNaN(col) && !isNaN(dil) && !isNaN(vol) && dil > 0 && vol > 0) {
        return (col / (dil * vol)).toFixed(2);
      }
    }
    return null;
  }, [metodoViabilidad, viabilidadData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!operario) {
      toast.error("Operario es obligatorio.");
      return;
    }

    if (generarBatch) {
      if (!batchData.medio_cultivo || !batchData.sala) {
        toast.error("Si generás un nuevo batch, debes indicar el medio y la sala.");
        return;
      }
    }

    setGuardando(true);
    try {
      const datosDesc = {
        fecha,
        operario,
        uso_parcial: usoParcial,
        motivo,
        metodo_viabilidad: metodoViabilidad,
        datos_viabilidad: {
          ...viabilidadData,
          ufc_calculado: ufcCalculado
        }
      };

      const crearBatchObj = generarBatch ? batchData : null;

      await registrarDescongelacion(id, datosDesc, crearBatchObj);
      navigate(`/criobanco/criovial/${id}`);
    } catch (err) {
      console.error(err);
      toast.error('Error registrando descongelación: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>🔄 Cargando datos...</div>;
  if (error) return (
    <div style={{ padding: '2rem' }}>
      <div style={{ color: 'red', marginBottom: '1rem' }}>⚠️ {error}</div>
      <button className="btn btn-outline" onClick={() => navigate(`/criobanco/criovial/${id}`)}>Volver al detalle</button>
    </div>
  );
  if (!criovial) return null;

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '4rem', maxWidth: '800px', margin: '0 auto' }}>
      
      {/* Header Contextual */}
      <div style={{ marginBottom: '2rem' }}>
        <button className="btn btn-outline" onClick={() => navigate(-1)} style={{ marginBottom: '1rem', width: 'auto' }}>
          ← Volver
        </button>
        <h1 style={{ margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '2rem' }}>🌡️</span> Registrar Descongelación
        </h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          Criovial: <strong>{id}</strong> — {criovial.genero} {criovial.especie} {criovial.cepa ? `(${criovial.cepa})` : ''}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        
        {/* INFO GENERAL */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Datos Generales</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Fecha (*)</label>
              <input type="date" required className="form-control" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Operario (*)</label>
              <input type="text" required className="form-control" value={operario} onChange={e => setOperario(e.target.value)} placeholder="Nombre" />
            </div>
          </div>
          
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label">Motivo / Notas</label>
            <textarea className="form-control" rows="2" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Control de calidad, reactivación de cepa..."></textarea>
          </div>

          <div style={{ marginTop: '1rem', background: 'rgba(59, 130, 246, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>
              <input 
                type="checkbox" 
                checked={usoParcial} 
                onChange={e => setUsoParcial(e.target.checked)} 
                style={{ width: '1.2rem', height: '1.2rem' }}
              />
              Uso Parcial
            </label>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Si se marca, el criovial quedará en estado <strong>Parcialmente usado</strong> y seguirá activo. 
              Si no se marca, se considerará consumido y pasará a estado <strong>Agotado</strong>.
            </p>
          </div>
        </div>

        {/* VIABILIDAD */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Evaluación de Viabilidad</h3>
          <div className="form-group">
            <label className="form-label">Método</label>
            <select className="form-control" value={metodoViabilidad} onChange={e => setMetodoViabilidad(e.target.value)}>
              <option value="Sin evaluación">Sin evaluación</option>
              <option value="UFC placa">UFC placa</option>
              <option value="UFC líquido">UFC líquido</option>
              <option value="MTT">MTT</option>
              <option value="Citometría">Citometría</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          {metodoViabilidad === 'UFC placa' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem', background: 'var(--background-color)', padding: '1rem', borderRadius: '8px' }}>
              <div className="form-group">
                <label className="form-label">Colonias</label>
                <input type="number" step="0.01" className="form-control" value={viabilidadData.colonias} onChange={e => setViabilidadData({...viabilidadData, colonias: e.target.value})} placeholder="Ej: 50" />
              </div>
              <div className="form-group">
                <label className="form-label">Dilución</label>
                <input type="number" step="0.000001" className="form-control" value={viabilidadData.dilucion} onChange={e => setViabilidadData({...viabilidadData, dilucion: e.target.value})} placeholder="Ej: 0.001 (10^-3)" />
              </div>
              <div className="form-group">
                <label className="form-label">Volumen (ml)</label>
                <input type="number" step="0.01" className="form-control" value={viabilidadData.volumen} onChange={e => setViabilidadData({...viabilidadData, volumen: e.target.value})} placeholder="Ej: 0.1" />
              </div>
              
              <div style={{ gridColumn: 'span 3', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)', fontSize: '1.1rem' }}>
                Cálculo UFC/ml: {ufcCalculado ? `${ufcCalculado} UFC/ml` : '—'}
              </div>
            </div>
          )}

          {(metodoViabilidad === 'MTT' || metodoViabilidad === 'Citometría') && (
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Porcentaje de Viabilidad (%)</label>
              <input type="number" step="0.1" className="form-control" value={viabilidadData.porcentaje} onChange={e => setViabilidadData({...viabilidadData, porcentaje: e.target.value})} placeholder="Ej: 85.5" />
            </div>
          )}

          {metodoViabilidad === 'Otro' && (
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Especificar método y resultado</label>
              <textarea className="form-control" rows="2" value={viabilidadData.notas_otro} onChange={e => setViabilidadData({...viabilidadData, notas_otro: e.target.value})}></textarea>
            </div>
          )}
        </div>

        {/* RECUPERACIÓN (NUEVO BATCH) */}
        <div className="card" style={{ marginBottom: '2rem', borderLeft: '4px solid #10b981' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>🌱 Recuperación (Nuevo Lote)</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'normal' }}>
              <input 
                type="checkbox" 
                checked={generarBatch} 
                onChange={e => setGenerarBatch(e.target.checked)} 
                style={{ width: '1.2rem', height: '1.2rem' }}
              />
              Generar Lote en Inventario
            </label>
          </h3>

          {generarBatch && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem', animation: 'fadeIn 0.3s' }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Fecha de Inoculación (*)</label>
                <input type="date" className="form-control" value={batchData.fecha_inoculacion} onChange={e => setBatchData({...batchData, fecha_inoculacion: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Medio de Cultivo (*)</label>
                <select className="form-control" value={batchData.medio_cultivo} onChange={e => setBatchData({...batchData, medio_cultivo: e.target.value})}>
                  <option value="">Seleccione medio...</option>
                  {medios.filter(m => m.estado === 'Aprobado').map(m => (
                    <option key={m.id} value={m.id}>{m.id} - {m.tipo_medio}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Sala (*)</label>
                <select className="form-control" value={batchData.sala} onChange={e => setBatchData({...batchData, sala: e.target.value})}>
                  <option value="">Seleccione sala...</option>
                  {salas.map(s => (
                    <option key={s.id} value={s.nombre}>{s.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ACCIONES */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="btn" disabled={guardando}>
            {guardando ? 'Registrando...' : 'Confirmar Descongelación'}
          </button>
        </div>

      </form>
    </div>
  );
}
