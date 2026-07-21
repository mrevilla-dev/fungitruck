import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

const METODOS = ['Esterilización', 'Pasteurización', 'Tindalización', 'Sin esterilización'];

export default function SanitizacionAccordion({ medio, operariosList, equiposList, readOnly }) {
  const medioId = medio?.id;

  // Datos precargados desde el medio
  const sData = medio?.sanitizacion ?? {};

  const [metodo,              setMetodo]              = useState(sData.metodo ?? 'Esterilización');
  const [fecha_sanitizacion,  setFechaSanitizacion]   = useState(sData.fecha_sanitizacion ?? '');
  const [equipo_empleado,     setEquipoEmpleado]      = useState(sData.equipo_empleado ?? '');
  const [tiempo,              setTiempo]              = useState(sData.tiempo ?? '');
  const [operador,            setOperador]            = useState(sData.operador ?? '');
  const [observaciones,       setObservaciones]       = useState(sData.observaciones ?? '');

  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [dirty,   setDirty]   = useState(false);

  // Resetear si cambia el medio
  useEffect(() => {
    const s = medio?.sanitizacion ?? {};
    setMetodo(s.metodo ?? 'Esterilización');
    setFechaSanitizacion(s.fecha_sanitizacion ?? '');
    setEquipoEmpleado(s.equipo_empleado ?? '');
    setTiempo(s.tiempo ?? '');
    setOperador(s.operador ?? '');
    setObservaciones(s.observaciones ?? '');
    setDirty(false);
    setSaved(false);
  }, [medioId]);

  const markDirty = () => { setDirty(true); setSaved(false); };

  const handleSave = async () => {
    if (!fecha_sanitizacion) return toast('Ingresá la fecha de sanitización');
    setSaving(true);
    try {
      const medioRef = doc(db, 'medios_preparados', medioId);
      await updateDoc(medioRef, {
        sanitizacion: {
          metodo,
          fecha_sanitizacion,
          equipo_empleado: equipo_empleado || null,
          tiempo: tiempo ? Number(tiempo) : null,
          operador: operador || null,
          observaciones: observaciones || null,
          updatedAt: new Date().toISOString(),
        },
      });
      setSaved(true);
      setDirty(false);
    } catch (err) {
      console.error('Error al guardar sanitización:', err);
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const hasSavedData = Boolean(medio?.sanitizacion?.fecha_sanitizacion);

  return (
    <details open={!hasSavedData} className="accordion">
      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
        🧹 Sanitización
        {saved && <span style={{ marginLeft: '0.75rem', fontSize: '0.8rem', color: '#4ddb9c', fontWeight: 400 }}>✅ Guardado</span>}
        {dirty && !saved && <span style={{ marginLeft: '0.75rem', fontSize: '0.8rem', color: '#ffd54f', fontWeight: 400 }}>● Sin guardar</span>}
      </summary>
      <div style={{ padding: '1rem' }}>

        <div className="grid-2" style={{ gap: '1rem', marginBottom: '0.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Método</label>
            <select
              className="form-control"
              value={metodo}
              onChange={e => { setMetodo(e.target.value); markDirty(); }}
              disabled={readOnly}
            >
              {METODOS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Fecha de Sanitización <span style={{ color: 'red' }}>*</span></label>
            <input
              type="date"
              className="form-control"
              value={fecha_sanitizacion}
              onChange={e => { setFechaSanitizacion(e.target.value); markDirty(); }}
              required
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="grid-2" style={{ gap: '1rem', marginBottom: '0.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Equipo Empleado</label>
            <input
              type="text"
              className="form-control"
              value={equipo_empleado}
              onChange={e => { setEquipoEmpleado(e.target.value); markDirty(); }}
              placeholder='Ej: Autoclave 1, Estufa 2'
              list="equipos-sanitizacion-list"
              disabled={readOnly}
            />
            <datalist id="equipos-sanitizacion-list">
              {(equiposList || []).map(eq => <option key={eq} value={eq} />)}
            </datalist>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Tiempo de proceso (min)</label>
            <input
              type="number"
              className="form-control"
              value={tiempo}
              onChange={e => { setTiempo(e.target.value); markDirty(); }}
              placeholder="Duración en minutos"
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label className="form-label">Operador</label>
          <input
            type="text"
            className="form-control"
            value={operador}
            onChange={e => { setOperador(e.target.value); markDirty(); }}
            placeholder="Nombre del operador"
            list="operadores-sanitizacion-list"
            disabled={readOnly}
          />
          <datalist id="operadores-sanitizacion-list">
            {(operariosList || []).map(op => <option key={op} value={op} />)}
          </datalist>
        </div>

        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label className="form-label">Observaciones</label>
          <textarea
            className="form-control"
            rows={2}
            value={observaciones}
            onChange={e => { setObservaciones(e.target.value); markDirty(); }}
            disabled={readOnly}
          />
        </div>

        {!readOnly && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !dirty}
              style={{ minHeight: '48px', minWidth: '160px' }}
            >
              {saving ? 'Guardando…' : saved ? '✅ Guardado' : '💾 Guardar sanitización'}
            </button>
          </div>
        )}

      </div>
    </details>
  );
}
