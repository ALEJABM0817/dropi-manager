import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

const s = {
  wrap: {
    width: '100%', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#1e293b', padding: 16, boxSizing: 'border-box',
  },
  card: {
    background: '#fff', borderRadius: 14, padding: '36px 36px', width: '100%', maxWidth: 360,
    boxShadow: '0 20px 60px rgba(0,0,0,.35)', boxSizing: 'border-box',
  },
  logo: { fontSize: 20, fontWeight: 800, color: '#1e293b', marginBottom: 2 },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 24 },
  label: { fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display: 'block' },
  input: {
    width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8,
    fontSize: 14, marginBottom: 16, boxSizing: 'border-box',
  },
  btn: {
    width: '100%', padding: '11px', background: '#3b82f6', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  error: { background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 },
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
