import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { COLOR, RADIUS, SHADOW_CARD, btnPrimary } from '../theme';

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

// Default to last month's closing (the one usually being reviewed), not the current one.
function previousMonth() {
  const now = new Date();
  let month = now.getMonth(); // getMonth() is 0-indexed, so this is already "last month" 1-indexed...
  let year = now.getFullYear();
  if (month === 0) { month = 12; year -= 1; } // ...except in January, where it must roll back to December
  return { month, year };
}

const s = {
  bar: { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 24,
         background: '#fff', padding: '16px 20px', borderRadius: RADIUS.card, boxShadow: SHADOW_CARD, border: `1px solid ${COLOR.border}` },
  group: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: COLOR.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' },
  select: { padding: '8px 12px', border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.control, fontSize: 14,
             background: '#fff', color: COLOR.ink, cursor: 'pointer', minWidth: 160 },
  btn: btnPrimary,
};

export default function PeriodSelector({ value, onChange }) {
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(value?.store_id || '');
  const [year, setYear] = useState(value?.year || previousMonth().year);
  const [month, setMonth] = useState(value?.month || previousMonth().month);

  useEffect(() => {
    api.get('/stores').then(r => {
      setStores(r.data);
      if (!storeId && r.data.length) setStoreId(r.data[0].id);
    });
  }, []);

  async function handleApply() {
    if (!storeId) return;
    const res = await api.post('/periods', { year, month, store_id: storeId });
    const store = stores.find(s => s.id == storeId);
    onChange({ period_id: res.data.id, store_id: storeId, year, month, store_name: store?.name });
  }

  const years = [];
  for (let y = 2023; y <= new Date().getFullYear() + 1; y++) years.push(y);

  return (
    <div style={s.bar}>
      <div style={s.group}>
        <label style={s.label}>Tienda</label>
        <select style={s.select} value={storeId} onChange={e => setStoreId(e.target.value)}>
          {stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
      </div>
      <div style={s.group}>
        <label style={s.label}>Mes</label>
        <select style={s.select} value={month} onChange={e => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
      </div>
      <div style={s.group}>
        <label style={s.label}>Año</label>
        <select style={s.select} value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <button style={s.btn} onClick={handleApply}>Aplicar</button>
      {value?.period_id && (
        <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 600, alignSelf: 'center' }}>
          ✓ {value.store_name} · {MONTHS[value.month - 1]} {value.year}
        </div>
      )}
    </div>
  );
}
