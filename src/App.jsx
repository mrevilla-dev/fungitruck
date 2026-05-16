import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import NewBatch from './pages/NewBatch';
import ScannerPage from './pages/ScannerPage';
import Maintenance from './pages/Maintenance';
import SalasPage from './pages/SalasPage';
import EsporomasPage from './pages/EsporomasPage';
import InventoryPage from './pages/InventoryPage';
import AdminResetPage from './pages/AdminResetPage';
import PrintPage from './pages/PrintPage';
import PermissionGuard from './components/PermissionGuard';
import './App.css';

function App() {
  return (
    <Router>
      <PermissionGuard>
        <div className="container">
        <header className="app-header no-print">
          <div className="brand">🍄 FungiTrack</div>
          <nav className="nav-links">
            <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Dashboard</NavLink>
            <NavLink to="/inventory" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Inventario</NavLink>
            <NavLink to="/scan" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Escanear</NavLink>
            <NavLink to="/salas" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Salas</NavLink>
            <NavLink to="/esporomas" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Ejemplares</NavLink>
            <NavLink to="/print" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Impresión</NavLink>
            <NavLink to="/maintenance" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Mantenimiento</NavLink>
          </nav>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewBatch />} />
            <Route path="/scan" element={<ScannerPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/salas" element={<SalasPage />} />
            <Route path="/esporomas" element={<EsporomasPage />} />
            <Route path="/print" element={<PrintPage />} />
            <Route path="/admin-reset" element={<AdminResetPage />} />
          </Routes>
        </main>
      </div>
      </PermissionGuard>
    </Router>
  );
}

export default App;
