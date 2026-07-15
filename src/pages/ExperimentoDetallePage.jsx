// src/pages/ExperimentoDetallePage.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'react-hot-toast';
import {
  obtenerBatchesPorExperimento,
  cambiarEstadoBatches,
  adoptarBatch,
  obtenerVariablesRespuesta,
} from '../services/experimentoDetalleService';
import { saveAs } from 'file-saver'; // CSV export
import { COLORES_ESTADO } from '../utils/arbolConstants';
import { calcularDescriptiva } from '../utils/estadisticasExperimento';

// Badge colour map (Planificado=grey, Inoculado=blue, Incubando=orange, Finalizado=green)
const statusColors = {
  Planificado: '#b0b0b0',
  Inoculado: '#3b82f6',
  Incubando: '#f97316',
  Finalizado: '#22c55e',
};

export default function ExperimentoDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exp, setExp] = useState(null);
  const [statsByVar, setStatsByVar] = useState({}); // {varName: [{...}]}
  const [variablesList, setVariablesList] = useState([]); // keep variable names

  const [batches, setBatches] = useState([]);
  const [variables, setVariables] = useState([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [statusChange, setStatusChange] = useState('');
const [modalOpen, setModalOpen] = useState(false);
const [adoptTratId, setAdoptTratId] = useState(null);

  // Load experiment metadata + batches
  useEffect(() => {
    async function load() {
      try {
        const expSnap = await getDoc(doc(db, 'experimentos', id));
        if (!expSnap.exists()) {
          toast.error('Experimento no encontrado');
          navigate('/experimentos');
          return;
        }
        const data = expSnap.data();
        setExp(data);
        const batchList = await obtenerBatchesPorExperimento(id);
        setBatches(batchList);
        const vars = await obtenerVariablesRespuesta(id);
        setVariables(vars);
      } catch (e) {
        console.error(e);
        toast.error('Error al cargar el experimento');
      }
    }
    load();
  }, [id]);

  // ---------- UI helpers ----------
  const toggleSelect = (batchId) => {
    setSelectedBatchIds((prev) =>
      prev.includes(batchId) ? prev.filter((b) => b !== batchId) : [...prev, batchId]
    );
  };

  const handleMassStatus = async () => {
    if (!statusChange) return;
    try {
      await cambiarEstadoBatches(selectedBatchIds, statusChange);
      toast.success('Estado actualizado');
      const refreshed = await obtenerBatchesPorExperimento(id);
      setBatches(refreshed);
      setSelectedBatchIds([]);
    } catch (e) {
      console.error(e);
      toast.error('Error al cambiar estado');
    }
  };

  const handleMarkAllInoculado = async (tratamientoId) => {
    const ids = batches
      .filter((b) => b.tratamiento_id === tratamientoId)
      .map((b) => b.id);
    if (ids.length === 0) return;
    await cambiarEstadoBatches(ids, 'Inoculado');
    const refreshed = await obtenerBatchesPorExperimento(id);
    setBatches(refreshed);
    toast.success('Todos marcados como Inoculado');
  };

  const openAdoptModal = (tratamientoId) => {
    setAdoptTratId(tratamientoId);
    setModalOpen(true);
  };

  const handleAdopt = async (tratamientoId, batchId) => {
    try {
      await adoptarBatch(id, tratamientoId, batchId);
      const refreshed = await obtenerBatchesPorExperimento(id);
      setBatches(refreshed);
      toast.success('Batch adoptado');
      setModalOpen(false);
    } catch (e) {
      console.error(e);
      toast.error('Error al adoptar batch');
    }
  };

  const exportCSV = () => {
    const header = ['Batch ID', 'Tratamiento ID', 'Estado', 'Fecha Inoculación'];
    const rows = batches.map((b) => [b.id, b.tratamiento_id, b.status, b.fechaInoculacion || '']);
    const csvContent = [header, ...rows].map((e) => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `experiment_${id}_batches.csv`);
  };

  // Export statistics CSV (single file per experiment)
  const exportStatsCSV = (varName, rows) => {
    const header = ['Variable', 'Tratamiento', 'N', 'Media', 'Desvío', 'Mín', 'Máx'];
    const dataRows = rows.map((r) => [varName, r.tratamientoLabel, r.n, r.media, r.desvio, r.min, r.max]);
    const csvContent = [header, ...dataRows].map((e) => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `${id}_estadisticas.csv`);
  };
  };

  if (!exp) return <div>Cargando...</div>;

  // Group batches by treatment
  const batchesByTreat = {};
  batches.forEach((b) => {
    const tId = b.tratamiento_id || 'sin-tratamiento';
    if (!batchesByTreat[tId]) batchesByTreat[tId] = [];
    batchesByTreat[tId].push(b);
  });
  // Load experiment metadata + batches + variables + compute stats
  useEffect(() => {
    if (exp && batches && variables && variables.length) {
      const stats = calcularDescriptiva(batches, variables, exp.tratamientos || []);
      setStatsByVar(stats);
    }
  }, [exp, batches, variables]);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1rem' }}>
      {/* Header */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
        <h2>{exp.nombre}</h2>
        <p><strong>Especie:</strong> {exp.especie}</p>
        <p>
          <strong>Estado:</strong>{' '}
          <span
            style={{
              backgroundColor: statusColors[exp.estado] || '#ccc',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            {exp.estado}
          </span>
        </p>
        <p><strong>Hipótesis:</strong> {exp.hipotesis}</p>
        <p><strong>Objetivo:</strong> {exp.objetivo}</p>
        <p><strong>Responsable:</strong> {exp.responsable}</p>
        <p><strong>Fechas:</strong> {exp.fecha_inicio || '-'} – {exp.fecha_fin_estimada || '-'}</p>
        <button className="btn-primary" onClick={() => navigate('/experimentos')}>← Volver</button>
        <button className="btn-secondary" style={{ marginLeft: '0.5rem' }} onClick={exportCSV}>Exportar CSV</button>
      </div>

      {/* Treatments */}
      {Object.entries(batchesByTreat).map(([tId, batchList]) => {
        const treat = exp.tratamientos.find((t) => t.id === tId) || { label: 'Tratamiento sin asignar' };
        return (
          <div key={tId} className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{treat.label}</h3>
              <div>
                <button className="btn-secondary" onClick={() => handleMarkAllInoculado(tId)}>
                  Marcar todos como Inoculado
                </button>
                <button className="btn-primary" style={{ marginLeft: '0.5rem' }} onClick={() => openAdoptModal(tId)}>
                  Adoptar batch existente
                </button>
              </div>
            </div>
            <ul>
              {batchList.map((b) => (
                <li key={b.id} style={{ display: 'flex', alignItems: 'center', marginTop: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedBatchIds.includes(b.id)}
                    onChange={() => toggleSelect(b.id)}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span style={{ fontFamily: 'monospace', marginRight: '0.5rem' }}>{b.id}</span>
                  <span
                    style={{
                      backgroundColor: statusColors[b.status] || '#ccc',
                      color: 'white',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      marginRight: '0.5rem',
                    }}
                  >
                    {b.status}
                  </span>
                  {b.fechaInoculacion && <span>Fecha: {b.fechaInoculacion}</span>}
                </li>
              ))}
            </ul>
            {/* Mass status controls */}
            <div style={{ marginTop: '0.5rem' }}>
              <select value={statusChange} onChange={(e) => setStatusChange(e.target.value)}>
                <option value="">Cambiar estado...</option>
                <option value="Planificado">Planificado</option>
                <option value="Inoculado">Inoculado</option>
                <option value="Incubando">Incubando</option>
                <option value="Finalizado">Finalizado</option>
              </select>
              <button className="btn-primary" style={{ marginLeft: '0.5rem' }} onClick={handleMassStatus} disabled={!selectedBatchIds.length}>
                Aplicar a seleccionados
              </button>
            </div>
          </div>
        );
      })}

      {/* Variables respuesta – solo si existen */}
      {/* Statistics per variable */}
      {Object.entries(statsByVar).map(([varName, rows]) => (
        <div key={varName} className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>{varName}</h3>
            <button className="btn-secondary" onClick={() => exportStatsCSV(varName, rows)}>
              Exportar CSV
            </button>
          </div>
          <table className="tabla-valor" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
            <thead>
              <tr>
                <th>Tratamiento</th>
                <th>N</th>
                <th>Media</th>
                <th>Desvío</th>
                <th>Mín</th>
                <th>Máx</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx}>
                  <td>{r.tratamientoLabel}</td>
                  <td>{r.n === 0 ? '—' : r.n}</td>
                  <td>{r.n === 0 ? '—' : r.media}</td>
                  <td>{r.n === 0 ? '—' : r.desvio}</td>
                  <td>{r.n === 0 ? '—' : r.min}</td>
                  <td>{r.n === 0 ? '—' : r.max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {/* End of statistics */}
        <div className="card" style={{ padding: '1rem' }}>
          <h3>Variables de respuesta</h3>
          <p>(Implementación futura)</p>
        </div>
      )}
    </div>
      {modalOpen && (
        <AdoptBatchModal
          experimentoId={id}
          tratamientoId={adoptTratId}
          onClose={() => setModalOpen(false)}
          onAdopt={handleAdopt}
        />
      )}
  );
}
