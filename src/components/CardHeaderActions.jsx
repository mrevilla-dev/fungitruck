import React from 'react';
import { doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase'; // adjust path as needed

export default function CardHeaderActions({ medio, refresh }) {
  const handleEdit = () => {
    // Open the NuevoMedioModal in edit mode – we use a global state setter via event
    const editEvent = new CustomEvent('edit-medio', { detail: medio });
    window.dispatchEvent(editEvent);
  };

  const handleReprint = () => {
    // Assume a utility to print ZPL exists; here we just trigger a placeholder
    const printEvent = new CustomEvent('print-medio', { detail: medio });
    window.dispatchEvent(printEvent);
  };

  const handleMarkAgotado = async () => {
    const confirm = window.confirm('¿Marcar este medio como Agotado?');
    if (!confirm) return;
    const ref = doc(db, 'medios_preparados', medio.id);
    await updateDoc(ref, {
      estado: 'Agotado',
      fecha_agotamiento: serverTimestamp(),
      motivo_agotamiento: 'Se usó todo',
    });
    refresh();
  };

  const handleArchive = async () => {
    const confirm = window.confirm('¿Archivar este medio?');
    if (!confirm) return;
    const ref = doc(db, 'medios_preparados', medio.id);
    await updateDoc(ref, { estado: 'Archivado' });
    refresh();
  };

  const handleDelete = async () => {
    const confirm = window.confirm('¿Eliminar lógicamente este medio?');
    if (!confirm) return;
    const ref = doc(db, 'medios_preparados', medio.id);
    await updateDoc(ref, {
      eliminado: true,
      fecha_eliminacion: serverTimestamp(),
    });
    refresh();
  };

  return (
    <div style={{ display: 'flex', gap: '0.3rem' }}>
      <button className="btn-icon" title="Editar" onClick={handleEdit}>🖊️</button>
      <button className="btn-icon" title="Reimprimir" onClick={handleReprint}>🏷️</button>
      {medio.estado === 'Activo' && (
        <button className="btn-icon" title="Marcar agotado" onClick={handleMarkAgotado}>✅</button>
      )}
      <button className="btn-icon" title="Archivar" onClick={handleArchive}>🗃️</button>
      <button className="btn-icon" title="Eliminar" onClick={handleDelete}>🗑️</button>
    </div>
  );
}
