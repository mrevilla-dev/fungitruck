import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, writeBatch, serverTimestamp, increment, runTransaction, where, collectionGroup } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { generarIdEjemplar, generarIdEvento, generarIdBatch } from '../utils/idGenerator';
import { getTipoMaterialCodigo } from '../utils/tipoMaterialCodes';
import SearchableSelect from './SearchableSelect';
import ScanInput from './ScanInput';
import { uploadFileToDrive } from '../services/driveService';
import { useMediosDisponibles } from '../hooks/useMediosDisponibles';
import { opcionesDe } from '../utils/vocabulario';
import toast from 'react-hot-toast';

function extraerCodigoMedio(alias) {
  if (!alias) return 'MED';
  const partes = alias.split(' ');
  const codigo = partes.find(p =>
    !['lote', 'batch', 'nro', 'n°'].includes(p.toLowerCase()) && isNaN(p)
  );
  return (codigo || 'MED').toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

export default function DerivacionEsporomaModal({ esporoma, onClose }) {
  const [loading, setLoading] = useState(false);
  const [authName, setAuthName] = useState('Sistema');

  const [salas, setSalas] = useState([]);

  const [tipoDerivacion, setTipoDerivacion] = useState('seca'); // 'seca' o 'humeda'
  const [formData, setFormData] = useState({
    tipo_material: 'sello_esporas',
    tipo_micelio: 'polisporico',
    ploidia: 'haploide',
    medio_prep_id: null,
    sala_destino_id: null,
    temperatura: '',
    tecnica: '',
    observaciones: ''
  });
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fotoInputRef = useRef(null);
  const [crearBatch, setCrearBatch] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (auth.currentUser) {
      setAuthName(auth.currentUser.displayName || auth.currentUser.email || 'Sistema');
    }
    const unsubSalas = onSnapshot(collection(db, 'salas'), snap => {
      setSalas(snap.docs.map(d => ({ id: d.id, nombre: `${d.nombre} (${d.tipo || ''})`, ...d.data() })));
    });
    return () => { unsubSalas(); };
  }, []);

  const mediosDisponibles = useMediosDisponibles();

  const handleChangeTipo = (tipo) => {
    setTipoDerivacion(tipo);
    setCrearBatch(false);
    setFormData(prev => ({
      ...prev,
      tipo_material: tipo === 'seca' ? 'sello_esporas' : 'explanto',
      tipo_micelio: tipo === 'seca' ? 'polisporico' : 'dicarion',
      ploidia: tipo === 'seca' ? 'haploide' : 'nn',
      tecnica: tipo === 'humeda' ? 'aislamiento_primario' : ''
    }));
  };

  const handleFotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (tipoDerivacion === 'humeda' && crearBatch) {
      if (!formData.medio_prep_id) return toast.error("Falta seleccionar el medio preparado.");
      if (!formData.sala_destino_id) return toast.error("Falta seleccionar la sala de destino.");
    }

    setLoading(true);
    try {
      const todayIso = new Date().toISOString().split('T')[0];
      const datePart = todayIso.replace(/-/g, '').slice(2);
      const seqKeyEsp = `ESP_${datePart}`;
      const batchSeqKey = `batches_${datePart}`;
      
      let seqEsp = 1;
      let seqBatch = 1;
      
      await runTransaction(db, async (t) => {
        const counterRef = doc(db, 'metadata', 'counters');
        const docSnap = await t.get(counterRef);
        const data = docSnap.exists() ? docSnap.data() : {};
        
        seqEsp = (data[seqKeyEsp] || 0) + 1; // Usamos la misma secuencia para el ID del ejemplar
        seqBatch = (data[batchSeqKey] || 0) + 1;
        
        const updates = { [seqKeyEsp]: seqEsp };
        if (tipoDerivacion === 'humeda' && crearBatch) {
          updates[batchSeqKey] = seqBatch + 1;
        }
        t.set(counterRef, updates, { merge: true });
      });

      // Subir foto a Drive si hay una seleccionada
      let fotoUrl = null;
      if (fotoFile) {
        setUploadProgress(5);
        const driveResult = await uploadFileToDrive(fotoFile, (prog) => setUploadProgress(Math.round(prog * 0.5)));
        fotoUrl = driveResult?.imageUrl || driveResult?.url || null;
        setUploadProgress(50);
      }

      const wb = writeBatch(db);

      const ejemplarId = generarIdEjemplar({
        genero: esporoma.genero, especie: esporoma.especie, codigo_cepa: esporoma.codigo_cepa,
        tipo_micelio_codigo: getTipoMaterialCodigo(formData.tipo_material), fecha_iso: todayIso, secuencia: seqEsp
      });

      wb.set(doc(db, 'ejemplares', ejemplarId), {
        id: ejemplarId,
        esporoma_origen_id: esporoma.id,
        genero: esporoma.genero || null,
        especie: esporoma.especie || null,
        codigo_cepa: esporoma.codigo_cepa || null,
        tipo_micelio: formData.tipo_micelio || null,
        ploidia: formData.ploidia || null,
        tipo_material: formData.tipo_material || null,
        tecnica_aislamiento: formData.tecnica || null,
        observaciones: formData.observaciones || null,
        fotoUrl: fotoUrl,
        fechaIngreso: todayIso,
        procedencia: 'Interna',
        externo: false,
        operator: authName,
        estado: 'Activo',
        eliminado: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      let resText = `✅ Derivación exitosa.\nNuevo Ejemplar: ${ejemplarId}`;

      if (tipoDerivacion === 'humeda' && crearBatch) {
        const eventoId = generarIdEvento({
          genero: esporoma.genero, especie: esporoma.especie, codigo_cepa: esporoma.codigo_cepa,
          tecnica_codigo: formData.tecnica, fecha_iso: todayIso, secuencia: seqEsp
        });

        wb.set(doc(db, 'eventos_aislamiento', eventoId), {
          id: eventoId,
          ejemplar_resultante_id: ejemplarId,
          esporoma_origen_id: esporoma.id,
          tecnica: formData.tecnica,
          fecha: todayIso,
          operador: authName,
          createdAt: serverTimestamp()
        });

        const medioOpt = mediosDisponibles.find(m => m.id === formData.medio_prep_id);
        const salaOpt = salas.find(s => s.id === formData.sala_destino_id);
        const codMedio = extraerCodigoMedio(medioOpt?.medio?.alias || medioOpt?.medio?.codigo);

        const batchId = generarIdBatch({
          genero: esporoma.genero, especie: esporoma.especie, codigo_cepa: esporoma.codigo_cepa,
          codigo_medio: codMedio, fecha_iso: todayIso, secuencia_diaria: seqBatch
        });

        const soporteFinal = medioOpt?.type === 'sub' ? medioOpt.sub.tipo_unidad : medioOpt?.medio?.tipo_soporte || medioOpt?.medio?.soporte || 'No definido';
        wb.set(doc(db, 'batches', batchId), {
          experimento_id: null,
          tratamiento_id: null,
          atributos_experimentales: {},
          id: batchId,
          genero: esporoma.genero, especie: esporoma.especie,
          ejemplarId: ejemplarId,
          medioPrepId: medioOpt?.medio?.id || null,
          fraccionId: medioOpt?.type === 'sub' ? medioOpt.sub.id : null,
          destinoId: salaOpt?.id || null,
          destinoNombre: salaOpt?.nombre || '',
          operador: authName,
          fechaInoculacion: todayIso,
          status: 'Inoculado',
          tipo_inoculacion: 'aislamiento_primario',
          es_aislamiento_primario: true,
          destino_criopreservacion: false,
          soporte: soporteFinal,
          createdAt: serverTimestamp()
        });

        if (medioOpt) {
          if (medioOpt.type === 'sub') {
            const sfRef = doc(db, 'medios_preparados', medioOpt.medio.id, 'subfracciones', medioOpt.sub.id);
            wb.update(sfRef, { disponible: increment(-1) });
            if ((medioOpt.sub.disponible ?? 0) <= 1) {
              const mRef = doc(db, 'medios_preparados', medioOpt.medio.id);
              wb.update(mRef, { subfracciones_disponibles: increment(-1) });
            }
          } else {
            const medioRef = doc(db, 'medios_preparados', medioOpt.medio.id);
            wb.update(medioRef, { 'stock_bulk.cantidad_actual': increment(-1) });
          }
        }

        resText += `\nNuevo Batch: ${batchId}`;
      }

      await wb.commit();
      toast(resText);
      onClose();
    } catch (error) {
      console.error(error);
      toast.error(`Error al guardar: ${error.message}. Tus datos NO se borraron, podés reintentar.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>Nueva Derivación Asincrónica</h3>
          <button className="modal-close" onClick={onClose} disabled={loading}>×</button>
        </div>

        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Extrayendo material biológico del Esporoma origen <strong>{esporoma.id}</strong> ({esporoma.genero} {esporoma.especie}).
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="radio" name="tipoDerivacion" checked={tipoDerivacion === 'seca'} onChange={() => handleChangeTipo('seca')} />
              <span>Derivación Seca (Solo Guardar)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="radio" name="tipoDerivacion" checked={tipoDerivacion === 'humeda'} onChange={() => handleChangeTipo('humeda')} />
              <span>Derivación Húmeda (Cultivar / Batch)</span>
            </label>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Tipo de Material</label>
              <select className="form-control" value={formData.tipo_material} onChange={e => setFormData({ ...formData, tipo_material: e.target.value })} required>
                {opcionesDe('tipo_material').map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de Micelio</label>
              <select className="form-control" value={formData.tipo_micelio} onChange={e => setFormData({ ...formData, tipo_micelio: e.target.value })}>
                {opcionesDe('tipo_micelio').map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ploidía</label>
              <select className="form-control" value={formData.ploidia} onChange={e => setFormData({ ...formData, ploidia: e.target.value })}>
                {opcionesDe('ploidia').map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {tipoDerivacion === 'humeda' && (
            <div className="grid-2 animate-fade-in" style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px' }}>
              <div className="form-group" style={{ zIndex: 100, position: 'relative' }}>
                <label className="form-label">Medio Preparado *</label>
                <SearchableSelect 
                  options={mediosDisponibles} 
                  value={formData.medio_prep_id || ''} 
                  onChange={val => setFormData({ ...formData, medio_prep_id: val })} 
                  placeholder="-- Buscar Medio --" 
                />
                <div style={{ marginTop: '0.5rem' }}>
                  <ScanInput
                    onScan={async (scannedId) => {
                      const id = scannedId.trim();
                      const opt = mediosDisponibles.find(m => m.id === id);
                      if (opt) {
                        setFormData({ ...formData, medio_prep_id: opt.id });
                        toast.success(`Medio seleccionado: ${opt.nombre}`);
                      } else {
                        toast.error(`No se encontró medio: ${id}`);
                      }
                    }}
                    label="📷 Escanear QR del Medio"
                  />
                </div>
              </div>
              <div className="form-group" style={{ zIndex: 90, position: 'relative' }}>
                <label className="form-label">Sala Destino *</label>
                <SearchableSelect 
                  options={salas} 
                  value={formData.sala_destino_id || ''} 
                  onChange={val => setFormData({ ...formData, sala_destino_id: val })} 
                  placeholder="-- Buscar Sala --" 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Técnica Aislamiento</label>
                <select className="form-control" value={formData.tecnica} onChange={e => setFormData({ ...formData, tecnica: e.target.value })}>
                  <option value="">-- Seleccionar --</option>
                  {opcionesDe('tecnica').map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Temp. Incubación</label>
                <input type="text" className="form-control" value={formData.temperatura} onChange={e => setFormData({ ...formData, temperatura: e.target.value })} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={crearBatch}
                    onChange={e => setCrearBatch(e.target.checked)}
                  />
                  <span>Crear batch y consumir medio (marcar si vas a inocular ahora)</span>
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Si no marcás, solo se crea el ejemplar (identidad genética) sin consumir insumos.
                </p>
              </div>
            </div>
          )}

          {/* Bug 3: Observaciones y Foto — siempre visibles */}
          <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Observaciones</label>
              <textarea
                className="form-control"
                rows={3}
                value={formData.observaciones}
                onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
                placeholder="Notas adicionales sobre la derivación..."
              />
            </div>
            <div className="form-group">
              <label className="form-label">Foto</label>
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFotoChange}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fotoInputRef.current?.click()}
              >
                📷 {fotoFile ? fotoFile.name : 'Seleccionar foto'}
              </button>
              {fotoPreview && (
                <img
                  src={fotoPreview}
                  alt="Preview"
                  style={{ marginTop: '0.5rem', maxWidth: '100%', maxHeight: '160px', borderRadius: '8px', objectFit: 'cover' }}
                />
              )}
              {loading && uploadProgress > 0 && uploadProgress < 100 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Subiendo foto... {uploadProgress}%
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : '💾 Registrar Derivación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
