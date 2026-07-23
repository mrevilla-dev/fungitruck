import React from 'react';
import { NavLink } from 'react-router-dom';
import './NavBar.css'; // optional styling file

const links = [
  { label: 'Dashboard', path: '/' },
  { label: 'Escanear', path: '/escanear' },
  { label: 'Salas', path: '/salas' },
  { label: 'Mantenimiento', path: '/mantenimiento' },
  { label: '⚙️ Equipos', path: '/equipos' },
  { label: 'Inventario', path: '/inventario' },
  { label: '🖨️ Cola', path: '/print-queue' },
  { label: '🍄 Ingreso', path: '/ingreso-material' },
  { label: '🧬 Ejemplares', path: '/ejemplares' },
  { label: 'Esporomas', path: '/esporomas' },
  { label: '🧊 Criobanco', path: '/criobanco' },
  { label: 'Cosechas', path: '/cosechas' },
  { label: '🌳 Árbol', path: '/arbol' },
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
