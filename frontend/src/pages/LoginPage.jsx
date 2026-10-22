import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { COLOR, FONT_HEADING, RADIUS, btnPrimary } from '../theme';

const s = {
  wrap: {
    width: '100%', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(185deg, #171A2E 0%, #121426 100%)', padding: 16, boxSizing: 'border-box',
  },
  card: {
    background: '#fff', borderRadius: 18, padding: '38px 36px', width: '100%', maxWidth: 372,
    boxShadow: '0 24px 70px rgba(10,10,30,.45)', boxSizing: 'border-box',
  },
  mark: {
    width: 42, height: 42, borderRadius: 12, marginBottom: 16,
    background: 'linear-gradient(135deg, #818CF8, #6366F1 55%, #4F46E5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 8px 20px -6px rgba(99,102,241,.6)',
  },
  logo: { fontFamily: FONT_HEADING, fontSize: 20, fontWeight: 700, color: COLOR.ink, marginBottom: 2, letterSpacing: '-0.3px' },
  sub: { fontSize: 13, color: COLOR.textMuted, marginBottom: 26 },
  label: { fontSize: 12, fontWeight: 600, color: COLOR.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display: 'block' },
  input: {
    width: '100%', padding: '10px 12px', border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.control,
    fontSize: 14, marginBottom: 16, boxSizing: 'border-box',
  },
  btn: { ...btnPrimary, width: '100%', justifyContent: 'center', padding: '12px' },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  error: { background: COLOR.dangerBg, color: COLOR.danger, padding: '10px 14px', borderRadius: RADIUS.control, fontSize: 13, marginBottom: 16 },
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify({ name: res.data.name, email: res.data.email }));
      navigate('/');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Error al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.wrap}>
      <form style={s.card} onSubmit={handleSubmit}>
        <div style={s.mark}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7L12 3L20 7V17L12 21L4 17V7Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M4 7L12 11L20 7" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M12 11V21" stroke="white" strokeWidth="1.8" />
          </svg>
        </div>
        <div style={s.logo}>Dropi Manager</div>
        <div style={s.sub}>Panel de Cierres — inicia sesión para continuar</div>
        {error && <div style={s.error}>{error}</div>}
        <label style={s.label}>Correo</label>
        <input
          style={s.input} type="email" value={email} autoFocus
          onChange={e => setEmail(e.target.value)} required
        />
        <label style={s.label}>Contraseña</label>
        <input
          style={s.input} type="password" value={password}
          onChange={e => setPassword(e.target.value)} required
        />
        <button style={{ ...s.btn, ...(loading ? s.btnDisabled : {}) }} disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
