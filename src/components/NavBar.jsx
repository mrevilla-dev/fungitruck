import React from 'react';
import { NavLink } from 'react-router-dom';
import './NavBar.css'; // optional styling file

const links = [
  { label: 'Dashboard', path: '/' },
  { label: '🍄 Ingreso', path: '/ingreso-material' },
  { label: 'Inventario', path: '/inventario' },
  { label: 'Escanear', path: '/escanear' },
  { label: 'Salas', path: '/salas' },
  { label: 'Esporomas', path: '/esporomas' },
  { label: '🧬 Ejemplares', path: '/ejemplares' },
  { label: 'Crio', path: '/crio' },
  { label: '🧊 Criobanco', path: '/criobanco' },
  { label: 'Cosechas', path: '/cosechas' },
  { label: 'Mantenimiento', path: '/mantenimiento' },
  { label: '⚙️ Equipos', path: '/equipos' },
  { label: '🌳 Árbol', path: '/arbol' },
  { label: '🖨️ Cola', path: '/print-queue' },
  { label: 'Experimentos', path: '/experimentos' },
];

export default function NavBar() {
  return (
    <nav className="navbar navbar-desktop">
      <ul className="nav-list">
        {links.map((l) => (
          <li key={l.path} className="nav-item">
            <NavLink
              to={l.path}
              end
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {l.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
