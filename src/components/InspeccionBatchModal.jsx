import { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase';
import { uploadFileToDrive } from '../services/driveService';
import { getDriveEmbedUrl } from '../utils/arbolConstants';
import PhotoLightbox from './PhotoLightbox';
import { getIntervaloInspeccion } from '../utils/fechas';
import toast from 'react-hot-toast';

const RESULTADOS = [
  { id: 'viable', label: '✅ Viable' },
  { id: 'contaminado', label: '🧫 Contaminado' },
  { id: 'sin_crecimiento', label: '⏳ Sin crecimiento' },
];

const OPCIONES_REVISAR = [24, 48, 72];

export default function InspeccionBatchModal({ batch, onClose, onGuardada }) {
  const [resultado, setResultado] = useState('viable');
  const [diametroMm, setDiametroMm] = useState(batch?.ultimo_diametro_mm ?? '');
  const [fotos, setFotos] = useState([]);
  const [observaciones, setObservaciones] = useState('');
  const [revisarEn, setRevisarEn] = useState(48);
  const [saving, setSaving] = useState(false);
  const [ufc, setUfc] = useState(''); // P.12
  const [lightbox, setLightbox] = useState(null); // P.14

  useEffect(() => {
    getIntervaloInspeccion().then(h => setRevisarEn(h)).catch(() => {});
  }, []);

  const handleFotos = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const totalSize = [...fotos, ...files].reduce((acc, f) => acc + f.size, 0);
    if (totalSize > 50 * 1024 * 1024) return toast.error('El total de imágenes no puede superar 50MB');
    setFotos(prev => [...prev, ...files]);
  };

  const handleGuardar = async (ySiguiente) => {
    if (!resultado) return toast.error('Seleccioná un resultado');
    if (resultado === 'viable' && (Number(diametroMm) || 0) <= 0) {
      return toast.error('Ingresá el diámetro radial (mm)');
    }
    setSaving(true);
    try {
      let fotosUrls = [];
      if (fotos.length > 0) {
        try {
          for (const file of fotos) {
            const res = await uploadFileToDrive(file);
            const url = res?.imageUrl ?? res?.url;
            if (url) fotosUrls.push(url);
          }
        } catch (err) {
          console.error('Error subiendo fotos de inspección:', err);
          toast.error('No se pudieron subir algunas fotos. Guardando sin ellas.');
        }
      }

      const operator = getAuth().currentUser?.displayName || getAuth().currentUser?.email || 'Sistema';
      const entry = {
        fecha: new Date(),
        resultado,
        diametro_mm: resultado === 'viable' ? (Number(diametroMm) || null) : null,
        ufc: ufc !== '' && ufc != null ? Number(ufc) : null,
        fotos_urls: fotosUrls,
        operator,
        observaciones: observaciones || '',
      };

      const updateData = {
        fotos_seguimiento: arrayUnion(entry),
        ultima_inspeccion: serverTimestamp(),
        ...(resultado === 'viable' && { ultimo_diametro_mm: Number(diametroMm) }),
        updatedAt: serverTimestamp(),
      };

      if (resultado !== 'contaminado') {
        updateData.proxima_revision = new Date(Date.now() + (Number(revisarEn) || 48) * 3600 * 1000);
      } else {
        updateData.status = 'Contaminado';
        updateData.proxima_revision = null;
        if (fotosUrls.length > 0) updateData.foto_evidencia = fotosUrls[0];
        updateData.fotos_auditoria = arrayUnion({
          status_previo: batch?.status,
          status_nuevo: 'Contaminado',
          fecha: new Date(),
          operator,
          observaciones: observaciones || '',
          fotos_urls: fotosUrls,
        });
      }

      await updateDoc(doc(db, 'batches', batch.id), updateData);
      toast.success(`Inspección guardada (${resultado})`);
      onGuardada(batch.id, ySiguiente);
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar inspección: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const historial = batch?.fotos_seguimiento ? [...batch.fotos_seguimiento].reverse() : [];
  const auditorias = batch?.fotos_auditoria ? [...batch.fotos_auditoria].reverse() : [];

  const fechaDe = (f) => f ? (f.toDate ? f.toDate().toLocaleString() : new Date(f).toLocaleString()) : '';

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '620px', width: '95%' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>🔍 Inspeccionar placa</h3>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{batch?.id}</strong>
          {' · '}{batch?.genero || ''} {batch?.especie || ''}
          {' · '}{batch?.destinoNombre || 'Sin sala'}
        </div>

        <div className="form-group">
          <label className="form-label">Resultado *</label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {RESULTADOS.map(r => (
              <button
                key={r.id}
                type="button"
                className="btn btn-sm"
                onClick={() => setResultado(r.id)}
                style={{
                  background: resultado === r.id ? 'var(--accent-color)' : 'rgba(255,255,255,0.06)',
                  color: resultado === r.id ? '#000' : 'var(--text-primary)',
                  fontWeight: 600,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {resultado === 'viable' && (
<div className="form-group">
          <label className="form-label">Diámetro radial (mm) *</label>
          <input
            type="number"
            className="form-control"
            min="0"
            step="0.1"
            value={diametroMm}
            onChange={e => setDiametroMm(e.target.value)}
            placeholder="Ej: 25"
          />
        </div>
      )}

      <div className="form-group">
        <label className="form-label">UFC <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(unidades formadoras de colonias) – opcional</span></label>
        <input
          type="number"
          className="form-control"
          min="0"
          value={ufc}
          onChange={e => setUfc(e.target.value)}
          placeholder="Ej: 120"
        />
      </div>

        <div className="form-group">
          <label className="form-label">Fotos de seguimiento</label>
          <input type="file" accept="image/*" multiple className="form-control" onChange={handleFotos} />
          {fotos.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              {fotos.map((f, i) => (
                <img
                  key={i}
                  src={URL.createObjectURL(f)}
                  alt=""
                  style={{ width: '64px', height: '64px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Observaciones</label>
          <textarea
            className="form-control"
            rows="2"
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
            placeholder="Notas del estado de la placa..."
          />
        </div>

        {resultado !== 'contaminado' && (
          <div className="form-group">
            <label className="form-label">Revisar de nuevo en</label>
            <select className="form-control" value={revisarEn} onChange={e => setRevisarEn(Number(e.target.value))}>
              {OPCIONES_REVISAR.map(h => <option key={h} value={h}>Cada {h} horas</option>)}
            </select>
          </div>
        )}

        {historial.length > 0 && (
          <div className="form-group">
            <label className="form-label">Historial de seguimiento ({historial.length})</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {historial.map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}>
                  {h.fotos_urls && h.fotos_urls.length > 0 && (
                    <img src={getDriveEmbedUrl(h.fotos_urls[0])} alt="" onClick={() => setLightbox(getDriveEmbedUrl(h.fotos_urls[0]))} style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', cursor: 'zoom-in' }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600 }}>{h.resultado}</span>
                    {h.diametro_mm != null && <span> · {h.diametro_mm} mm</span>}
                    {h.ufc != null && <span> · {h.ufc} UFC</span>}
                    {h.fecha && <span style={{ color: 'var(--text-secondary)' }}> · {fechaDe(h.fecha)}</span>}
                    <div style={{ color: 'var(--text-secondary)' }}>{h.operator} · {h.observaciones || ''}</div>
                  </div>
                  {h.fotos_urls && h.fotos_urls.length > 1 && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>+{h.fotos_urls.length - 1}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {auditorias.length > 0 && (
          <div className="form-group">
            <label className="form-label">Auditoría ({auditorias.length})</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {auditorias.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(255,68,68,0.06)', borderRadius: '8px', padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}>
                  {a.fotos_urls && a.fotos_urls.length > 0 && (
                    <img src={getDriveEmbedUrl(a.fotos_urls[0])} alt="" onClick={() => setLightbox(getDriveEmbedUrl(a.fotos_urls[0]))} style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', cursor: 'zoom-in' }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600 }}>{a.status_previo} → {a.status_nuevo}</span>
                    {a.fecha && <span style={{ color: 'var(--text-secondary)' }}> · {fechaDe(a.fecha)}</span>}
                    <div style={{ color: 'var(--text-secondary)' }}>{a.operator} · {a.observaciones || ''}</div>
                  </div>
                  {a.fotos_urls && a.fotos_urls.length > 1 && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>+{a.fotos_urls.length - 1}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="btn btn-outline" onClick={() => handleGuardar(false)} disabled={saving}>
            {saving ? '⏳ Guardando...' : '💾 Guardar'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => handleGuardar(true)} disabled={saving} style={{ fontWeight: 'bold' }}>
            {saving ? '⏳ Guardando...' : '💾 Guardar y siguiente placa'}
          </button>
        </div>
      </div>
      {lightbox && <PhotoLightbox imageUrl={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}