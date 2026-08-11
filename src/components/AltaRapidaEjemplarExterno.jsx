import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { getTipoMaterialCodigo } from '../utils/tipoMaterialCodes';

export default function AltaRapidaEjemplarExterno({ onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    genero: '',
    especie: '',
    codigo_cepa: '',
    tipo_material: 'Micelio en grano',
    procedencia: 'Comercial',
    proveedor: '',
    observaciones: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.genero || !formData.especie || !formData.tipo_material) {
      setError('Por favor complete Género, Especie y Tipo de material.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const g = formData.genero.substring(0, 3).toUpperCase().replace(/\s/g, '');
      const e_val = formData.especie.substring(0, 3).toUpperCase().replace(/\s/g, '');
      const cepa = formData.codigo_cepa ? `-${formData.codigo_cepa}` : '';
      const tm = formData.tipo_material === 'Micelio en grano' ? getTipoMaterialCodigo('grano') : getTipoMaterialCodigo('liquido');
      
      const fDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const yymmdd = fDate.substring(2);
      const seqKey = `EJE_${yymmdd}`;

      let currentSeq = 1;

      await runTransaction(db, async (t) => {
        const counterRef = doc(db, 'metadata', 'counters');
        const counterDoc = await t.get(counterRef);
        const data = counterDoc.exists() ? counterDoc.data() : {};
        currentSeq = (data[seqKey] || 0) + 1;
        t.set(counterRef, { [seqKey]: currentSeq }, { merge: true });
      });

      const nnn = String(currentSeq).padStart(3, '0');
      const idSemantico = `EJE-${g}${e_val}${cepa}-${tm}-${yymmdd}-${nnn}`;

      const ejemplarRef = doc(db, 'ejemplares', idSemantico);
      await setDoc(ejemplarRef, {
        genero: formData.genero,
        especie: formData.especie,
        codigo_cepa: formData.codigo_cepa,
        tipo_material: formData.tipo_material,
        procedencia: formData.procedencia,
        proveedor: formData.proveedor,
        observaciones: formData.observaciones,
        estado: 'Activo',
        tecnica_aislamiento: 'na',
        generacion: 0,
        id_semantico: idSemantico,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      onSuccess(idSemantico);

    } catch (err) {
      console.error(err);
      setError('Error al crear el ejemplar: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-50 p-4 rounded-md border border-gray-200 mt-4">
      <h3 className="text-lg font-medium mb-4 text-gray-800">Alta de Material Externo</h3>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-100 p-2 rounded">{error}</div>}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Género *</label>
            <input type="text" name="genero" value={formData.genero} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Especie *</label>
            <input type="text" name="especie" value={formData.especie} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Código de Cepa</label>
            <input type="text" name="codigo_cepa" value={formData.codigo_cepa} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Tipo de Material *</label>
            <select name="tipo_material" value={formData.tipo_material} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
              <option value="Micelio en grano">Micelio en grano</option>
              <option value="Jeringa (LC)">Jeringa (LC)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Procedencia *</label>
            <input type="text" name="procedencia" value={formData.procedencia} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Proveedor</label>
            <input type="text" name="proveedor" value={formData.proveedor} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Observaciones</label>
          <textarea name="observaciones" value={formData.observaciones} onChange={handleChange} rows="2" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"></textarea>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <button type="button" onClick={onCancel} className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50">
            {isSubmitting ? 'Guardando...' : 'Crear y Usar'}
          </button>
        </div>
      </form>
    </div>
  );
}
