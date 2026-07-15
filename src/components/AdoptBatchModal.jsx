import React, { useState, useEffect } from 'react';
import { searchBatchesByEspecie } from '../services/experimentoDetalleService'; // We'll implement a simple service helper
import toast from 'react-hot-toast';

export default function AdoptBatchModal({ experimentoId, tratamientoId, onClose, onAdopt }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const list = await searchBatchesByEspecie(searchTerm);
      setResults(list);
    } catch (e) {
      console.error(e);
      toast.error('Error al buscar batches');
    } finally {
      setLoading(false);
    }
  };

  const handleAdopt = (batchId) => {
    onAdopt(tratamientoId, batchId);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h3>Adoptar batch para tratamiento</h3>
        <input
          type="text"
          placeholder="Buscar por ID o especie"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        <button onClick={handleSearch} disabled={loading}>Buscar</button>
        <button onClick={onClose}>Cancelar</button>
        {loading && <p>Cargando...</p>}
        <ul>
          {results.map(b => (
            <li key={b.id} style={{ marginTop: '0.5rem' }}>
              <span>{b.id} – {b.especie}</span>
              <button style={{ marginLeft: '0.5rem' }} onClick={() => handleAdopt(b.id)}>Adoptar</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
