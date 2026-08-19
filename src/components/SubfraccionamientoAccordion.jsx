import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { getAuth } from 'firebase/auth';
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  getDoc,
  writeBatch,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  deleteDoc,
  increment,
  addDoc,
} from 'firebase/firestore';
import { uploadFileToDrive } from '../services/driveService';
import toast from 'react-hot-toast';
import PrintLabelsModal from './PrintLabelsModal';

// ── Opciones fijas ─────────────────────────────────────────────────────────────
const TIPO_ENVASE_OPTIONS  = ['Unidad independiente', 'Bolsa', 'Caja', 'Bandeja'];
const UBICACION_OPTIONS    = ['Heladera Lab', 'Heladera Facultad', 'Freezer -20°C', 'Freezer -80°C', 'Temperatura ambiente', 'Otra'];

// ── Extrae el código del alias (ej: de "ML-ECA Lote 1" -> "ECA") ──────────────
function extraerCodigoMedio(alias) {
  if (!alias) return 'MED';
  const partes = alias.split(' ');
  const codigo = partes.find(p =>
    !['lote', 'batch', 'nro', 'n°'].includes(p.toLowerCase()) && isNaN(p)
  );
  return (codigo || 'MED').toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

// ── Genera el ID de bolsa: FRAC-[CODIGO]-[AAAAMMDD]-[A/B/C...] ──────────────
function buildBagId(codigoMedio, existingCount) {
  const today = new Date();
  const yyyymmdd =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
    
  let letterStr = '';
  let temp = existingCount;
  do {
    letterStr = String.fromCharCode(65 + (temp % 26)) + letterStr;
    temp = Math.floor(temp / 26) - 1;
  } while (temp >= 0);
  
  return `FRAC-${codigoMedio}-${yyyymmdd}-${letterStr}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Modal: Nueva Bolsa
// ═══════════════════════════════════════════════════════════════════════════════
export function AddBagModal({ medio, existingBags, salasList, insumosList, onClose, onAdded, onCreated }) {
  const [tipoEnvase,         setTipoEnvase]         = useState('Bolsa');
  const [otroEnvaseNombre,   setOtroEnvaseNombre]   = useState('');
  const [tipoUnidad,         setTipoUnidad]          = useState('Placa Petri');
  const [otroUnidadNombre,   setOtroUnidadNombre]   = useState('');
  const [cantidad,           setCantidad]            = useState('');
  const [volumenPorUnidad,   setVolumenPorUnidad]    = useState('');
  const [porVolumen,         setPorVolumen]          = useState(false);
  const [ubicacion,          setUbicacion]           = useState('Heladera Lab');
  const [ubicacionDetalle,   setUbicacionDetalle]    = useState('');
  const [fecha,              setFecha]               = useState(new Date().toISOString().split('T')[0]);

  const defaultOperario = useMemo(() => {
    const auth = getAuth();
    return auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email || '') : '';
  }, []);

  const [operario,           setOperario]            = useState(defaultOperario);
  const [observaciones,      setObservaciones]       = useState('');
  const [saving,             setSaving]              = useState(false);
  const [globalEnvaseTypes,  setGlobalEnvaseTypes]   = useState([]);
  const [step2Locs,          setStep2Locs]           = useState(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'config', 'tipos_envase');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setGlobalEnvaseTypes(docSnap.data().tipos || []);
        }
      } catch (err) {
        console.error('Error fetching global envase types:', err);
      }
    };
    fetchConfig();
  }, []);

  // Opciones dinámicas de Envase (Bolsa, Caja, Bandeja...)
  const envaseOptions = useMemo(() => {
    const custom = existingBags.map(b => b.tipo_envase).filter(Boolean);
    return Array.from(new Set([...TIPO_ENVASE_OPTIONS, ...globalEnvaseTypes, ...custom, 'Otro']));
  }, [existingBags, globalEnvaseTypes]);

  // Opciones dinámicas de Unidad (Placa Petri, Frasco...)
  const unidadOptions = useMemo(() => {
    const dbEnvases = (insumosList || []).filter(i => i.es_envase).map(i => i.nombre);
    const defaults = ['Placa Petri', 'Frasco 100ml', 'Frasco 500ml', 'Frasco 1L', 'Pote PP'];
    return Array.from(new Set([...defaults, ...dbEnvases, 'Otro']));
  }, [insumosList]);

  // Opciones combinadas de ubicación (Estáticas + Salas)
  const combinedUbicaciones = useMemo(() => {
    const dbSalas = (salasList || []).map(s => s.nombre);
    return Array.from(new Set([...UBICACION_OPTIONS, ...dbSalas]));
  }, [salasList]);

  // ── cantidad_actual del bulk ─────────────────────────────────────────────
  const rawCantidadActual = medio?.stock_bulk?.cantidad_actual ?? medio?.cantidad_actual ?? medio?.stock_total_base ?? 0;
  const cantidadActual = Math.max(0, rawCantidadActual);

  // ── suma de lo ya fraccionado en bolsas existentes ─────────────────────
  const yaFraccionado = existingBags.reduce((sum, b) => {
    const q = b.cantidad ?? 0;
    const v = b.volumen_por_unidad_ml > 0 ? Number(b.volumen_por_unidad_ml) : 1;
    return sum + (q * v);
  }, 0);

  // ── quedan sin fraccionar ─────────────────────────────────────────────
  const disponibleBulk = cantidadActual;

  // ── ID que se asignará a esta bolsa ────────────────────────────────────
  const codigoMedio = extraerCodigoMedio(medio?.alias || medio?.codigo || medio?.id);
  const bagIdPreview = buildBagId(codigoMedio, existingBags.length);

  const handleSave = async () => {
    const qty = Number(cantidad?.toString().replace(',', '.')) || 0;
    const vol = porVolumen ? 1 : (Number(volumenPorUnidad?.toString().replace(',', '.')) || 0);
    const descuento = porVolumen ? qty : (vol > 0 ? (qty * vol) : qty);

    if (!qty || qty <= 0) return toast.error('Ingresá una cantidad válida');
    if (descuento > disponibleBulk) return toast.error(`Solo quedan ${disponibleBulk} disponibles en el bulk, y querés fraccionar ${descuento}`);
    if (!operario.trim())    return toast.error('Ingresá el nombre del operario');

    // Advertencia de operario distinto
    if (defaultOperario && operario.trim() !== defaultOperario) {
      const confirmStr = `Estás por registrar esta bolsa a nombre de "${operario}". ¿Confirmás que es correcto?`;
      if (!window.confirm(confirmStr)) return;
    }

    let finalTipoEnvase = tipoEnvase;
    if (!tipoEnvase) return toast.error('Seleccioná el formato de envasado');
    if (tipoEnvase === 'Otro') {
      const val = otroEnvaseNombre.trim();
      if (!val) return toast.error('Especificá el tipo de envase');
      finalTipoEnvase = val;
    }

    let finalTipoUnidad = tipoUnidad;
    if (!tipoUnidad) return toast.error('Seleccioná la unidad/recipiente');
    if (tipoUnidad === 'Otro') {
      const val = otroUnidadNombre?.trim();
      if (!val) return toast.error('Especificá el tipo de unidad');
      finalTipoUnidad = val;
    }
    setSaving(true);
    try {
      const batch    = writeBatch(db);
      const creadas  = [];

      // Si tipoUnidad es 'Otro', creamos registro en insumos_base con es_envase: true
      if (tipoUnidad === 'Otro') {
        const val = otroUnidadNombre.trim();
        if (!val) {
          setSaving(false);
          return toast.error('Especificá el tipo de unidad');
        }
        const newInsumoRef = doc(collection(db, 'insumos_base'));
        batch.set(newInsumoRef, {
          nombre: val,
          es_envase: true,
          categoria: 'Descartables',
          unidad_medida: 'uds.',
          createdAt: serverTimestamp()
        });
        finalTipoUnidad = val;
      }

      const medioRef = doc(db, 'medios_preparados', medio.id);
      
      // Guardar nuevo tipo de envase si aplica
      if (tipoEnvase === 'Otro') {
        const configRef = doc(db, 'config', 'tipos_envase');
        batch.set(configRef, { tipos: arrayUnion(finalTipoEnvase) }, { merge: true });
      }

      // Guardar sala ID si corresponde
      const salaEncontrada = (salasList || []).find(s => s.nombre === ubicacion);

      if (finalTipoEnvase === 'Unidad independiente') {
        if (!step2Locs) {
          // Iniciar paso 2 (asignación de ubicaciones individuales)
          setSaving(false);
          setStep2Locs(Array.from({length: qty}, (_, i) => ({
            id: buildBagId(codigoMedio, existingBags.length + i),
            ubicacion: ubicacion, // fallback inicial
            ubicacion_detalle: ubicacionDetalle
          })));
          return;
        }

        // Se crean N subfracciones independientes usando las locaciones del paso 2
        for (let i = 0; i < qty; i++) {
          const locConfig = step2Locs[i];
          const newBagId = locConfig.id;
          const currentBagRef = doc(collection(db, `medios_preparados/${medio.id}/subfracciones`));
          
          const sEncontrada = (salasList || []).find(s => s.nombre === (locConfig.ubicacion || ubicacion));

          const singleBagData = {
            id_bolsa:            newBagId,
            tipo_envase:         finalTipoEnvase,
            tipo_unidad:         finalTipoUnidad,
            cantidad:            porVolumen ? qty : 1,
            disponible:          porVolumen ? qty : 1,
            volumen_por_unidad_ml: porVolumen ? 1 : (volumenPorUnidad ? Number(volumenPorUnidad?.toString().replace(',', '.')) : null),
            por_volumen:         porVolumen || null,
            ubicacion:           locConfig.ubicacion || ubicacion,
            ubicacion_id:        sEncontrada?.id || null,
            ubicacion_detalle:   locConfig.ubicacion_detalle || ubicacionDetalle || null,
            fecha,
            operario,
            observaciones:       observaciones || null,
            estado:              'Disponible',
            novedades:           [],
            createdAt:           serverTimestamp(),
          };
          batch.set(currentBagRef, singleBagData);
          creadas.push({ id: currentBagRef.id, medioId: medio.id, ...singleBagData });
        }
        
        batch.update(medioRef, {
          'stock_bulk.cantidad_actual': cantidadActual - descuento,
          total_subfracciones: increment(qty),
          subfracciones_disponibles: increment(qty)
        });
      } else {
        // Se crea un solo contenedor
        const bagRef = doc(collection(db, `medios_preparados/${medio.id}/subfracciones`));
        const bagData = {
          id_bolsa:            bagIdPreview,
          tipo_envase:         finalTipoEnvase,
          tipo_unidad:         finalTipoUnidad,
          cantidad:            porVolumen ? qty : qty,           // por_volumen: ml totales
          disponible:          qty,           // por_volumen: ml totales
          volumen_por_unidad_ml: porVolumen ? 1 : (volumenPorUnidad ? Number(volumenPorUnidad?.toString().replace(',', '.')) : null),
          por_volumen:         porVolumen || null,
          ubicacion,
          ubicacion_id:        salaEncontrada?.id || null,
          ubicacion_detalle:   ubicacionDetalle || null,
          fecha,
          operario,
          observaciones:       observaciones || null,
          estado:              'Disponible',
          novedades:           [],
          createdAt:           serverTimestamp(),
        };

        batch.set(bagRef, bagData);
        creadas.push({ id: bagRef.id, medioId: medio.id, ...bagData });
        batch.update(medioRef, {
          'stock_bulk.cantidad_actual': cantidadActual - descuento,
          total_subfracciones: increment(1),
          subfracciones_disponibles: increment(1)
        });
      }

      await batch.commit();

      // Si el bulk llegó a 0, marcarlo como Agotado
      if (cantidadActual - descuento <= 0) {
        await updateDoc(medioRef, { estado: 'Agotado', fecha_agotamiento: serverTimestamp() });
      }

      toast.success('Bolsa creada correctamente');
      if (typeof onCreated === 'function') onCreated(creadas);
      onAdded();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Error al crear la bolsa: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '560px', width: '95%' }}>
        <h3 style={{ marginBottom: '1rem' }}>+ Nueva bolsa</h3>

        {/* ID autogenerado (solo lectura) */}
        <div className="form-group">
          <label>ID Bolsa <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(autogenerado)</span></label>
          {tipoEnvase === 'Unidad independiente' ? (
            <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Se generarán {Number(cantidad?.toString().replace(',', '.')) || 0} subfracciones independientes. Cada unidad podrá tener una ubicación distinta.
            </div>
          ) : (
            <input
              type="text"
              className="form-control"
              value={bagIdPreview}
              readOnly
              style={{ background: 'rgba(255,255,255,0.05)', cursor: 'default', fontFamily: 'monospace' }}
            />
          )}
        </div>

        {/* Tipo de envase */}
        <div className="form-group">
          <label>Tipo de envase *</label>
          <select className="form-control" value={tipoEnvase} onChange={e => {
            setTipoEnvase(e.target.value);
            setStep2Locs(null);
          }}>
            {envaseOptions.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        {tipoEnvase === 'Otro' && (
          <div className="form-group">
            <label>Especifique el tipo de envase *</label>
            <input
              type="text"
              className="form-control"
              placeholder="Ej: Canasto"
              value={otroEnvaseNombre}
              onChange={e => setOtroEnvaseNombre(e.target.value)}
            />
          </div>
        )}

        {/* Tipo de unidad */}
        <div className="form-group">
          <label>Tipo de unidad *</label>
          <select className="form-control" value={tipoUnidad} onChange={e => setTipoUnidad(e.target.value)}>
            {unidadOptions.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        {tipoUnidad === 'Otro' && (
          <div className="form-group">
            <label>Especifique el tipo de unidad *</label>
            <input
              type="text"
              className="form-control"
              placeholder="Ej: Frasco 250ml"
              value={otroUnidadNombre}
              onChange={e => setOtroUnidadNombre(e.target.value)}
            />
          </div>
        )}

        {/* Cantidad + indicador bulk */}
        <div className="form-group">
          <label>{porVolumen ? 'Volumen total (ml) *' : 'Cantidad de unidades *'}</label>
          <input
            type="number"
            className="form-control"
            min={1}
            value={cantidad}
            onChange={e => {
              setCantidad(e.target.value);
              setStep2Locs(null);
            }}
          />
          <small style={{
            display: 'block',
            marginTop: '0.3rem',
            color: disponibleBulk <= 0 ? 'var(--error-color, #f44)' : 'var(--text-secondary)',
            fontWeight: 500,
          }}>
            {disponibleBulk > 0
              ? `⚗️ Quedan ${disponibleBulk} ${medio?.stock_bulk?.unidad || 'ml'} sin fraccionar en el bulk`
              : '⚠️ El bulk está completamente fraccionado'}
          </small>
        </div>

        {/* Toggle por volumen */}
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={porVolumen} onChange={e => setPorVolumen(e.target.checked)} />
            💧 Este envase se mide por volumen (ml) — se rastrea como X ml, no como "1 unidad de X ml"
          </label>
        </div>

        {/* Volumen por unidad */}
        {!porVolumen && (
        <div className="form-group">
          <label>Volumen por unidad (ml) <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>– opcional</span></label>
          <input
            type="number"
            className="form-control"
            min={0}
            placeholder="Ej: 20"
            value={volumenPorUnidad}
            onChange={e => setVolumenPorUnidad(e.target.value)}
          />
        </div>
        )}

        {/* Disponible (calculado) */}
        <div className="form-group">
          <label>Disponible <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(calculado automáticamente)</span></label>
          <input
            type="text"
            className="form-control"
            value={cantidad ? (porVolumen ? `${cantidad} ml` : `${cantidad} unidades`) : '—'}
            readOnly
            style={{ background: 'rgba(255,255,255,0.05)', cursor: 'default' }}
          />
        </div>

        {/* Ubicación general */}
        <div className="form-group">
          <label>Ubicación {tipoEnvase === 'Unidad independiente' ? '(por defecto)' : '*'}</label>
          <select className="form-control" value={ubicacion} onChange={e => {
            setUbicacion(e.target.value);
            if (step2Locs) {
              setStep2Locs(prev => prev.map(l => ({ ...l, ubicacion: e.target.value })));
            }
          }}>
            {combinedUbicaciones.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        {/* Ubicación detalle general */}
        <div className="form-group">
          <label>Detalle de ubicación <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>– opcional</span></label>
          <input
            type="text"
            className="form-control"
            placeholder="Ej: Estante 3, bolsa roja"
            value={ubicacionDetalle}
            onChange={e => {
              setUbicacionDetalle(e.target.value);
              if (step2Locs) {
                setStep2Locs(prev => prev.map(l => ({ ...l, ubicacion_detalle: e.target.value })));
              }
            }}
          />
        </div>

        {/* Step 2: Ubicaciones individuales */}
        {step2Locs && (
          <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
            <h5 style={{ marginBottom: '0.75rem', color: 'var(--accent-color)' }}>Ubicaciones individuales</h5>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Podés ajustar la ubicación de cada unidad. Si no tocás nada, usarán la ubicación por defecto de arriba.
            </p>
            <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {step2Locs.map((loc, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', minWidth: '70px', fontWeight: 600 }}>{loc.id}</span>
                  <select 
                    className="form-control" 
                    style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                    value={loc.ubicacion} 
                    onChange={e => {
                      const newLocs = [...step2Locs];
                      newLocs[i].ubicacion = e.target.value;
                      setStep2Locs(newLocs);
                    }}
                  >
                    {combinedUbicaciones.map(o => <option key={o}>{o}</option>)}
                  </select>
                  <input 
                    type="text" 
                    className="form-control" 
                    style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                    placeholder="Detalle..."
                    value={loc.ubicacion_detalle}
                    onChange={e => {
                      const newLocs = [...step2Locs];
                      newLocs[i].ubicacion_detalle = e.target.value;
                      setStep2Locs(newLocs);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fecha */}
        <div className="form-group">
          <label>Fecha *</label>
          <input
            type="date"
            className="form-control"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
          />
        </div>

        {/* Operario */}
        <div className="form-group">
          <label>Operario *</label>
          <input
            type="text"
            className="form-control"
            placeholder="Nombre del operario"
            value={operario}
            onChange={e => setOperario(e.target.value)}
          />
        </div>

        {/* Observaciones */}
        <div className="form-group">
          <label>Observaciones <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>– opcional</span></label>
          <textarea
            className="form-control"
            rows={3}
            placeholder="Observaciones generales sobre esta bolsa…"
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : (tipoEnvase === 'Unidad independiente' && !step2Locs ? 'Siguiente (Ubicaciones)' : 'Crear bolsa')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Modal: Sacar Placas / Tubos desde un envase (subfraccionamiento hijo)
// ═══════════════════════════════════════════════════════════════════════════════
export function AddSubBagModal({ medio, parentBag, existingBags, salasList, insumosList, onClose, onAdded, onCreated }) {
  const [tipoEnvase,        setTipoEnvase]        = useState('Bolsa');
  const [otroEnvaseNombre,  setOtroEnvaseNombre]  = useState('');
  const [tipoUnidad,        setTipoUnidad]         = useState('Placa Petri');
  const [otroUnidadNombre,  setOtroUnidadNombre]  = useState('');
  const [cantidadHijas,     setCantidadHijas]     = useState('');
  const [volumenPorUnidad,  setVolumenPorUnidad]  = useState('');
  const [porVolumenHijo,    setPorVolumenHijo]    = useState(false);
  const [cantidadPadre,     setCantidadPadre]     = useState('1');
  const [ubicacion,         setUbicacion]         = useState('Heladera Lab');
  const [ubicacionDetalle,  setUbicacionDetalle]  = useState('');
  const [fecha,             setFecha]             = useState(new Date().toISOString().split('T')[0]);
  const [saving,            setSaving]            = useState(false);
  const [globalEnvaseTypes, setGlobalEnvaseTypes] = useState([]);
  const [step2Locs,         setStep2Locs]         = useState(null);

  const defaultOperario = useMemo(() => {
    const auth = getAuth();
    return auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email || '') : '';
  }, []);
  const [operario, setOperario] = useState(defaultOperario);

  const codigoMedio = extraerCodigoMedio(medio?.alias || medio?.codigo || medio?.id);

  // ── Info del padre ──────────────────────────────────────────────────────────
  const parentHasVolume   = (parentBag.volumen_por_unidad_ml ?? 0) > 0;
  const parentUnits       = parentBag.disponible ?? parentBag.cantidad ?? 0;
  const parentDisponible  = parentHasVolume ? (parentUnits * parentBag.volumen_por_unidad_ml) : parentUnits;
  const parentUnidadLabel = parentHasVolume ? 'ml' : (parentBag.tipo_unidad || 'uds.');

  // ── Valores derivados reactivos ────────────────────────────────────────────
  const qty  = Number(cantidadHijas?.toString().replace(',', '.'))  || 0;
  const vol  = porVolumenHijo ? 1 : (Number(volumenPorUnidad?.toString().replace(',', '.')) || 0);
  const descuentoPadreAuto   = parentHasVolume ? qty * vol : null;
  const descuentoPadreManual = Number(cantidadPadre?.toString().replace(',', '.')) || 0;
  const descuentoPadre       = parentHasVolume ? (descuentoPadreAuto ?? 0) : descuentoPadreManual;

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'config', 'tipos_envase');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) setGlobalEnvaseTypes(docSnap.data().tipos || []);
      } catch (err) {
        console.error('Error fetching global envase types:', err);
      }
    };
    fetchConfig();
  }, []);

  const envaseOptions = useMemo(() => {
    const custom = existingBags.map(b => b.tipo_envase).filter(Boolean);
    return Array.from(new Set([...TIPO_ENVASE_OPTIONS, ...globalEnvaseTypes, ...custom, 'Otro']));
  }, [existingBags, globalEnvaseTypes]);

  const unidadOptions = useMemo(() => {
    const dbEnvases = (insumosList || []).filter(i => i.es_envase).map(i => i.nombre);
    const defaults = ['Placa Petri', 'Frasco 100ml', 'Frasco 500ml', 'Frasco 1L', 'Pote PP', 'Eppendorf 1.5ml', 'Criovial'];
    return Array.from(new Set([...defaults, ...dbEnvases, 'Otro']));
  }, [insumosList]);

  const combinedUbicaciones = useMemo(() => {
    const dbSalas = (salasList || []).map(s => s.nombre);
    return Array.from(new Set([...UBICACION_OPTIONS, ...dbSalas]));
  }, [salasList]);

  const handleSave = async () => {
    if (!qty || qty <= 0) return toast.error('Ingresá una cantidad válida de unidades a crear');

    if (parentHasVolume) {
      if (!vol || vol <= 0) return toast.error('Ingresá el volumen por unidad para calcular el descuento del padre');
      if (descuentoPadreAuto > parentDisponible)
        return toast.error(`El padre solo tiene ${parentDisponible} ml disponibles y querés usar ${descuentoPadreAuto} ml`);
    } else {
      if (!descuentoPadreManual || descuentoPadreManual <= 0)
        return toast.error('Ingresá cuántas unidades del padre se consumen');
      if (descuentoPadreManual > parentDisponible)
        return toast.error(`El padre solo tiene ${parentDisponible} ${parentUnidadLabel} disponibles`);
    }

    if (!operario.trim()) return toast.error('Ingresá el nombre del operario');
    if (defaultOperario && operario.trim() !== defaultOperario) {
      if (!window.confirm(`Estás por registrar a nombre de "${operario}". ¿Confirmás?`)) return;
    }

    let finalTipoEnvase = tipoEnvase;
    if (!tipoEnvase) return toast.error('Seleccioná el formato de envasado');
    if (tipoEnvase === 'Otro') {
      const val = otroEnvaseNombre.trim();
      if (!val) return toast.error('Especificá el tipo de envase');
      finalTipoEnvase = val;
    }

    let finalTipoUnidad = tipoUnidad;
    if (!tipoUnidad) return toast.error('Seleccioná la unidad/recipiente');
    if (tipoUnidad === 'Otro') {
      const val = otroUnidadNombre?.trim();
      if (!val) return toast.error('Especificá el tipo de unidad');
      finalTipoUnidad = val;
    }

    // Paso 2 de ubicaciones individuales
    if (finalTipoEnvase === 'Unidad independiente' && !step2Locs) {
      setStep2Locs(Array.from({ length: qty }, (_, i) => ({
        id: buildBagId(codigoMedio, existingBags.length + i),
        ubicacion,
        ubicacion_detalle: ubicacionDetalle,
      })));
      return;
    }

    setSaving(true);
    try {
      const batch     = writeBatch(db);
      const creadas   = [];
      const medioRef  = doc(db, 'medios_preparados', medio.id);
      const parentRef = doc(db, `medios_preparados/${medio.id}/subfracciones`, parentBag.id);

      // Persistir tipo de envase personalizado
      if (tipoEnvase === 'Otro') {
        const configRef = doc(db, 'config', 'tipos_envase');
        batch.set(configRef, { tipos: arrayUnion(finalTipoEnvase) }, { merge: true });
      }

      // Crear insumo_base si tipoUnidad es 'Otro'
      if (tipoUnidad === 'Otro') {
        const val = otroUnidadNombre.trim();
        if (!val) { setSaving(false); return toast.error('Especificá el tipo de unidad'); }
        const newInsumoRef = doc(collection(db, 'insumos_base'));
        batch.set(newInsumoRef, {
          nombre: val, es_envase: true, categoria: 'Descartables',
          unidad_medida: 'uds.', createdAt: serverTimestamp(),
        });
      }

      const parentId = parentBag.id_bolsa || parentBag.id;
      let childCount;

      if (finalTipoEnvase === 'Unidad independiente') {
        // N subfracciones independientes con ubicaciones individuales
        childCount = qty;
        for (let i = 0; i < qty; i++) {
          const locConfig   = step2Locs[i];
          const newBagRef   = doc(collection(db, `medios_preparados/${medio.id}/subfracciones`));
          const sEncontrada = (salasList || []).find(s => s.nombre === (locConfig.ubicacion || ubicacion));
          const indepData = {
            id_bolsa:              locConfig.id,
            parent_id:             parentId,
            tipo_envase:           finalTipoEnvase,
            tipo_unidad:           finalTipoUnidad,
            cantidad:              porVolumenHijo ? qty : 1,
            disponible:            porVolumenHijo ? qty : 1,
            volumen_por_unidad_ml: porVolumenHijo ? 1 : (vol > 0 ? vol : null),
            por_volumen:           porVolumenHijo || null,
            ubicacion:             locConfig.ubicacion || ubicacion,
            ubicacion_id:          sEncontrada?.id || null,
            ubicacion_detalle:     locConfig.ubicacion_detalle || ubicacionDetalle || null,
            fecha,
            operario,
            estado:                'Disponible',
            novedades:             [],
            createdAt:             serverTimestamp(),
          };
          batch.set(newBagRef, indepData);
          creadas.push({ id: newBagRef.id, medioId: medio.id, ...indepData });
        }
      } else {
        // Una sola subfracción agrupada
        childCount = 1;
        const newBagId       = buildBagId(codigoMedio, existingBags.length);
        const newBagRef      = doc(collection(db, `medios_preparados/${medio.id}/subfracciones`));
        const salaEncontrada = (salasList || []).find(s => s.nombre === ubicacion);
        const childData = {
          id_bolsa:              newBagId,
          parent_id:             parentId,
          tipo_envase:           finalTipoEnvase,
          tipo_unidad:           finalTipoUnidad,
          cantidad:              porVolumenHijo ? qty : qty,
          disponible:            porVolumenHijo ? qty : qty,
          volumen_por_unidad_ml: porVolumenHijo ? 1 : (vol > 0 ? vol : null),
          por_volumen:           porVolumenHijo || null,
          ubicacion,
          ubicacion_id:          salaEncontrada?.id || null,
          ubicacion_detalle:     ubicacionDetalle || null,
          fecha,
          operario,
          estado:                'Disponible',
          novedades:             [],
          createdAt:             serverTimestamp(),
        };
        batch.set(newBagRef, childData);
        creadas.push({ id: newBagRef.id, medioId: medio.id, ...childData });
      }

      // Descontar del padre
      const remainingAmount = Math.max(0, parentDisponible - descuentoPadre);
      const parentBecomesAgotada = remainingAmount <= 0 && parentBag.estado !== 'Agotada';
      
      const parentUpdateData = {};
      if (parentHasVolume) {
        // (b) Fix: el volumen por unidad del padre queda constante; el descuento
        // se expresa en unidades (floor), coherente con el consumo por unidad
        const volUnidad = Number(parentBag.volumen_por_unidad_ml) || 1;
        const unidadesRestantes = remainingAmount > 0 ? Math.floor(remainingAmount / volUnidad) : 0;
        parentUpdateData.disponible = unidadesRestantes;
        const sobrante = remainingAmount - (unidadesRestantes * volUnidad);
        if (remainingAmount > 0 && sobrante > 0) {
          toast(`Quedan ${sobrante} ml que no completan una unidad: disponible = ${unidadesRestantes} ${parentBag.tipo_unidad || 'unidades'}`, { icon: '⚠️', duration: 6000 });
        }
      } else {
        parentUpdateData.disponible = remainingAmount;
      }
      
      if (parentBecomesAgotada) {
        parentUpdateData.estado = 'Agotada';
        parentUpdateData.fecha_agotamiento = serverTimestamp();
      }
      
      batch.update(parentRef, parentUpdateData);

      // Actualizar contadores del medio (children +N, parent -1 si se agota)
      batch.update(medioRef, {
        total_subfracciones:       increment(childCount),
        subfracciones_disponibles: increment(childCount - (parentBecomesAgotada ? 1 : 0)),
      });

      await batch.commit();

      toast.success('Subfracción creada correctamente');
      if (typeof onCreated === 'function') onCreated(creadas);
      onAdded();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Error al crear subfracción: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const isNextStep = tipoEnvase === 'Unidad independiente' && !step2Locs;
  const btnLabel   = saving ? 'Guardando…' : (isNextStep ? 'Siguiente (Ubicaciones)' : 'Crear subfracción');

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '580px', width: '95%' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>🧪 Sacar Placas / Tubos</h3>

        {/* Info del padre */}
        <div style={{
          background: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: '8px',
          padding: '0.65rem 0.9rem',
          marginBottom: '1rem',
          fontSize: '0.85rem',
        }}>
          <strong>Envase padre:</strong> {parentBag.id_bolsa || parentBag.id}{' '}
          — {parentBag.tipo_envase} de {parentBag.tipo_unidad}<br />
          <span style={{ color: parentDisponible > 0 ? '#4ddb9c' : '#f88', fontWeight: 600 }}>
            Disponible: {parentDisponible} {parentUnidadLabel}
          </span>
        </div>

        {/* Tipo de envase */}
        <div className="form-group">
          <label>Tipo de envase *</label>
          <select className="form-control" value={tipoEnvase} onChange={e => {
            setTipoEnvase(e.target.value); setStep2Locs(null);
          }}>
            {envaseOptions.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        {tipoEnvase === 'Otro' && (
          <div className="form-group">
            <label>Especifique el tipo de envase *</label>
            <input type="text" className="form-control" placeholder="Ej: Canasto"
              value={otroEnvaseNombre} onChange={e => setOtroEnvaseNombre(e.target.value)} />
          </div>
        )}

        {/* Tipo de unidad */}
        <div className="form-group">
          <label>Tipo de unidad *</label>
          <select className="form-control" value={tipoUnidad} onChange={e => {
            const val = e.target.value;
            setTipoUnidad(val);
            if (parentHasVolume && /frasco|botella|erlenmeyer|beaker/i.test(val)) setPorVolumenHijo(true);
          }}>
            {unidadOptions.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        {tipoUnidad === 'Otro' && (
          <div className="form-group">
            <label>Especifique el tipo de unidad *</label>
            <input type="text" className="form-control" placeholder="Ej: Frasco 250ml"
              value={otroUnidadNombre} onChange={e => setOtroUnidadNombre(e.target.value)} />
          </div>
        )}

        {/* Cantidad de unidades hijas */}
        <div className="form-group">
          <label>{porVolumenHijo ? 'Volumen total a crear (ml) *' : 'Cantidad de unidades a crear *'}</label>
          <input type="number" className="form-control" min={1} value={cantidadHijas}
            onChange={e => { setCantidadHijas(e.target.value); setStep2Locs(null); }} />
          {tipoEnvase === 'Unidad independiente' && qty > 0 && (
            <small style={{ display: 'block', marginTop: '0.3rem', color: 'var(--text-secondary)' }}>
              Se generarán {qty} subfracciones independientes. Cada una podrá tener su propia ubicación.
            </small>
          )}
        </div>

        {parentHasVolume && (
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={porVolumenHijo} onChange={e => setPorVolumenHijo(e.target.checked)} />
              💧 El envase se mide por volumen (ml)
            </label>
          </div>
        )}

        {/* Volumen por unidad */}
        {!porVolumenHijo && (
        <div className="form-group">
          <label>Volumen por unidad (ml) <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>– opcional</span></label>
          <input type="number" className="form-control" min={0} placeholder="Ej: 20"
            value={volumenPorUnidad} onChange={e => setVolumenPorUnidad(e.target.value)} />
        </div>
        )}

        {/* Descuento del padre */}
        {parentHasVolume ? (
          <div className="form-group">
            <label>Volumen a descontar del padre <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(calculado automáticamente)</span></label>
            <input type="text" className="form-control"
              value={descuentoPadreAuto != null ? `${descuentoPadreAuto} ml` : '—'}
              readOnly style={{ background: 'rgba(255,255,255,0.05)', cursor: 'default' }} />
            <small style={{
              display: 'block', marginTop: '0.3rem', fontWeight: 500,
              color: (parentDisponible - (descuentoPadreAuto ?? 0)) >= 0 ? 'var(--text-secondary)' : '#f44',
            }}>
              Padre quedará con: {Math.max(0, parentDisponible - (descuentoPadreAuto ?? 0))} ml
            </small>
          </div>
        ) : (
          <div className="form-group">
            <label>Unidades del padre a consumir *</label>
            <input type="number" className="form-control" min={1} max={parentDisponible}
              value={cantidadPadre} onChange={e => setCantidadPadre(e.target.value)} />
            <small style={{ display: 'block', marginTop: '0.3rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Padre quedará con: {Math.max(0, parentDisponible - descuentoPadreManual)} {parentUnidadLabel}
            </small>
          </div>
        )}

        {/* Ubicación */}
        <div className="form-group">
          <label>Ubicación {tipoEnvase === 'Unidad independiente' ? '(por defecto)' : '*'}</label>
          <select className="form-control" value={ubicacion} onChange={e => {
            setUbicacion(e.target.value);
            if (step2Locs) setStep2Locs(prev => prev.map(l => ({ ...l, ubicacion: e.target.value })));
          }}>
            {combinedUbicaciones.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Detalle de ubicación <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>– opcional</span></label>
          <input type="text" className="form-control" placeholder="Ej: Estante 3, bolsa roja"
            value={ubicacionDetalle} onChange={e => {
              setUbicacionDetalle(e.target.value);
              if (step2Locs) setStep2Locs(prev => prev.map(l => ({ ...l, ubicacion_detalle: e.target.value })));
            }} />
        </div>

        {/* Paso 2: ubicaciones individuales */}
        {step2Locs && (
          <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
            <h5 style={{ marginBottom: '0.75rem', color: 'var(--accent-color)' }}>Ubicaciones individuales</h5>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Podés ajustar la ubicación de cada unidad. Si no tocás nada, usarán la ubicación por defecto.
            </p>
            <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {step2Locs.map((loc, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', minWidth: '70px', fontWeight: 600 }}>{loc.id}</span>
                  <select className="form-control" style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                    value={loc.ubicacion} onChange={e => {
                      const newLocs = [...step2Locs];
                      newLocs[i] = { ...newLocs[i], ubicacion: e.target.value };
                      setStep2Locs(newLocs);
                    }}>
                    {combinedUbicaciones.map(o => <option key={o}>{o}</option>)}
                  </select>
                  <input type="text" className="form-control" style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                    placeholder="Detalle…" value={loc.ubicacion_detalle}
                    onChange={e => {
                      const newLocs = [...step2Locs];
                      newLocs[i] = { ...newLocs[i], ubicacion_detalle: e.target.value };
                      setStep2Locs(newLocs);
                    }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fecha */}
        <div className="form-group">
          <label>Fecha *</label>
          <input type="date" className="form-control" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>

        {/* Operario */}
        <div className="form-group">
          <label>Operario *</label>
          <input type="text" className="form-control" placeholder="Nombre del operario"
            value={operario} onChange={e => setOperario(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{btnLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Tipos de merma con lógica de descuento ──────────────────────────────────────
const TIPOS_MERMA = [
  { value: 'Contaminación',         descuenta: true  },
  { value: 'Rotura',                descuenta: true  },
  { value: 'Desecación',            descuenta: true  },
  { value: 'Desarrollo espontáneo', descuenta: false },
  { value: 'Otro',                  descuenta: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Modal: Agregar novedad / merma a una bolsa
// ═══════════════════════════════════════════════════════════════════════════════
function AddNovedadModal({ medioId, bagId, bagDisponible, operariosList, onClose, onAdded }) {
  const fileInputCamRef = useRef(null);
  const fileInputGalRef = useRef(null);
  const [tipoMerma,        setTipoMerma]        = useState('Contaminación');
  const [cantidadAfectada,  setCantidadAfectada] = useState('');
  const [texto,             setTexto]            = useState('');
  const [fecha,             setFecha]            = useState(new Date().toISOString().split('T')[0]);
  const [responsable,       setResponsable]      = useState('');
  const [fotoFile,          setFotoFile]         = useState(null);
  const [saving,            setSaving]           = useState(false);

  const mermaInfo   = TIPOS_MERMA.find(t => t.value === tipoMerma) ?? TIPOS_MERMA[0];
  const disponible  = bagDisponible ?? 0;

  const handleSave = async () => {
    // texto ya no es obligatorio
    const qty = Number(cantidadAfectada?.toString().replace(',', '.')) || 0;

    // Si el tipo descuenta, validar cantidad
    if (mermaInfo.descuenta) {
      if (qty <= 0) return toast.error('Ingresá la cantidad afectada');
      if (qty > disponible) return toast.error(`Solo hay ${disponible} unidades disponibles en esta bolsa`);
    }

    setSaving(true);
    try {
      const bagRef = doc(db, `medios_preparados/${medioId}/subfracciones`, bagId);

      let fotoUrl = null;
      if (fotoFile) {
        const result = await uploadFileToDrive(fotoFile);
        fotoUrl = result.imageUrl;
      }

      const novedadData = {
        tipo: tipoMerma,
        descuenta: mermaInfo.descuenta,
        cantidad_afectada: mermaInfo.descuenta ? qty : 0,
        texto: texto || null,
        fecha,
        responsable: responsable || null,
        foto_url: fotoUrl,
        createdAt: new Date().toISOString(),
      };

      // Leer estado actual de la bolsa para calcular nuevo disponible
      const bagSnap = await getDoc(bagRef);
      const bagData = bagSnap.data() ?? {};
      const currentDisponible = bagData.disponible ?? bagData.cantidad ?? 0;
      const nuevoDisponible = mermaInfo.descuenta
        ? Math.max(0, currentDisponible - qty)
        : currentDisponible;

      const updateData = {
        novedades: arrayUnion(novedadData),
      };

      // Actualizar disponible y estado si descuenta
      let becameAgotada = false;
      if (mermaInfo.descuenta) {
        updateData.disponible = nuevoDisponible;
        if (nuevoDisponible <= 0 && bagData.estado !== 'Agotada') {
          updateData.estado = 'Agotada';
          updateData.fecha_agotamiento = serverTimestamp();
          becameAgotada = true;
        }
      }

      const batch = writeBatch(db);
      batch.update(bagRef, updateData);
      
      if (becameAgotada) {
        const medioRef = doc(db, 'medios_preparados', medioId);
        batch.update(medioRef, {
          subfracciones_disponibles: increment(-1)
        });
      }

      await batch.commit();

      const unidadLabel = 'uds.';
      const msgExtra = mermaInfo.descuenta
        ? ` — Se descontaron ${qty} ${unidadLabel}. Disponible: ${nuevoDisponible}`
        : ' — Registrado sin descuento';
      toast.success('Novedad añadida' + msgExtra);
      onAdded();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Error al agregar novedad: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '540px', width: '95%' }}>
        <h3 style={{ marginBottom: '1rem' }}>+ Novedad / Merma</h3>

        {/* Tipo de merma */}
        <div className="form-group">
          <label>Tipo de novedad *</label>
          <select
            className="form-control"
            value={tipoMerma}
            onChange={e => setTipoMerma(e.target.value)}
          >
            {TIPOS_MERMA.map(t => (
              <option key={t.value} value={t.value}>
                {t.value} {t.descuenta ? '(descuenta stock)' : '(solo registro)'}
              </option>
            ))}
          </select>
        </div>

        {/* Cantidad afectada — solo si descuenta */}
        {mermaInfo.descuenta && (
          <div className="form-group">
            <label>Cantidad afectada *</label>
            <input
              type="number"
              className="form-control"
              min={1}
              max={disponible}
              value={cantidadAfectada}
              onChange={e => setCantidadAfectada(e.target.value)}
            />
            <small style={{
              display: 'block',
              marginTop: '0.3rem',
              color: disponible <= 0 ? 'var(--error-color, #f44)' : 'var(--text-secondary)',
              fontWeight: 500,
            }}>
              Disponible en esta bolsa: {disponible} uds.
            </small>
          </div>
        )}

        {/* Info: no descuenta */}
        {!mermaInfo.descuenta && (
          <div style={{
            background: 'rgba(255,200,0,0.1)',
            border: '1px solid rgba(255,200,0,0.25)',
            borderRadius: '8px',
            padding: '0.5rem 0.75rem',
            marginBottom: '0.75rem',
            fontSize: '0.85rem',
            color: '#ffd54f',
          }}>
            ℹ️ Este tipo de novedad se registra sin descontar stock.
            Las unidades siguen figurando como disponibles.
          </div>
        )}

        {/* Descripción */}
        <div className="form-group">
          <label>Descripción <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>– opcional</span></label>
          <textarea
            className="form-control"
            rows={3}
            placeholder="Detalle de la novedad…"
            value={texto}
            onChange={e => setTexto(e.target.value)}
          />
        </div>

        {/* Responsable */}
        <div className="form-group">
          <label>Responsable</label>
          <input
            type="text"
            className="form-control"
            placeholder="Nombre del responsable"
            value={responsable}
            onChange={e => setResponsable(e.target.value)}
            list="operarios-novedad-list"
          />
          <datalist id="operarios-novedad-list">
            {(operariosList || []).map(op => <option key={op} value={op} />)}
          </datalist>
        </div>

        {/* Foto de Evidencia */}
        <div className="form-group">
          <label>Foto de Evidencia <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>– opcional</span></label>
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

        {/* Fecha */}
        <div className="form-group">
          <label>Fecha</label>
          <input
            type="date"
            className="form-control"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar novedad'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Acordeón principal de Subfraccionamiento
// ═══════════════════════════════════════════════════════════════════════════════
export default function SubfraccionamientoAccordion({ medio, operariosList, salasList, insumosList, readOnly }) {
  const [open,           setOpen]           = useState(false);
  const [bags,           setBags]           = useState([]);
  const [showAddBag,     setShowAddBag]     = useState(false);
  const [showNovedad,    setShowNovedad]    = useState({ open: false, bagId: null });
  const [printBag,       setPrintBag]       = useState(null);
  const [showSubBag,     setShowSubBag]     = useState(null);

  // Carga las bolsas cuando se abre el acordeón
  useEffect(() => {
    if (!open) return;
    fetchBags();
  }, [open, medio.id]);

  const fetchBags = async () => {
    try {
      const q    = query(collection(db, `medios_preparados/${medio.id}/subfracciones`), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setBags(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error cargando subfracciones', err);
    }
  };

  const refresh = () => {
    setOpen(false);
    setTimeout(() => setOpen(true), 0);
  };

  const handleEnviarACola = async (b) => {
    try {
      const auth = getAuth();
      const usuarioActivo = auth.currentUser?.email || 'Usuario Desconocido';
      
      const datosEtiqueta = {
        id: b.id_bolsa || b.id,
        alias: b.id_bolsa,
        nombre_insumo: `${b.tipo_envase} de ${medio.nombre_receta || 'Medio'}`,
        fecha: b.fecha,
        lote: medio.lote || medio.id,
        especie: b.tipo_unidad,
        ubicacion: b.ubicacion,
        operador: b.operario,
      };

      await addDoc(collection(db, 'cola_impresion'), {
        modulo: 'medios',
        batch_ids: [],
        tipo_etiqueta: 'subfraccion',
        datos_etiquetas: [datosEtiqueta],
        estado: 'Pendiente',
        fecha_generacion: serverTimestamp(),
        operario: usuarioActivo,
        impreso_por: null,
        fecha_impresion: null
      });
      toast.success('Etiqueta enviada a la cola de impresión');
    } catch (error) {
      console.error(error);
      toast.error('Error al enviar a la cola');
    }
  };

  // ── Indicador global del bulk ──────────────────────────────────────────────
  const rawCantidadActualUI = medio?.stock_bulk?.cantidad_actual ?? medio?.cantidad_actual ?? medio?.stock_total_base ?? 0;
  const cantidadActualUI = Math.max(0, rawCantidadActualUI);
  const yaFraccionado  = bags.reduce((sum, b) => {
    const q = b.cantidad ?? 0;
    const v = b.volumen_por_unidad_ml > 0 ? Number(b.volumen_por_unidad_ml) : 1;
    return sum + (q * v);
  }, 0);
  const disponibleBulk = cantidadActualUI;

  const isAgotadoMedio = medio?.estado === 'Agotado';

  const handleDeleteBag = async (bagId, qty, vol) => {
    if (!window.confirm('¿Eliminar este subfraccionamiento? Esta acción restaurará la cantidad al bulk principal.')) return;
    try {
      const bagSnap = await getDoc(doc(db, `medios_preparados/${medio.id}/subfracciones`, bagId));
      const bagData = bagSnap.data() || {};
      const wasAgotada = bagData.estado === 'Agotada';

      const descuento = vol > 0 ? (qty * vol) : qty;
      const batch = writeBatch(db);
      
      const bagRef = doc(db, `medios_preparados/${medio.id}/subfracciones`, bagId);
      const medioRef = doc(db, 'medios_preparados', medio.id);
      
      batch.delete(bagRef);
      // Restaurar bulk
      batch.update(medioRef, {
        'stock_bulk.cantidad_actual': cantidadActualUI + descuento,
        total_subfracciones: increment(-1),
        subfracciones_disponibles: wasAgotada ? increment(0) : increment(-1),
        ...(medio.estado === 'Agotado' ? { estado: 'Activo' } : {})
      });
      
      await batch.commit();
      refresh();
    } catch (err) {
      console.error(err);
      toast.error('Error eliminando bolsa: ' + err.message);
    }
  };

  const renderBagCard = (b, isChild = false) => {
    const isAgotada = (b.disponible ?? b.cantidad ?? 0) === 0;
    return (
      <div
        key={b.id}
        className="card"
        style={{
          padding: '0.65rem 0.75rem',
          marginBottom: '0.5rem',
          background: isChild ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.02)',
          borderLeft: `4px solid \$\{isAgotada \? '#f44' : \(isChild \? '#818cf8' : 'var\(--accent-color\)'\)\}`,
          borderRadius: '6px',
        }}
      >
        {/* Encabezado fila */}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center', paddingRight: '2rem' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', opacity: 0.8 }}>
            {isChild ? '↳ ' : '🏷️ '}{b.id_bolsa ?? b.id}
          </span>
          <span style={{
            background: isAgotada ? 'rgba(255,68,68,0.2)' : 'rgba(0,200,100,0.2)',
            color: isAgotada ? '#f88' : '#4ddb9c',
            borderRadius: '999px',
            padding: '0.1rem 0.6rem',
            fontSize: '0.75rem',
            fontWeight: 600,
          }}>
            {isAgotada ? '🔴 Agotada' : '🟢 Disponible'}
          </span>
        </div>

        {/* Detalle */}
        <div style={{ marginTop: '0.35rem', fontSize: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.5rem' }}>
          <span><strong>Fecha:</strong> {b.fecha}</span>
          <span><strong>Envase:</strong> {b.tipo_envase ?? '—'}</span>
          <span><strong>Unidad:</strong> {b.tipo_unidad ?? '—'}</span>
          {b.volumen_por_unidad_ml && b.volumen_por_unidad_ml !== 1 && <span><strong>Vol/u:</strong> {b.volumen_por_unidad_ml} ml</span>}
          <span><strong>Stock:</strong> {b.disponible ?? b.cantidad}/{b.cantidad}</span>
          <span>📍 {b.ubicacion ?? '—'}{b.ubicacion_detalle ? ` — ${b.ubicacion_detalle}` : ''}</span>
          {b.operario && <span><strong>Operario:</strong> {b.operario}</span>}
        </div>

        {/* Observaciones */}
        {b.observaciones && (
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            📝 {b.observaciones}
          </p>
        )}

        {/* Novedades */}
        {b.novedades && b.novedades.length > 0 && (
          <div style={{ marginTop: '0.4rem', paddingTop: '0.3rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <strong style={{ fontSize: '0.8rem' }}>Novedades:</strong>
            {b.novedades.map((n, idx) => (
              <p key={idx} style={{ margin: '0.15rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {n.fecha} – <span style={{ fontWeight: 600, color: n.descuenta ? '#f88' : '#ffd54f' }}>{n.tipo ?? 'Sin tipo'}</span>
                {n.cantidad_afectada > 0 && <span style={{ color: '#f88' }}> (−{n.cantidad_afectada} {medio?.stock_bulk?.unidad || 'uds.'})</span>}
                {n.responsable ? ` – ${n.responsable}` : ''}: {n.texto}
              </p>
            ))}
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', width: '100%' }}>
          {!readOnly && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowNovedad({ open: true, bagId: b.id })}
              style={{ flex: 1, padding: '0.4rem' }}
              title="Novedades"
            >
              🔍 Novedad
            </button>
          )}
          {!readOnly && !isAgotada && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setShowSubBag(b)}
              style={{ flex: 1, padding: '0.4rem', color: '#818cf8', borderColor: '#818cf8' }}
              title="Sacar Placas/Tubos"
            >
              🧪 Sacar
            </button>
          )}
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setPrintBag(b)}
            style={{ flex: 1, padding: '0.4rem' }}
            title="Reimprimir ZPL"
          >
            🏷️ Reimprimir
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => handleEnviarACola(b)}
            style={{ flex: 1, padding: '0.4rem' }}
            title="Enviar a cola de impresión"
          >
            📥 A cola
          </button>
          {!readOnly && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => handleDeleteBag(b.id, b.cantidad, b.volumen_por_unidad_ml)}
              style={{ flex: 1, padding: '0.4rem', color: '#ef4444', borderColor: '#ef4444' }}
              title="Eliminar"
            >
              🗑️ Eliminar
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderBagWithChildren = (bag, depth = 0) => {
    const children = bags.filter(child => child.parent_id === (bag.id_bolsa || bag.id));
    return (
      <div key={bag.id}>
        {renderBagCard(bag, depth > 0)}
        {children.length > 0 && (
          <div style={{ paddingLeft: '1.25rem', marginTop: '-0.25rem', marginBottom: '0.75rem', borderLeft: '2px solid rgba(255,255,255,0.1)', marginLeft: '1rem' }}>
            {depth === 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                ↳ Subfracciones extraídas:
              </div>
            )}
            {children.map(child => renderBagWithChildren(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <details
      open={open}
      className="accordion"
      style={{ marginTop: '0.5rem' }}
      onToggle={e => setOpen(e.target.open)}
    >
      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
        🧪 Subfraccionamiento
        {open && (
          <span style={{
            marginLeft: '0.75rem',
            fontSize: '0.8rem',
            fontWeight: 400,
            color: disponibleBulk > 0 ? 'var(--accent-color)' : '#f44',
          }}>
            — {disponibleBulk > 0 ? `${disponibleBulk} ${medio?.stock_bulk?.unidad || 'uds.'} sin fraccionar` : 'Bulk agotado'}
          </span>
        )}
      </summary>

      <div style={{ padding: '0.75rem 0.5rem' }}>

        {/* Barra de estado del bulk */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px',
          padding: '0.5rem 0.75rem',
          marginBottom: '0.75rem',
          fontSize: '0.85rem',
          display: 'flex',
          gap: '1.5rem',
          flexWrap: 'wrap',
        }}>
          <span>📦 <strong>Bulk total:</strong> {medio?.stock_bulk?.cantidad_actual ?? medio?.cantidad_actual ?? 0} {medio?.stock_bulk?.unidad || 'uds.'}</span>
          <span>✂️ <strong>Fraccionado:</strong> {yaFraccionado} {medio?.stock_bulk?.unidad || 'uds.'}</span>
          <span style={{ color: disponibleBulk > 0 ? 'var(--accent-color)' : '#f44', fontWeight: 600 }}>
            ⚗️ <strong>Disponible:</strong> {disponibleBulk} {medio?.stock_bulk?.unidad || 'uds.'}
          </span>
        </div>

        {!readOnly && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowAddBag(true)}
            style={{ marginBottom: '0.75rem' }}
            disabled={disponibleBulk <= 0 || isAgotadoMedio}
            title={isAgotadoMedio ? 'El medio está agotado' : (disponibleBulk <= 0 ? 'El bulk está completamente fraccionado' : '')}
          >
            + Nueva bolsa
          </button>
        )}

        {/* Listado de bolsas */}
        {bags.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No hay subfracciones registradas.</p>
        ) : (
          bags.filter(b => !b.parent_id).map(b => renderBagWithChildren(b))
        )}
      </div>

      {/* Modales */}
      {showAddBag && (
        <AddBagModal
          medio={medio}
          existingBags={bags}
          salasList={salasList}
          insumosList={insumosList}
          onClose={() => setShowAddBag(false)}
          onAdded={refresh}
        />
      )}
      {showSubBag && (
        <AddSubBagModal
          medio={medio}
          parentBag={showSubBag}
          existingBags={bags}
          salasList={salasList}
          insumosList={insumosList}
          onClose={() => setShowSubBag(null)}
          onAdded={refresh}
        />
      )}
      {showNovedad.open && (
        <AddNovedadModal
          medioId={medio.id}
          bagId={showNovedad.bagId}
          bagDisponible={(bags.find(b => b.id === showNovedad.bagId)?.disponible) ?? (bags.find(b => b.id === showNovedad.bagId)?.cantidad) ?? 0}
          operariosList={operariosList}
          onClose={() => setShowNovedad({ open: false, bagId: null })}
          onAdded={refresh}
        />
      )}
      {printBag && (
        <PrintLabelsModal
          batches={[{
            id: printBag.id_bolsa || printBag.id,
            alias: printBag.id_bolsa,
            nombre_insumo: `${printBag.tipo_envase} de ${medio.nombre_receta || 'Medio'}`,
            fecha: printBag.fecha,
            lote: medio.lote || medio.id,
            especie: printBag.tipo_unidad,
            ubicacion: printBag.ubicacion,
            operador: printBag.operario,
          }]}
          onClose={() => setPrintBag(null)}
        />
      )}
    </details>
  );
}
