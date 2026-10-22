import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import api from '../api/client';

const NAV = [
  { to: '/', label: 'Resumen', icon: '📊' },
  { to: '/accumulated', label: 'Acumulado', icon: '📈' },
  { to: '/status', label: 'Estado Pedidos', icon: '📦' },
  { to: '/geo', label: 'Geografía', icon: '🗺️' },
  { to: '/dispatch-errors', label: 'Errores de Despacho', icon: '⚠️' },
  { to: '/recommendations', label: 'Recomendaciones', icon: '💡' },
  { to: '/trends', label: 'Tendencias', icon: '📉' },
  { to: '/meta-audiences', label: 'Audiencias Meta', icon: '🎯' },
  { to: '/products', label: 'Productos', icon: '🏷️' },
  { to: '/upload', label: 'Cargar Excel', icon: '📂' },
  { to: '/settings', label: 'Configuración', icon: '⚙️' },
];

const styles = {
  sidebar: {
    width: 220, minHeight: '100vh', background: '#1e293b', color: '#fff',
    display: 'flex', flexDirection: 'column', flexShrink: 0,
  },
  logo: {
    padding: '24px 20px 16px', borderBottom: '1px solid #334155',
    fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px',
    color: '#f8fafc',
  },
  logoSub: { fontSize: 11, color: '#94a3b8', fontWeight: 400, marginTop: 2 },
  nav: { padding: '12px 0', flex: 1, overflowY: 'auto' },
  navLink: (active) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 20px', textDecoration: 'none',
    color: active ? '#f8fafc' : '#94a3b8',
    background: active ? '#334155' : 'transparent',
    borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
    fontSize: 14, fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
    cursor: 'pointer',
  }),
  main: { flex: 1, padding: 28, overflowY: 'auto', minWidth: 0 },
  userBox: { padding: '14px 20px', borderTop: '1px solid #334155' },
  userName: { fontSize: 13, fontWeight: 600, color: '#f8fafc' },
  logoutBtn: {
    background: 'none', border: 'none', color: '#94a3b8', fontSize: 12,
    cursor: 'pointer', padding: 0, marginTop: 4, textDecoration: 'underline',
  },
};

export default function Layout({ children }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  async function handleLogout() {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <div className="app-topbar">
        <button onClick={() => setOpen(true)} aria-label="Abrir menú">☰</button>
        <span style={{ fontWeight: 700 }}>Dropi Manager</span>
      </div>

      {open && <div className="app-overlay" onClick={() => setOpen(false)} />}

      <aside className={`app-sidebar${open ? ' open' : ''}`} style={styles.sidebar}>
        <div style={styles.logo}>
          Dropi Manager
          <div style={styles.logoSub}>Panel de Cierres</div>
        </div>
        <nav style={styles.nav}>
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setOpen(false)}
              style={({ isActive }) => styles.navLink(isActive)}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        {user && (
          <div style={styles.userBox}>
            <div style={styles.userName}>{user.name}</div>
            <button style={styles.logoutBtn} onClick={handleLogout}>Cerrar sesión</button>
          </div>
        )}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #334155', fontSize: 12, color: '#64748b' }}>
          v1.0 · Dropi Manager
        </div>
      </aside>
      <main className="app-main" style={styles.main}>{children}</main>
    </div>
  );
}
