import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import NewBatch from './pages/NewBatch';
import ScannerPage from './pages/ScannerPage';
import Maintenance from './pages/Maintenance';
import SalasPage from './pages/SalasPage';
import EsporomasPage from './pages/EsporomasPage';
import InventoryPage from './pages/InventoryPage';
import AdminResetPage from './pages/AdminResetPage';
import PermissionGuard from './components/PermissionGuard';
import './App.css';

function App() {
  return (
    <Router>
      <PermissionGuard>
        <div className="container">
        <header className="app-header no-print">
          <div className="brand">FungiTrack</div>
          <nav className="nav-links">
            <Link to="/" className="nav-link">Inicio</Link>
            <Link to="/new" className="nav-link">Inocular</Link>
            <Link to="/scan" className="nav-link">Escanear</Link>
            <Link to="/inventory" className="nav-link">Inventario</Link>
            <Link to="/salas" className="nav-link">Salas</Link>
            <Link to="/esporomas" className="nav-link">Ejemplares</Link>
            <Link to="/maintenance" className="nav-link">Mantenimiento</Link>
          </nav>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/new" element={<NewBatch />} />
            <Route path="/scan" element={<ScannerPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/salas" element={<SalasPage />} />
            <Route path="/esporomas" element={<EsporomasPage />} />
            <Route path="/admin-reset" element={<AdminResetPage />} />
          </Routes>
        </main>
      </div>
      </PermissionGuard>
    </Router>
  );
}

export default App;
