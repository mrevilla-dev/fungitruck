import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getExperimentos } from '../services/experimentoService';
import toast from 'react-hot-toast';
import '../styles/experimentosList.css';

export default function ExperimentosListPage() {
  const navigate = useNavigate();
  const [experimentos, setExperimentos] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [filters, setFilters] = useState({ estado: '', especie: '', responsable: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const list = await getExperimentos();
        setExperimentos(list);
        setFiltered(list);
      } catch (e) {
        console.error(e);
        toast.error('Error al cargar experimentos');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const applyFilters = () => {
    const { estado, especie, responsable } = filters;
    const res = experimentos.filter(exp => {
      const matchEstado = estado ? exp.estado === estado : true;
      const matchEspecie = especie ? (exp.especie || '').toLowerCase().includes(especie.toLowerCase()) : true;
      const matchResp = responsable ? (exp.responsable || '').toLowerCase().includes(responsable.toLowerCase()) : true;
      return matchEstado && matchEspecie && matchResp;
    });
    setFiltered(res);
  };

  const handleChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  if (loading) return <div className="centered">🔄 Cargando experimentos...</div>;

  return (
    <div className="experimentos-list-page">
      <h1>Experimentos</h1>
      <div className="filters">
        <select name="estado" value={filters.estado} onChange={handleChange}>
          <option value="">Todos los estados</option>
          <option value="Planificado">Planificado</option>
          <option value="En curso">En curso</option>
          <option value="Finalizado">Finalizado</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <input type="text" name="especie" placeholder="Especie" value={filters.especie} onChange={handleChange} />
        <input type="text" name="responsable" placeholder="Responsable" value={filters.responsable} onChange={handleChange} />
        <button className="btn-primary" onClick={applyFilters}>Filtrar</button>
        <button className="btn-secondary" onClick={() => { setFilters({ estado: '', especie: '', responsable: '' }); setFiltered(experimentos); }}>Reset</button>
      </div>
      <div className="cards-grid">
        {filtered.map(exp => (
          <div key={exp.id} className="exp-card">
            <h3>{exp.nombre}</h3>
            <p><strong>Especie:</strong> {exp.especie}</p>
            <span className={`badge badge-${exp.estado.toLowerCase()}`}>{exp.estado}</span>
            <p><strong>Inicio:</strong> {exp.fecha_inicio || '-'} </p>
            <p><strong>Tratamientos:</strong> {exp.tratamientos?.length || 0}</p>
            <p><strong>Responsable:</strong> {exp.responsable}</p>
            <button className="btn-primary" onClick={() => navigate(`/experimentos/${exp.id}`)}>Ver detalle</button>
          </div>
        ))}
      </div>
      <div className="bottom-actions">
        <button className="btn-primary" onClick={() => navigate('/experimentos/nuevo')}>Nuevo experimento</button>
      </div>
    </div>
  );
}
