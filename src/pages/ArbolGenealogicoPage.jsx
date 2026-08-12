import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Html5Qrcode } from 'html5-qrcode';
import { normalizarScan } from '../utils/normalizarScan';
import toast from 'react-hot-toast';

// Nodos custom
import NodoBatch from '../components/arbol/nodos/NodoBatch';
import NodoEjemplar from '../components/arbol/nodos/NodoEjemplar';
import NodoEsporoma from '../components/arbol/nodos/NodoEsporoma';
import NodoCosecha from '../components/arbol/nodos/NodoCosecha';
import NodoCrioResumen from '../components/arbol/nodos/NodoCrioResumen';
import NodoColapso from '../components/arbol/nodos/NodoColapso';

import PanelDetalleArbol from '../components/arbol/PanelDetalleArbol';

import { construirArbolDesdeBatch, construirArbolDesdeEjemplar } from '../utils/construirArbolGenealogico';
import { calcularLayout } from '../utils/layoutArbol';

const nodeTypes = {
  batchNode: NodoBatch,
  ejemplarNode: NodoEjemplar,
  esporomaNode: NodoEsporoma,
  cosechaNode: NodoCosecha,
  crioResumenNode: NodoCrioResumen,
  colapsoNode: NodoColapso,
};

export default function ArbolGenealogicoPage({ tipo }) {
  const { id } = useParams(); // tipo: 'batch' | 'ejemplar'
  // Si no se pasó 'tipo' por prop, podemos derivarlo de la URL o usar uno por defecto si id existe
  const renderTipo = tipo || 'batch'; 

  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [cargandoBusqueda, setCargandoBusqueda] = useState(false);
  const [msgErrorBusqueda, setMsgErrorBusqueda] = useState('');

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [panelDetalle, setPanelDetalle] = useState(null);
  const [mostrarScanner, setMostrarScanner] = useState(false);

  const esMobile = window.innerWidth < 768;
  const direction = esMobile ? 'TB' : 'LR';

  useEffect(() => {
    if (id) {
      cargarArbol(id, renderTipo);
    } else {
      setCargando(false);
    }
  }, [id, renderTipo]);

  async function cargarArbol(targetId, targetTipo) {
    try {
      setCargando(true);
      setError(null);
      const { nodos, aristas } = targetTipo === 'ejemplar'
        ? await construirArbolDesdeEjemplar(targetId)
        : await construirArbolDesdeBatch(targetId);

      const nodosConLayout = calcularLayout(nodos, aristas, direction);
      setNodes(nodosConLayout);
      setEdges(aristas);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  // Recentrado dinámico
  async function recentrarEn(nuevoId, nuevoTipo) {
    await cargarArbol(nuevoId, nuevoTipo);
  }

  const handleBuscar = async (e) => {
    e.preventDefault();
    const term = busqueda.trim();
    if (!term) return;

    setCargandoBusqueda(true);
    setMsgErrorBusqueda('');

    try {
      // 1. Buscar en 'batches' por doc ID
      const batchDocRef = doc(db, 'batches', term);
      const batchDocSnap = await getDoc(batchDocRef);
      if (batchDocSnap.exists()) {
        navigate(`/arbol/batch/${batchDocSnap.id}`);
        return;
      }

      // 2. Buscar en 'ejemplares' por doc ID
      const ejemplarDocRef = doc(db, 'ejemplares', term);
      const ejemplarDocSnap = await getDoc(ejemplarDocRef);
      if (ejemplarDocSnap.exists()) {
        navigate(`/arbol/ejemplar/${ejemplarDocSnap.id}`);
        return;
      }

      // 3. Buscar en 'ejemplares' por campo 'id_semantico'
      const qEjemplarSemantico = query(collection(db, 'ejemplares'), where('id_semantico', '==', term));
      const snapEjemplarSemantico = await getDocs(qEjemplarSemantico);
      if (!snapEjemplarSemantico.empty) {
        navigate(`/arbol/ejemplar/${snapEjemplarSemantico.docs[0].id}`);
        return;
      }

      // 4. Buscar en 'batches' por campo 'id_semantico' (por si acaso)
      const qBatchSemantico = query(collection(db, 'batches'), where('id_semantico', '==', term));
      const snapBatchSemantico = await getDocs(qBatchSemantico);
      if (!snapBatchSemantico.empty) {
        navigate(`/arbol/batch/${snapBatchSemantico.docs[0].id}`);
        return;
      }

      // 5. Buscar en 'esporomas' por doc ID o id_semantico
      let esporomaSnap = null;
      const esporomaDocRef = doc(db, 'esporomas', term);
      const esporomaDocSnap = await getDoc(esporomaDocRef);
      if (esporomaDocSnap.exists()) {
        esporomaSnap = esporomaDocSnap;
      } else {
        const qEsporomaSemantico = query(collection(db, 'esporomas'), where('id_semantico', '==', term));
        const snapEsp = await getDocs(qEsporomaSemantico);
        if (!snapEsp.empty) esporomaSnap = snapEsp.docs[0];
      }
      if (esporomaSnap) {
        const esporomaId = esporomaSnap.id;
        // Buscar el ejemplar que tiene este esporoma como origen
        const qEje = query(collection(db, 'ejemplares'), where('esporoma_origen_id', '==', esporomaId));
        const snapEje = await getDocs(qEje);
        if (!snapEje.empty) {
          navigate(`/arbol/ejemplar/${snapEje.docs[0].id}`);
          return;
        }
        // Si no tiene ejemplar derivado, mostrar el esporoma como nodo aislado
        toast('Esporoma encontrado sin ejemplar derivado. Mostrando esporoma.');
        setMsgErrorBusqueda('Este esporoma no tiene ejemplares derivados aún.');
        return;
      }

      setMsgErrorBusqueda('No se encontró ningún batch, ejemplar o esporoma con ese ID.');
    } catch (err) {
      console.error('Error al buscar:', err);
      setMsgErrorBusqueda('Ocurrió un error al realizar la búsqueda.');
    } finally {
      setCargandoBusqueda(false);
    }
  };

  useEffect(() => {
    let html5QrCode;
    if (mostrarScanner) {
      html5QrCode = new Html5Qrcode("reader-arbol");
      const config = { fps: 20, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
      
      html5QrCode.start(
        { facingMode: "environment" },
        config,
        async (decodedText) => {
          if (html5QrCode.isScanning) {
            await html5QrCode.stop().catch(err => console.warn(err));
          }
          handleScanResult(normalizarScan(decodedText));
        },
        () => {}
      ).catch(err => {
        console.error("Unable to start scanner", err);
        html5QrCode.start({ facingMode: "user" }, config, async (decodedText) => {
          if (html5QrCode.isScanning) {
            await html5QrCode.stop().catch(e => console.warn(e));
          }
          handleScanResult(normalizarScan(decodedText));
        }, () => {});
      });
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.warn(err));
      }
    };
  }, [mostrarScanner]);

  const handleScanResult = async (scannedId) => {
    setCargandoBusqueda(true);
    setMostrarScanner(false);
    setMsgErrorBusqueda('');

    try {
      const term = scannedId.trim();

      const batchDocRef = doc(db, 'batches', term);
      const batchDocSnap = await getDoc(batchDocRef);
      if (batchDocSnap.exists()) {
        navigate(`/arbol/batch/${batchDocSnap.id}`);
        return;
      }

      const ejemplarDocRef = doc(db, 'ejemplares', term);
      const ejemplarDocSnap = await getDoc(ejemplarDocRef);
      if (ejemplarDocSnap.exists()) {
        navigate(`/arbol/ejemplar/${ejemplarDocSnap.id}`);
        return;
      }

      const qEjemplarSemantico = query(collection(db, 'ejemplares'), where('id_semantico', '==', term));
      const snapEjemplarSemantico = await getDocs(qEjemplarSemantico);
      if (!snapEjemplarSemantico.empty) {
        navigate(`/arbol/ejemplar/${snapEjemplarSemantico.docs[0].id}`);
        return;
      }

      const qBatchSemantico = query(collection(db, 'batches'), where('id_semantico', '==', term));
      const snapBatchSemantico = await getDocs(qBatchSemantico);
      if (!snapBatchSemantico.empty) {
        navigate(`/arbol/batch/${snapBatchSemantico.docs[0].id}`);
        return;
      }

      // 5. Buscar en 'esporomas' por doc ID o id_semantico
      let esporomaSnap = null;
      const esporomaDocRef = doc(db, 'esporomas', term);
      const esporomaDocSnap = await getDoc(esporomaDocRef);
      if (esporomaDocSnap.exists()) {
        esporomaSnap = esporomaDocSnap;
      } else {
        const qEsporomaSemantico = query(collection(db, 'esporomas'), where('id_semantico', '==', term));
        const snapEsp = await getDocs(qEsporomaSemantico);
        if (!snapEsp.empty) esporomaSnap = snapEsp.docs[0];
      }
      if (esporomaSnap) {
        const esporomaId = esporomaSnap.id;
        const qEje = query(collection(db, 'ejemplares'), where('esporoma_origen_id', '==', esporomaId));
        const snapEje = await getDocs(qEje);
        if (!snapEje.empty) {
          navigate(`/arbol/ejemplar/${snapEje.docs[0].id}`);
          return;
        }
        toast('Esporoma encontrado sin ejemplar derivado.');
        setMsgErrorBusqueda('Este esporoma no tiene ejemplares derivados aún.');
        return;
      }

      toast("El código escaneado no corresponde a un batch, ejemplar o esporoma.");
      setMsgErrorBusqueda("El código escaneado no corresponde a un batch, ejemplar o esporoma.");
    } catch (err) {
      console.error(err);
      toast.error("Error al procesar el código escaneado.");
    } finally {
      setCargandoBusqueda(false);
    }
  };


  if (cargando) return <div style={{ padding: '2rem', color: 'white', textAlign: 'center' }}>Cargando árbol...</div>;
  if (error) return <div style={{ padding: '2rem', color: '#f87171', textAlign: 'center' }}>Error: {error}</div>;

  if (!id) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', padding: '1rem', margin: 'auto' }}>
        <div style={{ maxWidth: '500px', width: '100%', textAlign: 'center', color: '#f8fafc', padding: '2rem', background: '#1e293b', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)', border: '1px solid #334155' }}>
          <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>🌳</span>
          <h3 style={{ marginBottom: '0.5rem', color: '#f8fafc' }}>Árbol Genealógico</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Buscá un batch o ejemplar por su ID semántico (ej. B-... o EJE-...) para visualizar su trazabilidad completa.
          </p>

          <form onSubmit={handleBuscar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Ingresá ID semántico (ej. B-XXX-... o EJE-...)"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              disabled={cargandoBusqueda}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                fontSize: '1rem',
                background: '#0f172a',
                border: '1px solid #475569',
                borderRadius: '8px',
                color: '#fff',
                outline: 'none',
              }}
            />

            {msgErrorBusqueda && (
              <div style={{ color: '#f87171', fontSize: '0.85rem', textAlign: 'left', marginTop: '0.25rem' }}>
                ⚠️ {msgErrorBusqueda}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setMostrarScanner(true)}
                style={{
                  padding: '0.75rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flex: 1,
                  borderColor: '#475569',
                  color: '#cbd5e1'
                }}
              >
                📷 Escanear QR
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={cargandoBusqueda || !busqueda.trim()}
                style={{
                  padding: '0.75rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flex: 1
                }}
              >
                {cargandoBusqueda ? '...' : '🔍 Buscar'}
              </button>
            </div>
          </form>
        </div>

        {mostrarScanner && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1000, 
            background: 'rgba(0,0,0,0.8)', display: 'flex', 
            flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
          }}>
            <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '12px', width: '90%', maxWidth: '400px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: '#f8fafc' }}>Escanear QR</h3>
                <button onClick={() => setMostrarScanner(false)} style={{ background: 'transparent', border: 'none', color: '#f8fafc', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
              </div>
              <div
                id="reader-arbol"
                style={{
                  width: '100%',
                  minHeight: '300px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: '#000'
                }}
              ></div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 80px)', display: 'flex', background: '#0f172a' }}>
      {/* Árbol React Flow */}
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={nodes.map(n => ({
            ...n,
            data: {
              ...n.data,
              onRecentrar: recentrarEn,
              onVerDetalle: (nodoData) => setPanelDetalle(nodoData),
            }
          }))}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.3}
          maxZoom={2}
          attributionPosition="bottom-right"
        >
          <Background color="#334155" gap={16} />
          <Controls style={{ background: '#1e293b', color: '#cbd5e1', borderColor: '#475569' }} />
          {!esMobile && <MiniMap style={{ background: '#1e293b', maskColor: '#33415544' }} nodeColor="#475569" />}
        </ReactFlow>
      </div>

      {/* Panel lateral de detalle (Desktop) */}
      {!esMobile && panelDetalle && (
        <div style={{ width: '350px', background: '#1e293b', borderLeft: '1px solid #334155', padding: '1rem', color: '#f8fafc', overflowY: 'auto' }}>
          <PanelDetalleArbol datos={panelDetalle} onCerrar={() => setPanelDetalle(null)} />
        </div>
      )}

      {/* Panel de detalle (Mobile) - Modal full screen */}
      {esMobile && panelDetalle && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#1e293b', padding: '1rem', color: '#f8fafc', overflowY: 'auto' }}>
          <PanelDetalleArbol datos={panelDetalle} onCerrar={() => setPanelDetalle(null)} />
        </div>
      )}
    </div>
  );
}
