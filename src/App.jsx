import React, { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './firebase'; // Inicializar firebase
import './App.css'; // Estilos globales
import NavBar from './components/NavBar';
import ErrorBoundary from './components/ErrorBoundary';
import { useIsMobile } from './hooks/useIsMobile';
import BarraInferiorMobile from './components/nav/BarraInferiorMobile';
// Páginas
import Dashboard from './pages/Dashboard';
import InventoryPage from './pages/InventoryPage';
import ScannerPage from './pages/ScannerPage';
import SalasPage from './pages/SalasPage';
import EsporomasPage from './pages/EsporomasPage';
import EjemplaresPage from './pages/EjemplaresPage';
import CrioPage from './pages/CrioPage';
import CosechasPage from './pages/CosechasPage';
import Maintenance from './pages/Maintenance';
import PrintQueue from './pages/PrintQueue';
import ArbolGenealogicoPage from './pages/ArbolGenealogicoPage';
import IngresoMaterialPage from './pages/IngresoMaterialPage';
import Login from './components/Login';
import CriopreservacionNuevaPage from './pages/CriopreservacionNuevaPage';
import CriobancoListPage from './pages/CriobancoListPage';
import CriovialDetallePage from './pages/CriovialDetallePage';
import CriovialDescongelacionPage from './pages/CriovialDescongelacionPage';
import ExperimentoNuevoPage from './pages/ExperimentoNuevoPage';
import ExperimentosListPage from './pages/ExperimentosListPage';
import MigracionEquiposPage from './pages/MigracionEquiposPage';
import EquiposPage from './pages/EquiposPage';
import EquipoDetallePage from './pages/EquipoDetallePage';

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
      setChecking(false);
    });
    return () => unsubscribe();
  }, []);

  if (checking) {
    return <div className="centered" style={{ padding: '2rem' }}>🔄 Verificando sesión...</div>;
  }

  // Si no está logeado, mostrar solo la pantalla de login
  if (!user) {
    return <Login onSuccess={() => {/* onAuthStateChanged actualizará user */}} />;
  }

  // Usuario logueado → UI completa con barra y rutas
  return (
    <div className="app-wrapper">
      {!isMobile && <NavBar />}
      <div className="content-wrapper" style={{ padding: '1rem' }}>
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventario" element={<InventoryPage />} />
          <Route path="/escanear" element={<ScannerPage />} />
          <Route path="/salas" element={<SalasPage />} />
          <Route path="/esporomas" element={<EsporomasPage />} />
          <Route path="/ejemplares" element={<EjemplaresPage />} />
          <Route path="/crio" element={<CrioPage />} />
          <Route path="/cosechas" element={<CosechasPage />} />
          <Route path="/mantenimiento" element={<Maintenance />} />
          <Route path="/print-queue" element={<PrintQueue />} />
          <Route path="/arbol" element={<ArbolGenealogicoPage />} />
          <Route path="/arbol/batch/:id" element={<ArbolGenealogicoPage tipo="batch" />} />
          <Route path="/arbol/ejemplar/:id" element={<ArbolGenealogicoPage tipo="ejemplar" />} />
          <Route path="/ingreso-material" element={<IngresoMaterialPage />} />
          {/* Bloque 3 — Wizard de Criopreservación */}
          <Route path="/criobanco/nuevo/batch/:batchId" element={<CriopreservacionNuevaPage />} />
          <Route path="/criobanco/nuevo/ejemplar/:ejemplarId" element={<CriopreservacionNuevaPage />} />
          {/* Bloque 4 — Lista de crioviales */}
          <Route path="/criobanco" element={<CriobancoListPage />} />
          {/* Bloque 6 — Detalle de criovial */}
          <Route path="/criobanco/criovial/:id" element={<CriovialDetallePage />} />
          {/* Bloque 7 — Descongelación */}
          <Route path="/criobanco/criovial/:id/descongelar" element={<CriovialDescongelacionPage />} />
          {/* Bloque 3 — Wizard de Experimentos */}
          <Route path="/experimentos/nuevo" element={<ExperimentoNuevoPage />} />
          <Route path="/experimentos" element={<ExperimentosListPage />} />
          {/* Bloque 1 — Migración Equipos */}
          <Route path="/migracion-equipos" element={<MigracionEquiposPage />} />
          {/* Bloque 3 y 4 — Equipos */}
          <Route path="/equipos" element={<EquiposPage user={user} />} />
          <Route path="/equipos/:id" element={<EquipoDetallePage user={user} />} />
        </Routes>
        </ErrorBoundary>
      </div>
      {isMobile && <BarraInferiorMobile />}
      <Toaster position="top-center" />
    </div>
  );
}
