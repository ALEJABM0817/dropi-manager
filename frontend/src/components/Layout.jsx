import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { FONT_HEADING } from '../theme';

function Icon({ d, viewBox = '0 0 24 24' }) {
  return (
    <svg width="17" height="17" viewBox={viewBox} fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <g dangerouslySetInnerHTML={{ __html: d }} />
    </svg>
  );
}

const ICONS = {
  resumen: '<path d="M3 13H9V21H3V13Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 3H21V21H15V3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 9H15V21H9V9Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  acumulado: '<path d="M3 17L9 11L13 15L21 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 7H21V13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  estado: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" stroke="currentColor" stroke-width="1.7"/><path d="M3.3 7L12 12L20.7 7M12 12V21.5" stroke="currentColor" stroke-width="1.7"/>',
  geo: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 3C8 7 8 17 12 21M12 3C16 7 16 17 12 21M3.3 9H20.7M3.3 15H20.7" stroke="currentColor" stroke-width="1.5"/>',
  errores: '<path d="M12 9V13M12 17H12.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10.3 3.6 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.7"/>',
  recomendaciones: '<path d="M9 18H15M10 21H14M12 3a6 6 0 0 0-3.6 10.8c.4.3.6.8.6 1.3V16h6v-.9c0-.5.2-1 .6-1.3A6 6 0 0 0 12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  tendencias: '<path d="M3 17L9 11L13 15L21 7M21 7V12M21 7H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  audiencias: '<circle cx="7" cy="7" r="3.2" stroke="currentColor" stroke-width="1.7"/><circle cx="17" cy="7" r="3.2" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="17" r="3.2" stroke="currentColor" stroke-width="1.7"/>',
  productos: '<path d="M20.6 11.1 12.9 3.4a2 2 0 0 0-2.8 0L3.4 10.1a2 2 0 0 0 0 2.8l7.7 7.7a2 2 0 0 0 2.8 0l6.7-6.7a2 2 0 0 0 0-2.8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="8.6" cy="8.6" r="1.4" fill="currentColor"/>',
  cargar: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  config: '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15 1.65 1.65 0 0 0 3.17 14H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" stroke-width="1.5"/>',
};

const NAV = [
  { to: '/', label: 'Resumen', icon: 'resumen' },
  { to: '/accumulated', label: 'Acumulado', icon: 'acumulado' },
  { to: '/status', label: 'Estado Pedidos', icon: 'estado' },
  { to: '/geo', label: 'Geografía', icon: 'geo' },
  { to: '/dispatch-errors', label: 'Errores de Despacho', icon: 'errores' },
  { to: '/recommendations', label: 'Recomendaciones', icon: 'recomendaciones' },
  { to: '/trends', label: 'Tendencias', icon: 'tendencias' },
  { to: '/meta-audiences', label: 'Audiencias Meta', icon: 'audiencias' },
  { to: '/products', label: 'Productos', icon: 'productos' },
  { to: '/upload', label: 'Cargar Excel', icon: 'cargar' },
  { to: '/settings', label: 'Configuración', icon: 'config' },
];

const styles = {
  sidebar: {
    width: 264, minHeight: '100vh', color: '#fff',
    background: 'linear-gradient(185deg, #171A2E 0%, #121426 100%)',
    display: 'flex', flexDirection: 'column', flexShrink: 0, padding: '24px 16px',
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 11, padding: '0 8px 24px',
  },
  mark: {
    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
    background: 'linear-gradient(135deg, #818CF8, #6366F1 55%, #4F46E5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 6px 16px -4px rgba(99,102,241,.6)',
  },
  logoText: { fontFamily: FONT_HEADING, fontSize: 16, fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.2px' },
  logoSub: { fontSize: 11.5, color: '#7E84A3', fontWeight: 500 },
  nav: { padding: '4px 0', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 },
  navLink: (active) => ({
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px', borderRadius: 10, textDecoration: 'none',
    color: active ? '#F1F2FB' : '#9CA1BE',
    background: active ? 'linear-gradient(135deg, rgba(129,140,248,.22), rgba(99,102,241,.08))' : 'transparent',
    border: active ? '1px solid rgba(129,140,248,.25)' : '1px solid transparent',
    fontSize: 13.5, fontWeight: active ? 600 : 500,
    transition: 'background 0.15s, color 0.15s',
  }),
  main: { flex: 1, padding: '30px 40px', overflowY: 'auto', minWidth: 0, background: '#F4F5F9' },
  userBox: {
    marginTop: 'auto', paddingTop: 18, borderTop: '1px solid rgba(255,255,255,.08)',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  avatar: {
    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
    background: 'linear-gradient(135deg,#F0ABFC,#818CF8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12.5, fontWeight: 700, color: '#1E1B3A',
  },
  userName: { fontSize: 12.5, fontWeight: 600, color: '#EDEEF8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  logoutBtn: {
    background: 'none', border: 'none', color: '#6E749A', fontSize: 11,
    cursor: 'pointer', padding: 0, marginTop: 3, fontWeight: 500,
  },
};

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

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
        <span style={{ fontFamily: FONT_HEADING, fontWeight: 700 }}>Dropi Manager</span>
      </div>

      {open && <div className="app-overlay" onClick={() => setOpen(false)} />}

      <aside className={`app-sidebar${open ? ' open' : ''}`} style={styles.sidebar}>
        <div style={styles.logo}>
          <div style={styles.mark}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7L12 3L20 7V17L12 21L4 17V7Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M4 7L12 11L20 7" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M12 11V21" stroke="white" strokeWidth="1.8" />
            </svg>
          </div>
          <div>
            <div style={styles.logoText}>Dropi Manager</div>
            <div style={styles.logoSub}>Panel de cierres</div>
          </div>
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
              <Icon d={ICONS[icon]} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        {user && (
          <div style={styles.userBox}>
            <div style={styles.avatar}>{initials(user.name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.userName}>{user.name}</div>
              <button style={styles.logoutBtn} onClick={handleLogout}>Cerrar sesión</button>
            </div>
          </div>
        )}
      </aside>
      <main className="app-main" style={styles.main}>{children}</main>
    </div>
  );
}
