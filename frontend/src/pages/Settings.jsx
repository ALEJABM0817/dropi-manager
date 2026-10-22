import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { COLOR, FONT_HEADING, RADIUS, SHADOW_CARD } from '../theme';

const s = {
  title: { fontFamily: FONT_HEADING, fontSize: 24, fontWeight: 700, color: COLOR.ink, letterSpacing: '-0.4px', marginBottom: 4 },
  sub: { fontSize: 13.5, color: COLOR.textMuted, marginBottom: 24 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 },
  card: { background: '#fff', borderRadius: RADIUS.card, padding: '20px 24px', boxShadow: SHADOW_CARD, border: `1px solid ${COLOR.border}` },
  cardTitle: { fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 700, color: COLOR.inkSoft, marginBottom: 14 },
  addRow: { display: 'flex', gap: 8, marginBottom: 14 },
  input: { flex: 1, padding: '8px 10px', border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.control, fontSize: 14 },
  select: { padding: '8px 10px', border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.control, fontSize: 13, background: '#fff' },
  addBtn: { padding: '8px 14px', background: COLOR.accentGradient, color: '#fff', border: 'none', borderRadius: RADIUS.control, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  list: { listStyle: 'none' },
  listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${COLOR.borderSoft}` },
  itemName: { fontSize: 14, color: COLOR.text },
  badge: (color) => ({ fontSize: 11, padding: '2px 7px', borderRadius: RADIUS.pill, background: color, color: '#fff', marginLeft: 6, textTransform: 'uppercase' }),
  delBtn: { background: 'none', border: 'none', color: COLOR.danger, cursor: 'pointer', fontSize: 16, padding: '0 4px' },
  empty: { fontSize: 13, color: COLOR.textMuted, textAlign: 'center', padding: 16 },
};

const PLATFORM_COLORS = { meta: '#1877f2', tiktok: '#ff0050', google: '#ea4335', otro: '#64748b' };

function Section({ title, children }) {
  return (
    <div style={s.card}>
      <div style={s.cardTitle}>{title}</div>
      {children}
    </div>
  );
}

function StoreList() {
  const [stores, setStores] = useState([]);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');

  const load = () => api.get('/stores').then(r => setStores(r.data));
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    try { await api.post('/stores', { name }); setName(''); setErr(''); load(); }
    catch { setErr('Ya existe una tienda con ese nombre'); }
  }

  async function saveEdit(id) {
    if (!editName.trim()) return;
    await api.patch(`/stores/${id}`, { name: editName.trim() });
    setEditId(null);
    load();
  }

  return (
    <Section title="🏪 Tiendas">
      <div style={s.addRow}>
        <input style={s.input} value={name} onChange={e => setName(e.target.value)}
          placeholder="Nombre de tienda" onKeyDown={e => e.key === 'Enter' && add()} />
        <button style={s.addBtn} onClick={add}>+</button>
      </div>
      {err && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <ul style={s.list}>
        {stores.length === 0 && <li style={s.empty}>Sin tiendas aún</li>}
        {stores.map(st => (
          <li key={st.id} style={s.listItem}>
            {editId === st.id ? (
              <input
                style={{ ...s.input, marginBottom: 0, flex: 1 }}
                value={editName}
                autoFocus
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(st.id); if (e.key === 'Escape') setEditId(null); }}
              />
            ) : (
              <span style={s.itemName}>{st.name}</span>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              {editId === st.id ? (
                <>
                  <button style={{ ...s.addBtn, padding: '4px 10px', fontSize: 13 }} onClick={() => saveEdit(st.id)}>✓</button>
                  <button style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 13, color: '#64748b' }} onClick={() => setEditId(null)}>✕</button>
                </>
              ) : (
                <>
                  <button
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 15, padding: '0 4px' }}
                    title="Renombrar"
                    onClick={() => { setEditId(st.id); setEditName(st.name); }}
                  >✏️</button>
                  <button style={s.delBtn} onClick={async () => { await api.delete(`/stores/${st.id}`); load(); }}>✕</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function AdAccountList() {
  const [accounts, setAccounts] = useState([]);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('meta');

  const load = () => api.get('/ad-accounts').then(r => setAccounts(r.data));
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    await api.post('/ad-accounts', { name, platform });
    setName(''); load();
  }

  return (
    <Section title="📣 Cuentas Publicitarias">
      <div style={s.addRow}>
        <input style={s.input} value={name} onChange={e => setName(e.target.value)}
          placeholder="Ej: Publicidad cp1" onKeyDown={e => e.key === 'Enter' && add()} />
        <select style={s.select} value={platform} onChange={e => setPlatform(e.target.value)}>
          <option value="meta">Meta</option>
          <option value="tiktok">TikTok</option>
          <option value="google">Google</option>
          <option value="otro">Otro</option>
        </select>
        <button style={s.addBtn} onClick={add}>+</button>
      </div>
      <ul style={s.list}>
        {accounts.length === 0 && <li style={s.empty}>Sin cuentas aún</li>}
        {accounts.map(a => (
          <li key={a.id} style={s.listItem}>
            <span style={s.itemName}>
              {a.name}
              <span style={s.badge(PLATFORM_COLORS[a.platform] || '#64748b')}>{a.platform}</span>
            </span>
            <button style={s.delBtn} onClick={async () => { await api.delete(`/ad-accounts/${a.id}`); load(); }}>✕</button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ExpenseCategoryList() {
  const [cats, setCats] = useState([]);
  const [name, setName] = useState('');

  const load = () => api.get('/expenses/categories').then(r => setCats(r.data));
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    try { await api.post('/expenses/categories', { name }); setName(''); load(); }
    catch {}
  }

  return (
    <Section title="💸 Categorías de Gastos">
      <div style={s.addRow}>
        <input style={s.input} value={name} onChange={e => setName(e.target.value)}
          placeholder="Ej: Claude, Shopify..." onKeyDown={e => e.key === 'Enter' && add()} />
        <button style={s.addBtn} onClick={add}>+</button>
      </div>
      <ul style={s.list}>
        {cats.length === 0 && <li style={s.empty}>Sin categorías aún</li>}
        {cats.map(c => (
          <li key={c.id} style={s.listItem}>
            <span style={s.itemName}>{c.name}</span>
            <button style={s.delBtn} onClick={async () => { await api.delete(`/expenses/categories/${c.id}`); load(); }}>✕</button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function IncomeCategoryList() {
  const [cats, setCats] = useState([]);
  const [name, setName] = useState('');

  const load = () => api.get('/income/categories').then(r => setCats(r.data));
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    try { await api.post('/income/categories', { name }); setName(''); load(); }
    catch {}
  }

  return (
    <Section title="💰 Categorías de Ingresos">
      <div style={s.addRow}>
        <input style={s.input} value={name} onChange={e => setName(e.target.value)}
          placeholder="Ej: Proveedor Bogotá..." onKeyDown={e => e.key === 'Enter' && add()} />
        <button style={s.addBtn} onClick={add}>+</button>
      </div>
      <ul style={s.list}>
        {cats.length === 0 && <li style={s.empty}>Sin categorías aún</li>}
        {cats.map(c => (
          <li key={c.id} style={s.listItem}>
            <span style={s.itemName}>{c.name}</span>
            <button style={s.delBtn} onClick={async () => { await api.delete(`/income/categories/${c.id}`); load(); }}>✕</button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function Settings() {
  return (
    <div>
      <div style={s.title}>Configuración</div>
      <div style={s.sub}>Gestiona tus tiendas, cuentas publicitarias y categorías de gastos e ingresos</div>
      <div style={s.grid}>
        <StoreList />
        <AdAccountList />
        <ExpenseCategoryList />
        <IncomeCategoryList />
      </div>
    </div>
  );
}
