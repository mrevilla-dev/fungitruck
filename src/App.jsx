import React, { Suspense, useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './firebase'; // Inicializar firebase
import './App.css'; // Estilos globales
import NavBar from './components/NavBar';
import ErrorBoundary from './components/ErrorBoundary';
import AsistenteFlotante from './components/AsistenteFlotante';
import { useIsMobile } from './hooks/useIsMobile';
import BarraInferiorMobile from './components/nav/BarraInferiorMobile';
import LoadingPlaceholder from './components/LoadingPlaceholder';
// Páginas (lazy-loaded)
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const InventoryPage = React.lazy(() => import('./pages/InventoryPage'));
const ScannerPage = React.lazy(() => import('./pages/ScannerPage'));
const SalasPage = React.lazy(() => import('./pages/SalasPage'));
const EsporomasPage = React.lazy(() => import('./pages/EsporomasPage'));
const EjemplaresPage = React.lazy(() => import('./pages/EjemplaresPage'));
const CosechasPage = React.lazy(() => import('./pages/CosechasPage'));
const Maintenance = React.lazy(() => import('./pages/Maintenance'));
const PrintQueue = React.lazy(() => import('./pages/PrintQueue'));
const ArbolGenealogicoPage = React.lazy(() => import('./pages/ArbolGenealogicoPage'));
const IngresoMaterialPage = React.lazy(() => import('./pages/IngresoMaterialPage'));
const Login = React.lazy(() => import('./components/Login'));
const CriopreservacionNuevaPage = React.lazy(() => import('./pages/CriopreservacionNuevaPage'));
const CriobancoListPage = React.lazy(() => import('./pages/CriobancoListPage'));
const CriovialDetallePage = React.lazy(() => import('./pages/CriovialDetallePage'));
const CriovialDescongelacionPage = React.lazy(() => import('./pages/CriovialDescongelacionPage'));
const ExperimentoNuevoPage = React.lazy(() => import('./pages/ExperimentoNuevoPage'));
const ExperimentosListPage = React.lazy(() => import('./pages/ExperimentosListPage'));
const MigracionEquiposPage = React.lazy(() => import('./pages/MigracionEquiposPage'));
const EquiposPage = React.lazy(() => import('./pages/EquiposPage'));
const EquipoDetallePage = React.lazy(() => import('./pages/EquipoDetallePage'));

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
        <Suspense fallback={<LoadingPlaceholder />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventario" element={<InventoryPage />} />
          <Route path="/escanear" element={<ScannerPage />} />
          <Route path="/salas" element={<SalasPage />} />
          <Route path="/esporomas" element={<EsporomasPage />} />
          <Route path="/ejemplares" element={<EjemplaresPage />} />
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
        </Suspense>
        </ErrorBoundary>
      </div>
      {isMobile && <BarraInferiorMobile />}
      <AsistenteFlotante />
      <Toaster position="top-center" />
    </div>
  );
}
