import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, addDoc, doc, writeBatch, serverTimestamp, updateDoc, getDoc, getDocs } from 'firebase/firestore';
import { uploadFileToDrive } from '../services/driveService';
import toast from 'react-hot-toast';

// Simple modal component for adding an audit record
function AddAuditModal({ medioId, onClose, onAdded }) {
  const fileInputCamRef = useRef(null);
  const fileInputGalRef = useRef(null);
  const [tipo, setTipo] = useState('pH medido');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [operario, setOperario] = useState('');
  const [observaciones, setObservaciones] = useState('');
  // Conditional fields
  const [pesoHumeda, setPesoHumeda] = useState('');
  const [pesoSeca, setPesoSeca] = useState('');
  const [phReal, setPhReal] = useState('');
  const [densidadBrix, setDensidadBrix] = useState('');
  const [tiempoExposicion, setTiempoExposicion] = useState('');
  const [tempEstimada, setTempEstimada] = useState('');
  const [agenteSospechoso, setAgenteSospechoso] = useState('');
  const [zonaAfectada, setZonaAfectada] = useState('');
  const [fotoFile, setFotoFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const resetFields = () => {
    setTipo('pH medido');
    setFecha(new Date().toISOString().split('T')[0]);
    setOperario('');
    setObservaciones('');
    setPesoHumeda('');
    setPesoSeca('');
    setPhReal('');
    setDensidadBrix('');
    setTiempoExposicion('');
    setTempEstimada('');
    setAgenteSospechoso('');
    setZonaAfectada('');
    setFotoFile(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const auditRef = doc(collection(db, `medios_preparados/${medioId}/auditorias`));
      const timestamp = new Date().toISOString();
      const auditData = {
        tipo,
        fecha,
        operario,
        observaciones,
        createdAt: serverTimestamp(),
      };

      if (tipo === 'Peso seco') {
        const p1 = parseFloat(String(pesoHumeda).replace(',', '.'));
        const p2 = parseFloat(String(pesoSeca).replace(',', '.'));
        if (!isNaN(p1) && !isNaN(p2) && p1 > 0) {
          auditData.peso_seco_pct = (p2 / p1) * 100;
          auditData.peso_humeda = p1;
          auditData.peso_seca = p2;
        }
      } else if (tipo === 'pH medido') {
        auditData.ph_real = parseFloat(String(phReal).replace(',', '.'));
      } else if (tipo === 'Densidad Brix') {
        auditData.densidad_real_brix = parseFloat(String(densidadBrix).replace(',', '.'));
      } else if (tipo === 'Fuera de cadena de frío') {
        auditData.tiempo_exposicion = parseInt(tiempoExposicion);
        auditData.temp_estimada = parseFloat(String(tempEstimada).replace(',', '.'));
      } else if (tipo === 'Contaminación general') {
        auditData.agente_sospechoso = agenteSospechoso;
        auditData.zona_afectada = zonaAfectada;
      }

      // Photo upload if provided
      if (fotoFile) {
        const { imageUrl } = await uploadFileToDrive(fotoFile);
        auditData.foto_url = imageUrl;
        // Propagate to medio document if needed (e.g., latest foto)
        batch.update(doc(db, 'medios_preparados', medioId), { ultima_foto_auditoria: imageUrl });
      }

      // Write the audit record
      batch.set(auditRef, { ...auditData, timestamp });

      // Propagate fields to medio document according to spec
      const medioRef = doc(db, 'medios_preparados', medioId);
      const updates = {};
      if (tipo === 'Peso seco' && auditData.peso_seco_pct != null) {
        updates.peso_seco_pct = auditData.peso_seco_pct;
      }
      if (tipo === 'pH medido' && auditData.ph_real != null) {
        updates.ph_real = auditData.ph_real;
      }
      if (tipo === 'Densidad Brix' && auditData.densidad_real_brix != null) {
        updates.densidad_real_brix = auditData.densidad_real_brix;
      }
      if (tipo === 'Contaminación general') {
        updates.estado = 'Contaminado';
      }
      if (Object.keys(updates).length > 0) {
        batch.update(medioRef, updates);
      }

      await batch.commit();
      toast.success('Auditoría registrada');
      onAdded();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Error al registrar auditoría');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2000 }}>
      <div className="modal-box animate-fade-in" style={{ maxWidth: '500px' }}>
        <h3>+ Registrar Auditoría</h3>
        <div className="form-group">
          <label>Tipo</label>
          <select className="form-control" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="Peso seco">Peso seco</option>
            <option value="pH medido">pH medido</option>
            <option value="Densidad Brix">Densidad Brix</option>
            <option value="Fuera de cadena de frío">Fuera de cadena de frío</option>
            <option value="Contaminación general">Contaminación general</option>
            <option value="Otro">Otro</option>
          </select>
        </div>
        <div className="form-group">
          <label>Fecha</label>
          <input type="date" className="form-control" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Operario</label>
          <input type="text" className="form-control" value={operario} onChange={e => setOperario(e.target.value)} />
        </div>
        {/* Conditional sections */}
        {tipo === 'Peso seco' && (
          <>
            <div className="form-group">
              <label>Peso muestra humeda (g)</label>
              <input type="number" step="0.01" className="form-control" value={pesoHumeda} onChange={e => setPesoHumeda(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Peso muestra seca (g)</label>
              <input type="number" step="0.01" className="form-control" value={pesoSeca} onChange={e => setPesoSeca(e.target.value)} />
            </div>
          </>
        )}
        {tipo === 'pH medido' && (
          <div className="form-group" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label>pH real</label>
            <input type="number" step="0.01" className="form-control" value={phReal} onChange={e => setPhReal(e.target.value)} />
          </div>
        )}
        {tipo === 'Densidad Brix' && (
          <div className="form-group">
            <label>Densidad (Brix)</label>
            <input type="number" step="0.01" className="form-control" value={densidadBrix} onChange={e => setDensidadBrix(e.target.value)} />
          </div>
        )}
        {tipo === 'Fuera de cadena de frío' && (
          <>
            <div className="form-group">
              <label>Tiempo exposición (min)</label>
              <input type="number" className="form-control" value={tiempoExposicion} onChange={e => setTiempoExposicion(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Temperatura estimada (°C)</label>
              <input type="number" step="0.1" className="form-control" value={tempEstimada} onChange={e => setTempEstimada(e.target.value)} />
            </div>
          </>
        )}
        {tipo === 'Contaminación general' && (
          <>
            <div className="form-group">
              <label>Agente sospechoso</label>
              <input type="text" className="form-control" value={agenteSospechoso} onChange={e => setAgenteSospechoso(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Zona afectada</label>
              <input type="text" className="form-control" value={zonaAfectada} onChange={e => setZonaAfectada(e.target.value)} />
            </div>
          </>
        )}
        <div className="form-group">
          <label>Observaciones</label>
          <textarea className="form-control" rows={3} value={observaciones} onChange={e => setObservaciones(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Foto (opcional)</label>
          <input 
            type="file" 
            accept="image/*" 
            capture="environment" 
            ref={fileInputCamRef} 
            style={{ display: 'none' }} 
            onChange={e => setFotoFile(e.target.files[0])} 
          />
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputGalRef} 
            style={{ display: 'none' }} 
            onChange={e => setFotoFile(e.target.files[0])} 
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
            <button 
              type="button" 
              className="btn btn-outline" 
              onClick={() => fileInputCamRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flex: 1, justifyContent: 'center', minHeight: '48px' }}
            >
              📷 Tomar foto
            </button>
            <button 
              type="button" 
              className="btn btn-outline" 
              onClick={() => fileInputGalRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flex: 1, justifyContent: 'center', minHeight: '48px' }}
            >
              🖼️ Galería
            </button>
          </div>
          {fotoFile && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              ✅ Seleccionado: <strong>{fotoFile.name}</strong>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}

export default function AuditoriaAccordion({ medio, readOnly }) {
  const [open, setOpen] = useState(false);
  const [auditorias, setAuditorias] = useState([]);
  const [showModal, setShowModal] = useState(false);

  // Load audits lazily when accordion opens
  useEffect(() => {
    if (!open) return;
    const fetchAudits = async () => {
      try {
        const q = query(
          collection(db, `medios_preparados/${medio.id}/auditorias`),
          orderBy('timestamp', 'desc')
        );
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAuditorias(list);
      } catch (err) {
        console.error('Error loading auditorías', err);
      }
    };
    fetchAudits();
  }, [open, medio.id]);

  const refresh = () => {
    // Re‑fetch after a new record is added
    setOpen(false);
    setTimeout(() => setOpen(true), 0);
  };

  return (
    <details open={open} className="accordion" style={{ marginTop: '0.5rem' }} onToggle={e => setOpen(e.target.open)}>
      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Auditoría</summary>
      <div style={{ padding: '0.5rem' }}>
        {!readOnly && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)} style={{ marginBottom: '0.5rem' }}>+ Registrar</button>
        )}
        {auditorias.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No hay registros de auditoría.</p>
        ) : (
          auditorias.map(a => (
            <div key={a.id} className="card" style={{ padding: '0.5rem', marginBottom: '0.4rem', background: 'rgba(255,255,255,0.02)', borderLeft: '4px solid var(--accent-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span><strong>{a.tipo}</strong> – {a.fecha}</span>
                <span>{a.operario}</span>
              </div>
              {a.observaciones && <p style={{ marginTop: '0.3rem' }}>{a.observaciones}</p>}
              {/* Show conditional fields compactly */}
              {a.peso_seco_pct && (
                <p>Materia seca: {a.peso_seco_pct.toFixed(2)}%</p>
              )}
              {a.ph_real && <p>pH: {a.ph_real}</p>}
              {a.densidad_real_brix && <p>Densidad Brix: {a.densidad_real_brix}</p>}
              {a.foto_url && (
                <img src={a.foto_url} alt="Foto auditoría" style={{ maxWidth: '100%', marginTop: '0.3rem', borderRadius: '4px' }} />
              )}
            </div>
          ))
        )}
        {showModal && (
          <AddAuditModal medioId={medio.id} onClose={() => setShowModal(false)} onAdded={refresh} />
        )}
      </div>
    </details>
  );
}
