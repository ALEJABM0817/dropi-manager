import React, { useEffect, useState } from 'react';
import api from '../api/client';

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const DIMENSIONS = [
  { key: 'producto', label: '🏷️ Productos' },
  { key: 'departamento', label: '🗺️ Departamentos' },
  { key: 'transportadora', label: '📦 Transportadoras' },
];

const MIN_VOLUME = 5; // ignore items with too few orders in a month — too noisy to call a real trend

const s = {
  title: { fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 4 },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 20 },
  selectorBar: {
    display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20,
    background: '#fff', padding: '16px 20px', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,.06)',
  },
  select: {
    padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 14,
    background: '#fff', color: '#1e293b', cursor: 'pointer', minWidth: 160,
  },
  label: { fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  btn: {
    padding: '8px 16px', background: '#8b5cf6', color: '#fff', border: 'none',
    borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  tabBtn: (active) => ({
    padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: active ? '#8b5cf6' : '#f1f5f9', color: active ? '#fff' : '#64748b',
  }),
  table: {
    background: '#fff', borderRadius: 10, padding: '22px 26px',
    boxShadow: '0 1px 4px rgba(0,0,0,.06)', marginBottom: 16,
  },
  tableTitle: { fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 4 },
  noData: { textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 },
};

function fmtCompact(n) {
  const v = n || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function Highlights({ series }) {
  const changes = [];
  for (const item of series) {
    const withData = item.by_period.filter(bp => bp.total >= MIN_VOLUME && bp.ganancia != null);
    if (withData.length < 2) continue;
    const first = withData[0];
    const last = withData[withData.length - 1];
    if (first.period_id === last.period_id) continue;
    const delta = last.ganancia - first.ganancia;
    changes.push({ label: item.label, first, last, delta });
  }
  const caidas = [...changes].filter(c => c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);
  const subidas = [...changes].filter(c => c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);

  if (caidas.length === 0 && subidas.length === 0) return null;

  return (
    <div className="grid-2" style={{ marginBottom: 20 }}>
      {caidas.length > 0 && (
        <div style={{ background: '#fef2f2', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>📉 Perdieron ganancia</div>
          {caidas.map((c, i) => (
            <div key={i} style={{ padding: '5px 0', fontSize: 13, borderBottom: i < caidas.length - 1 ? '1px solid #fee2e2' : 'none' }}>
              <div style={{ color: '#374151', fontWeight: 600 }}>{c.label}</div>
              <div style={{ color: '#dc2626', fontSize: 12 }}>
                Ganancia: {fmt(c.first.ganancia)} ({MONTHS[c.first.month - 1].slice(0, 3)}) → {fmt(c.last.ganancia)} ({MONTHS[c.last.month - 1].slice(0, 3)})
              </div>
            </div>
          ))}
        </div>
      )}
      {subidas.length > 0 && (
        <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', marginBottom: 8 }}>📈 Ganaron más</div>
          {subidas.map((c, i) => (
            <div key={i} style={{ padding: '5px 0', fontSize: 13, borderBottom: i < subidas.length - 1 ? '1px solid #dcfce7' : 'none' }}>
              <div style={{ color: '#374151', fontWeight: 600 }}>{c.label}</div>
              <div style={{ color: '#16a34a', fontSize: 12 }}>
                Ganancia: {fmt(c.first.ganancia)} ({MONTHS[c.first.month - 1].slice(0, 3)}) → {fmt(c.last.ganancia)} ({MONTHS[c.last.month - 1].slice(0, 3)})
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TotalsTable({ series, periods }) {
  const totalsByPeriod = periods.map(p => {
    let ganancia = 0, pedidos = 0;
    for (const item of series) {
      const bp = item.by_period.find(x => x.period_id === p.id);
      if (bp) { ganancia += bp.ganancia || 0; pedidos += bp.total || 0; }
    }
    return { period_id: p.id, year: p.year, month: p.month, ganancia, pedidos };
  });
  const granTotal = totalsByPeriod.reduce((s, t) => s + t.ganancia, 0);

  return (
    <div style={s.table}>
      <div style={s.tableTitle}>Total {series.length === 1 ? '(1 valor)' : `(suma de los ${series.length} valores)`}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}></th>
              {periods.map(p => (
                <th key={p.id} style={{ textAlign: 'center', padding: '6px 6px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', minWidth: 70 }}>
                  {MONTHS[p.month - 1].slice(0, 3)}
                </th>
              ))}
              <th style={{ textAlign: 'center', padding: '6px 6px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', minWidth: 90 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Ganancia</td>
              {totalsByPeriod.map(t => (
                <td key={t.period_id} style={{ textAlign: 'center', padding: '8px 6px', fontSize: 13, fontWeight: 700, color: t.ganancia >= 0 ? '#16a34a' : '#dc2626' }}>
                  {fmtCompact(t.ganancia)}
                </td>
              ))}
              <td style={{ textAlign: 'center', padding: '8px 6px', fontSize: 14, fontWeight: 800, color: granTotal >= 0 ? '#16a34a' : '#dc2626', borderLeft: '2px solid #e2e8f0' }}>
                {fmt(granTotal)}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '6px 10px', fontSize: 12, color: '#64748b' }}>Pedidos</td>
              {totalsByPeriod.map(t => (
                <td key={t.period_id} style={{ textAlign: 'center', padding: '6px 6px', fontSize: 12, color: '#64748b' }}>{t.pedidos}</td>
              ))}
              <td style={{ textAlign: 'center', padding: '6px 6px', fontSize: 12, color: '#64748b', fontWeight: 700, borderLeft: '2px solid #e2e8f0' }}>
                {totalsByPeriod.reduce((s, t) => s + t.pedidos, 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrendChart({ series, periods }) {
  const top = series;
  const barH = 70;
  const maxAbs = Math.max(1, ...top.flatMap(item => item.by_period.map(bp => Math.abs(bp.ganancia || 0))));
  return (
    <div style={s.table}>
      <div style={s.tableTitle}>Ganancia mes a mes ({top.length} {top.length === 1 ? 'valor' : 'valores'}, de mayor a menor ganancia)</div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
        Cada fila es un valor, cada barra un mes. Verde = ganancia positiva, rojo = pérdida. El número debajo es la cantidad de pedidos ese mes.
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 640, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}></th>
              {periods.map(p => (
                <th key={p.id} style={{ textAlign: 'center', padding: '6px 6px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', minWidth: 60 }}>
                  {MONTHS[p.month - 1].slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top.map((item, i) => (
              <tr key={item.key} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600, color: '#1e293b', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </td>
                {item.by_period.map(bp => {
                  const g = bp.ganancia || 0;
                  const h = Math.max(3, (Math.abs(g) / maxAbs) * (barH - 20));
                  return (
                    <td key={bp.period_id} style={{ textAlign: 'center', padding: '6px 4px', verticalAlign: 'bottom' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: barH }}>
                        {bp.total > 0 ? (
                          <>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{fmtCompact(g)}</div>
                            <div style={{
                              width: 22, height: h,
                              background: g >= 0 ? '#22c55e' : '#ef4444', borderRadius: '3px 3px 0 0',
                            }} />
                            <div style={{ fontSize: 9, color: '#cbd5e1', marginTop: 2 }}>{bp.total}</div>
                          </>
                        ) : (
                          <div style={{ width: 22, height: 3, background: '#e2e8f0', borderRadius: 2 }} />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TrendsPage() {
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState('');
  const [periods, setPeriods] = useState([]);
  const [selectedPeriods, setSelectedPeriods] = useState(new Set());
  const [dimension, setDimension] = useState('producto');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/stores').then(r => {
      setStores(r.data);
      if (r.data.length) setStoreId(r.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!storeId) return;
    api.get('/periods/by-store', { params: { store_id: storeId } }).then(r => {
      const sorted = [...r.data].sort((a, b) => a.year - b.year || a.month - b.month);
      setPeriods(sorted);
      setSelectedPeriods(new Set(sorted.map(p => p.id))); // default: all available months
      setData(null);
    });
  }, [storeId]);

  function togglePeriod(id) {
    setSelectedPeriods(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function generar() {
    if (selectedPeriods.size < 2) return;
    setLoading(true);
    try {
      const res = await api.get('/trends', {
        params: { store_id: storeId, period_ids: [...selectedPeriods].join(','), dimension }
      });
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (selectedPeriods.size >= 2) generar(); /* eslint-disable-next-line */ }, [dimension]);

  return (
    <div>
      <div style={s.title}>Tendencias</div>
      <div style={s.sub}>
        Compara la ganancia real de productos, departamentos y transportadoras mes a mes para detectar qué iba bien
        y dónde empezó a caer (ej. "Anillo Corazón iba bien en enero pero cayó en marzo").
      </div>

      <div style={s.selectorBar}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={s.label}>Tienda</label>
          <select style={s.select} value={storeId} onChange={e => setStoreId(Number(e.target.value))}>
            {stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </div>

        {periods.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <label style={s.label}>Intervalo de meses</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {periods.map(p => {
                const sel = selectedPeriods.has(p.id);
                return (
                  <button key={p.id} onClick={() => togglePeriod(p.id)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: sel ? '2px solid #8b5cf6' : '1.5px solid #e2e8f0',
                      background: sel ? '#f5f3ff' : '#fff',
                      color: sel ? '#7c3aed' : '#64748b',
                    }}>
                    {MONTHS[p.month - 1].slice(0, 3)} {p.year}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button style={{ ...s.btn, opacity: selectedPeriods.size < 2 ? 0.5 : 1 }}
          disabled={selectedPeriods.size < 2 || loading} onClick={generar}>
          {loading ? 'Cargando...' : 'Generar'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {DIMENSIONS.map(d => (
          <button key={d.key} style={s.tabBtn(dimension === d.key)} onClick={() => setDimension(d.key)}>{d.label}</button>
        ))}
      </div>

      {selectedPeriods.size < 2 && <div style={s.noData}>Selecciona al menos 2 meses para comparar</div>}

      {data && selectedPeriods.size >= 2 && data.series.length === 0 && (
        <div style={s.noData}>No hay datos para este intervalo</div>
      )}

      {data && selectedPeriods.size >= 2 && data.series.length > 0 && (
        <>
          <Highlights series={data.series} />
          <TrendChart series={data.series} periods={data.periods} />
          <TotalsTable series={data.series} periods={data.periods} />
        </>
      )}
    </div>
  );
}
