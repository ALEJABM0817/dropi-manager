import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from 'recharts';
import api from '../api/client';
import PeriodSelector from '../components/PeriodSelector';
import { COLOR, FONT_HEADING, RADIUS, SHADOW_CARD } from '../theme';

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) : '0.0');

// Mini horizontal bar component
function MiniBar({ value, max, color }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 80, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 12, color, fontWeight: 600, minWidth: 36 }}>{value}</span>
    </div>
  );
}

function fmtCompact(n) {
  const v = n || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function truncateName(name, max = 22) {
  return name && name.length > max ? name.slice(0, max - 1) + '…' : name;
}

function GeoBarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const isLoss = r.resultado_neto < 0;
  return (
    <div style={{ background: '#fff', border: `1px solid ${COLOR.border}`, borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(20,20,43,.12)', padding: '10px 14px', fontSize: 12.5 }}>
      <div style={{ fontWeight: 700, color: COLOR.inkSoft, marginBottom: 4 }}>{r.departamento}</div>
      <div style={{ color: isLoss ? COLOR.danger : COLOR.success, fontWeight: 700 }}>{fmt(r.resultado_neto)}</div>
    </div>
  );
}

// Horizontal profit bar chart, sorted best-to-worst
function ProfitBarChart({ rows }) {
  const data = rows.map(r => ({ ...r, label: truncateName(r.departamento) }));
  const chartHeight = Math.max(220, data.length * 28);
  return (
    <div style={{ background: '#fff', borderRadius: RADIUS.card, padding: '20px 22px', boxShadow: SHADOW_CARD, border: `1px solid ${COLOR.border}`, marginBottom: 20 }}>
      <div style={{ fontFamily: FONT_HEADING, fontSize: 14.5, fontWeight: 700, color: COLOR.inkSoft, marginBottom: 14 }}>
        Resultado neto por departamento (ingreso después de devoluciones − gasto en pauta)
      </div>
      <div style={{ width: '100%', height: chartHeight }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 55, left: 4, bottom: 4 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke={COLOR.borderSoft} />
            <XAxis type="number" tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: COLOR.textMuted }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11.5, fill: COLOR.text }} axisLine={false} tickLine={false} />
            <Tooltip content={<GeoBarTooltip />} cursor={{ fill: COLOR.borderSoft }} />
            <Bar dataKey="resultado_neto" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {data.map((r, i) => (
                <Cell key={i} fill={r.resultado_neto < 0 ? COLOR.danger : COLOR.success} />
              ))}
              <LabelList dataKey="resultado_neto" position="right" formatter={fmtCompact}
                         style={{ fontSize: 11, fontWeight: 700, fill: COLOR.inkSoft }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Donut-style pct badge
function PctBadge({ value, color }) {
  const n = parseFloat(value);
  const bg = n >= 70 ? '#f0fdf4' : n >= 50 ? '#fffbeb' : '#fef2f2';
  const c  = n >= 70 ? '#16a34a' : n >= 50 ? '#d97706' : '#dc2626';
  return (
    <span style={{ padding: '3px 9px', borderRadius: 12, background: bg, color: c, fontWeight: 700, fontSize: 13 }}>
      {value}%
    </span>
  );
}

const s = {
  title:   { fontFamily: FONT_HEADING, fontSize: 24, fontWeight: 700, color: COLOR.ink, letterSpacing: '-0.4px', marginBottom: 4 },
  sub:     { fontSize: 13.5, color: COLOR.textMuted, marginBottom: 22 },
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' },
  searchBox: {
    padding: '8px 12px', border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.control,
    fontSize: 14, flex: 1, minWidth: 200, maxWidth: 320, color: COLOR.ink,
  },
  sortBtn: (active) => ({
    padding: '6px 12px', border: `1.5px solid ${active ? COLOR.accent : COLOR.border}`,
    borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: active ? COLOR.accentBg : '#fff', color: active ? COLOR.accent : COLOR.textMuted,
  }),
  table:   {
    width: '100%', minWidth: 700, borderCollapse: 'collapse',
    background: '#fff', borderRadius: RADIUS.card, overflow: 'hidden',
    border: `1px solid ${COLOR.border}`, boxShadow: SHADOW_CARD, marginBottom: 24,
  },
  th: (clickable) => ({
    padding: '12px 16px', background: '#FAFAFD', textAlign: 'left',
    fontWeight: 700, color: COLOR.textFaint, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '0.4px',
    borderBottom: `1px solid ${COLOR.border}`,
    cursor: clickable ? 'pointer' : 'default',
    userSelect: 'none', whiteSpace: 'nowrap',
  }),
  td:      { padding: '12px 16px', borderBottom: `1px solid ${COLOR.borderSoft}`, fontSize: 13.5, color: COLOR.inkSoft },
  expandRow: { background: '#FAFAFD' },
  expandCell: { padding: '0 14px 14px 40px', borderBottom: `1px solid ${COLOR.border}` },
  subTable: { width: '100%', minWidth: 500, borderCollapse: 'collapse', fontSize: 13 },
  subTh:   { padding: '8px 10px', fontWeight: 600, color: COLOR.textFaint, fontSize: 11, textTransform: 'uppercase', textAlign: 'left', borderBottom: `1px solid ${COLOR.border}`, background: '#F1F2F7' },
  subTd:   { padding: '8px 10px', borderBottom: `1px solid ${COLOR.borderSoft}`, color: COLOR.text },
  noData:  { textAlign: 'center', padding: 48, color: COLOR.textMuted, fontSize: 14 },
  summaryGrid: { marginBottom: 20 },
  summaryCard: (color, bg) => ({
    background: bg, borderRadius: RADIUS.card, padding: '18px 22px',
    boxShadow: SHADOW_CARD, border: `1px solid ${COLOR.border}`, borderTop: `3px solid ${color}`,
  }),
  summaryVal: (color) => ({ fontSize: 24, fontWeight: 800, color, letterSpacing: '-0.4px' }),
  summaryLabel: { fontSize: 12, color: COLOR.textMuted, marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' },
};

const SORT_OPTIONS = [
  { key: 'total',     label: 'Total pedidos' },
  { key: 'entregados', label: 'Entregados' },
  { key: 'pct_entrega', label: '% Entrega' },
  { key: 'devoluciones', label: 'Devoluciones' },
  { key: 'pct_dev',  label: '% Devolución' },
  { key: 'ganancia_total', label: 'Ganancia' },
];

export default function GeoPage() {
  const [period, setPeriod]   = useState(null);
  const [data, setData]       = useState(null);
  const [search, setSearch]   = useState('');
  const [sortKey, setSortKey] = useState('total');
  const [sortDir, setSortDir] = useState('desc');
  const [expanded, setExpanded] = useState(null); // dept name
  const [tab, setTab]         = useState('dept');  // 'dept' | 'city' | 'carrier'
  const [carrierExpanded, setCarrierExpanded]   = useState(null);  // carrier name
  const [deptExpanded, setDeptExpanded]         = useState(null);  // "carrier||dept"
  const [profitData, setProfitData] = useState(null);

  const load = useCallback(async (p) => {
    if (!p?.period_id) return;
    const res = await api.get('/orders/geo-breakdown', {
      params: { period_id: p.period_id, store_id: p.store_id },
    });
    setData(res.data);
    const profitRes = await api.get('/geo-profitability', {
      params: { period_id: p.period_id, store_id: p.store_id },
    });
    setProfitData(profitRes.data);
  }, []);

  useEffect(() => { if (period) load(period); }, [period]);

  // Build dept rows with computed pct
  const deptRows = useMemo(() => {
    if (!data) return [];
    return data.byDept.map(d => ({
      ...d,
      pct_entrega: parseFloat(pct(d.entregados, d.total)),
      pct_dev:     parseFloat(pct(d.devoluciones, d.total)),
    }));
  }, [data]);

  const maxTotal = useMemo(() => Math.max(...deptRows.map(d => d.total), 1), [deptRows]);

  const filtered = useMemo(() => {
    let rows = deptRows.filter(d =>
      !search || (d.departamento_destino || '').toLowerCase().includes(search.toLowerCase())
    );
    rows = [...rows].sort((a, b) => {
      const va = a[sortKey] ?? 0, vb = b[sortKey] ?? 0;
      return sortDir === 'desc' ? vb - va : va - vb;
    });
    return rows;
  }, [deptRows, search, sortKey, sortDir]);

  // Build carrier → dept → city hierarchy from flat carrierGeo data
  const carrierGeoMap = useMemo(() => {
    if (!data?.carrierGeo) return {};
    const map = {};
    for (const row of data.carrierGeo) {
      const c  = row.transportadora  || '—';
      const dp = row.departamento_destino || '—';
      const ct = row.ciudad_destino   || '—';
      const st = row.estatus          || '';
      if (!map[c])       map[c]      = {};
      if (!map[c][dp])   map[c][dp]  = {};
      if (!map[c][dp][ct]) map[c][dp][ct] = { total:0, entregados:0, devoluciones:0, en_proceso:0, otros:0, ganancia:0, costo_dev:0 };
      const node = map[c][dp][ct];
      node.total      += row.count;
      node.ganancia   += row.ganancia_total || 0;
      node.costo_dev  += row.costo_dev      || 0;
      if (st === 'ENTREGADO')  node.entregados   += row.count;
      else if (st === 'DEVOLUCION') node.devoluciones += row.count;
      else if (['RECLAME EN OFICINA','EN BODEGA DESTINO','BODEGA DESTINO','EN BODEGA ORIGEN','EN TERMINAL DESTINO'].includes(st)) node.en_proceso += row.count;
      else node.otros += row.count;
    }
    return map;
  }, [data]);

  // Summarise dept totals within a carrier
  function deptTotals(carrierName, deptName) {
    const cities = carrierGeoMap[carrierName]?.[deptName] || {};
    return Object.values(cities).reduce((acc, c) => ({
      total:       acc.total      + c.total,
      entregados:  acc.entregados + c.entregados,
      devoluciones:acc.devoluciones + c.devoluciones,
      en_proceso:  acc.en_proceso + c.en_proceso,
      otros:       acc.otros      + c.otros,
      ganancia:    acc.ganancia   + c.ganancia,
      costo_dev:   acc.costo_dev  + c.costo_dev,
    }), { total:0, entregados:0, devoluciones:0, en_proceso:0, otros:0, ganancia:0, costo_dev:0 });
  }

  // Carrier rows
  const carrierRows = useMemo(() => {
    if (!data?.byCarrier) return [];
    return data.byCarrier.map(c => ({
      ...c,
      pct_entrega: parseFloat(pct(c.entregados, c.total)),
      pct_dev:     parseFloat(pct(c.devoluciones, c.total)),
      pct_en_proc: parseFloat(pct(c.en_proceso, c.total)),
    })).sort((a, b) => {
      const va = a[sortKey] ?? 0, vb = b[sortKey] ?? 0;
      return sortDir === 'desc' ? vb - va : va - vb;
    });
  }, [data, sortKey, sortDir]);

  // City rows
  const cityRows = useMemo(() => {
    if (!data) return [];
    return data.byCity
      .filter(c => !search || (c.ciudad_destino || '').toLowerCase().includes(search.toLowerCase())
                            || (c.departamento_destino || '').toLowerCase().includes(search.toLowerCase()))
      .map(c => ({
        ...c,
        pct_entrega: parseFloat(pct(c.entregados, c.total)),
        pct_dev:     parseFloat(pct(c.devoluciones, c.total)),
      }))
      .sort((a, b) => b.total - a.total);
  }, [data, search]);

  // Cities for expanded dept
  const citiesForDept = useCallback((deptName) => {
    if (!data) return [];
    return data.byCity
      .filter(c => c.departamento_destino === deptName)
      .map(c => ({ ...c, pct_entrega: parseFloat(pct(c.entregados, c.total)), pct_dev: parseFloat(pct(c.devoluciones, c.total)) }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  // Summary totals
  const totals = useMemo(() => {
    if (!deptRows.length) return null;
    const total      = deptRows.reduce((s, d) => s + d.total, 0);
    const entregados = deptRows.reduce((s, d) => s + d.entregados, 0);
    const devols     = deptRows.reduce((s, d) => s + d.devoluciones, 0);
    const ganancia   = deptRows.reduce((s, d) => s + d.ganancia_total, 0);
    return { total, entregados, devols, ganancia,
             pct_e: pct(entregados, total), pct_d: pct(devols, total) };
  }, [deptRows]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function sortIcon(key) {
    if (sortKey !== key) return ' ↕';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  }

  return (
    <div>
      <div style={s.title}>Geografía de Pedidos</div>
      <div style={s.sub}>
        % de entregas y devoluciones por departamento y ciudad
      </div>

      <PeriodSelector value={period} onChange={setPeriod} />

      {!period && <div style={s.noData}>Selecciona una tienda y período para ver la geografía</div>}

      {period && data && deptRows.length === 0 && (
        <div style={s.noData}>No hay órdenes importadas para este período.</div>
      )}

      {period && data && deptRows.length > 0 && (
        <>
          {/* Summary cards */}
          {totals && (
            <div className="grid-4" style={s.summaryGrid}>
              <div style={s.summaryCard('#3b82f6', '#eff6ff')}>
                <div style={s.summaryVal('#3b82f6')}>{deptRows.length}</div>
                <div style={s.summaryLabel}>Departamentos</div>
              </div>
              <div style={s.summaryCard('#22c55e', '#f0fdf4')}>
                <div style={s.summaryVal('#22c55e')}>{totals.pct_e}%</div>
                <div style={s.summaryLabel}>% Entrega promedio</div>
              </div>
              <div style={s.summaryCard('#ef4444', '#fef2f2')}>
                <div style={s.summaryVal('#ef4444')}>{totals.pct_d}%</div>
                <div style={s.summaryLabel}>% Devolución promedio</div>
              </div>
              <div style={s.summaryCard('#22c55e', '#f0fdf4')}>
                <div style={s.summaryVal('#22c55e')} style={{ fontSize: 18, fontWeight: 800, color: '#22c55e' }}>
                  {fmt(totals.ganancia)}
                </div>
                <div style={s.summaryLabel}>Ganancia total entregado</div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {[['dept', '🗺️ Por Departamento'], ['city', '🏙️ Por Ciudad'], ['carrier', '🚚 Por Transportadora'], ['rentabilidad', '💰 Rentabilidad']].map(([key, lbl]) => (
              <button key={key} onClick={() => { setTab(key); setExpanded(null); }}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontWeight: 600, fontSize: 14,
                  background: tab === key ? '#1e293b' : '#fff',
                  color: tab === key ? '#fff' : '#64748b',
                  boxShadow: '0 1px 3px rgba(0,0,0,.08)',
                }}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Search + sort */}
          {tab !== 'rentabilidad' && (
          <div style={s.toolbar}>
            <input
              style={s.searchBox}
              placeholder={tab === 'dept' ? 'Buscar departamento...' : 'Buscar ciudad o departamento...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Ordenar:</span>
            {SORT_OPTIONS.map(opt => (
              <button key={opt.key} style={s.sortBtn(sortKey === opt.key)}
                onClick={() => toggleSort(opt.key)}>
                {opt.label}{sortIcon(opt.key)}
              </button>
            ))}
          </div>
          )}

          {/* DEPT TABLE */}
          {tab === 'dept' && (
            <div className="table-scroll">
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th(false)} />
                  <th style={s.th(true)} onClick={() => toggleSort('departamento_destino')}>Departamento</th>
                  <th style={s.th(true)} onClick={() => toggleSort('total')}>Total{sortIcon('total')}</th>
                  <th style={s.th(false)}>% del total</th>
                  <th style={s.th(false)}>Distribución</th>
                  <th style={s.th(true)} onClick={() => toggleSort('entregados')}>Entregados{sortIcon('entregados')}</th>
                  <th style={s.th(true)} onClick={() => toggleSort('pct_entrega')}>% Entrega{sortIcon('pct_entrega')}</th>
                  <th style={s.th(true)} onClick={() => toggleSort('devoluciones')}>Devoluciones{sortIcon('devoluciones')}</th>
                  <th style={s.th(true)} onClick={() => toggleSort('pct_dev')}>% Dev{sortIcon('pct_dev')}</th>
                  <th style={s.th(false)}>En proceso</th>
                  <th style={s.th(false)}>Otros</th>
                  <th style={s.th(true)} onClick={() => toggleSort('ganancia_total')}>Ganancia{sortIcon('ganancia_total')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((dept, i) => {
                  const isOpen = expanded === dept.departamento_destino;
                  const cities = isOpen ? citiesForDept(dept.departamento_destino) : [];
                  return (
                    <React.Fragment key={dept.departamento_destino || i}>
                      <tr
                        style={{ background: isOpen ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                        onClick={() => setExpanded(isOpen ? null : dept.departamento_destino)}
                      >
                        <td style={{ ...s.td, width: 28, color: '#94a3b8', fontSize: 12, paddingRight: 0 }}>
                          {isOpen ? '▼' : '▶'}
                        </td>
                        <td style={{ ...s.td, fontWeight: 600, color: '#1e293b' }}>
                          {dept.departamento_destino || '—'}
                        </td>
                        <td style={s.td}>
                          <MiniBar value={dept.total} max={maxTotal} color="#3b82f6" />
                        </td>
                        <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6' }}>
                            {data?.total_orders > 0 ? ((dept.total / data.total_orders) * 100).toFixed(1) : '0.0'}%
                          </span>
                          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>
                            ({dept.total}/{data?.total_orders || 0})
                          </span>
                        </td>
                        <td style={s.td}>
                          {/* stacked mini bar */}
                          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', width: 100 }}>
                            <div style={{ width: `${dept.pct_entrega}%`, background: '#22c55e' }} />
                            <div style={{ width: `${dept.pct_dev}%`, background: '#ef4444' }} />
                            <div style={{ flex: 1, background: '#e2e8f0' }} />
                          </div>
                        </td>
                        <td style={{ ...s.td, color: '#22c55e', fontWeight: 600 }}>{dept.entregados}</td>
                        <td style={s.td}><PctBadge value={dept.pct_entrega.toFixed(1)} /></td>
                        <td style={{ ...s.td, color: '#ef4444', fontWeight: 600 }}>{dept.devoluciones}</td>
                        <td style={s.td}>
                          <span style={{ padding: '3px 9px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                            background: '#fef2f2', color: '#dc2626' }}>
                            {dept.pct_dev.toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ ...s.td, color: '#f59e0b', fontWeight: 600 }}>
                          {dept.en_proceso > 0 ? `⏳ ${dept.en_proceso}` : <span style={{ color: '#94a3b8' }}>—</span>}
                        </td>
                        <td style={{ ...s.td, color: '#64748b', fontWeight: 600 }}>
                          {dept.otros > 0 ? dept.otros : <span style={{ color: '#94a3b8' }}>—</span>}
                        </td>
                        <td style={{ ...s.td, fontWeight: 600, color: '#22c55e' }}>
                          {fmt(dept.ganancia_total)}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr style={s.expandRow}>
                          <td colSpan={12} style={s.expandCell}>
                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>
                              Ciudades en {dept.departamento_destino}
                            </div>
                            <div className="table-scroll">
                            <table style={s.subTable}>
                              <thead>
                                <tr>
                                  <th style={s.subTh}>Ciudad</th>
                                  <th style={s.subTh}>Total</th>
                                  <th style={s.subTh}>Entregados</th>
                                  <th style={s.subTh}>% Entrega</th>
                                  <th style={s.subTh}>Devoluciones</th>
                                  <th style={s.subTh}>% Dev</th>
                                  <th style={s.subTh}>En proceso</th>
                                  <th style={s.subTh}>Otros</th>
                                  <th style={s.subTh}>Ganancia</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cities.map((c, ci) => (
                                  <tr key={ci} style={{ background: ci % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                    <td style={{ ...s.subTd, fontWeight: 600 }}>{c.ciudad_destino || '—'}</td>
                                    <td style={s.subTd}>{c.total}</td>
                                    <td style={{ ...s.subTd, color: '#22c55e', fontWeight: 600 }}>{c.entregados}</td>
                                    <td style={s.subTd}><PctBadge value={c.pct_entrega.toFixed(1)} /></td>
                                    <td style={{ ...s.subTd, color: '#ef4444', fontWeight: 600 }}>{c.devoluciones}</td>
                                    <td style={s.subTd}>
                                      <span style={{ color: '#dc2626', fontWeight: 700 }}>{c.pct_dev.toFixed(1)}%</span>
                                    </td>
                                    <td style={{ ...s.subTd, color: '#f59e0b' }}>
                                      {c.en_proceso > 0 ? `⏳ ${c.en_proceso}` : '—'}
                                    </td>
                                    <td style={{ ...s.subTd, color: '#64748b' }}>
                                      {c.otros > 0 ? c.otros : '—'}
                                    </td>
                                    <td style={{ ...s.subTd, color: '#22c55e', fontWeight: 600 }}>
                                      {fmt(c.ganancia_total)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}

          {/* CARRIER TABLE — expandable carrier → dept → city */}
          {tab === 'carrier' && (() => {
            const maxC = Math.max(...carrierRows.map(r => r.total), 1);
            return (
              <div className="table-scroll">
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th(false)} />
                    <th style={s.th(false)}>Transportadora</th>
                    <th style={s.th(true)} onClick={() => toggleSort('total')}>Total{sortIcon('total')}</th>
                    <th style={s.th(false)}>Distribución</th>
                    <th style={s.th(true)} onClick={() => toggleSort('entregados')}>Entregados{sortIcon('entregados')}</th>
                    <th style={s.th(true)} onClick={() => toggleSort('pct_entrega')}>% Entrega{sortIcon('pct_entrega')}</th>
                    <th style={s.th(true)} onClick={() => toggleSort('devoluciones')}>Devoluciones{sortIcon('devoluciones')}</th>
                    <th style={s.th(true)} onClick={() => toggleSort('pct_dev')}>% Dev{sortIcon('pct_dev')}</th>
                    <th style={s.th(false)}>En proceso</th>
                    <th style={s.th(false)}>Otros</th>
                    <th style={s.th(true)} onClick={() => toggleSort('costo_devolucion')}>Costo dev.{sortIcon('costo_devolucion')}</th>
                    <th style={s.th(true)} onClick={() => toggleSort('ganancia_total')}>Ganancia{sortIcon('ganancia_total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {carrierRows.map((c, i) => {
                    const isCarrierOpen = carrierExpanded === c.transportadora;
                    const depts = isCarrierOpen ? Object.keys(carrierGeoMap[c.transportadora] || {}).sort() : [];
                    return (
                      <React.Fragment key={c.transportadora || i}>
                        {/* ── Carrier row ── */}
                        <tr
                          style={{ background: isCarrierOpen ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                          onClick={() => { setCarrierExpanded(isCarrierOpen ? null : c.transportadora); setDeptExpanded(null); }}
                        >
                          <td style={{ ...s.td, width: 28, color: '#94a3b8', fontSize: 12, paddingRight: 0 }}>
                            {isCarrierOpen ? '▼' : '▶'}
                          </td>
                          <td style={{ ...s.td, fontWeight: 700, color: '#1e293b' }}>🚚 {c.transportadora || '—'}</td>
                          <td style={s.td}><MiniBar value={c.total} max={maxC} color="#3b82f6" /></td>
                          <td style={s.td}>
                            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', width: 100 }}>
                              <div style={{ width: `${c.pct_entrega}%`, background: '#22c55e' }} />
                              <div style={{ width: `${c.pct_dev}%`, background: '#ef4444' }} />
                              <div style={{ width: `${c.pct_en_proc}%`, background: '#f59e0b' }} />
                              <div style={{ flex: 1, background: '#e2e8f0' }} />
                            </div>
                          </td>
                          <td style={{ ...s.td, color: '#22c55e', fontWeight: 600 }}>{c.entregados}</td>
                          <td style={s.td}><PctBadge value={c.pct_entrega.toFixed(1)} /></td>
                          <td style={{ ...s.td, color: '#ef4444', fontWeight: 600 }}>{c.devoluciones}</td>
                          <td style={s.td}>
                            <span style={{ padding: '3px 9px', borderRadius: 12, fontSize: 13, fontWeight: 700, background: '#fef2f2', color: '#dc2626' }}>
                              {c.pct_dev.toFixed(1)}%
                            </span>
                          </td>
                          <td style={{ ...s.td, color: '#f59e0b', fontWeight: 600 }}>
                            {c.en_proceso > 0 ? `⏳ ${c.en_proceso}` : <span style={{ color: '#94a3b8' }}>—</span>}
                          </td>
                          <td style={{ ...s.td, color: '#64748b', fontWeight: 600 }}>
                            {c.otros > 0 ? c.otros : <span style={{ color: '#94a3b8' }}>—</span>}
                          </td>
                          <td style={{ ...s.td, color: '#ef4444', fontWeight: 600 }}>{fmt(c.costo_devolucion)}</td>
                          <td style={{ ...s.td, color: '#22c55e', fontWeight: 600 }}>{fmt(c.ganancia_total)}</td>
                        </tr>

                        {/* ── Dept rows ── */}
                        {isCarrierOpen && depts.map(dept => {
                          const dt = deptTotals(c.transportadora, dept);
                          const deptKey = `${c.transportadora}||${dept}`;
                          const isDeptOpen = deptExpanded === deptKey;
                          const cities = isDeptOpen
                            ? Object.entries(carrierGeoMap[c.transportadora][dept] || {})
                                .sort((a, b) => b[1].total - a[1].total)
                            : [];

                          return (
                            <React.Fragment key={deptKey}>
                              {/* dept row */}
                              <tr
                                style={{ background: isDeptOpen ? '#fefce8' : '#f8fafc', cursor: 'pointer' }}
                                onClick={() => setDeptExpanded(isDeptOpen ? null : deptKey)}
                              >
                                <td style={{ ...s.td, paddingRight: 0, color: '#94a3b8', fontSize: 11 }} />
                                <td style={{ ...s.td, paddingLeft: 36, fontWeight: 600, color: '#374151' }}>
                                  {isDeptOpen ? '▼' : '▶'} {dept}
                                </td>
                                <td style={{ ...s.td, fontSize: 13 }}>{dt.total}</td>
                                <td style={s.td}>
                                  <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', width: 80 }}>
                                    <div style={{ width: `${pct(dt.entregados, dt.total)}%`, background: '#22c55e' }} />
                                    <div style={{ width: `${pct(dt.devoluciones, dt.total)}%`, background: '#ef4444' }} />
                                    <div style={{ flex: 1, background: '#e2e8f0' }} />
                                  </div>
                                </td>
                                <td style={{ ...s.td, color: '#22c55e', fontSize: 13 }}>{dt.entregados}</td>
                                <td style={s.td}><PctBadge value={pct(dt.entregados, dt.total)} /></td>
                                <td style={{ ...s.td, color: '#ef4444', fontSize: 13 }}>{dt.devoluciones}</td>
                                <td style={s.td}>
                                  <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 13 }}>{pct(dt.devoluciones, dt.total)}%</span>
                                </td>
                                <td style={{ ...s.td, color: '#f59e0b', fontSize: 13 }}>
                                  {dt.en_proceso > 0 ? `⏳ ${dt.en_proceso}` : <span style={{ color: '#94a3b8' }}>—</span>}
                                </td>
                                <td style={{ ...s.td, color: '#64748b', fontSize: 13 }}>
                                  {dt.otros > 0 ? dt.otros : <span style={{ color: '#94a3b8' }}>—</span>}
                                </td>
                                <td style={{ ...s.td, color: '#ef4444', fontSize: 13 }}>{fmt(dt.costo_dev)}</td>
                                <td style={{ ...s.td, color: '#22c55e', fontSize: 13 }}>{fmt(dt.ganancia)}</td>
                              </tr>

                              {/* city rows */}
                              {isDeptOpen && cities.map(([city, ct]) => (
                                <tr key={city} style={{ background: '#fffbeb' }}>
                                  <td />
                                  <td style={{ ...s.td, paddingLeft: 64, fontSize: 12, color: '#64748b' }}>📍 {city}</td>
                                  <td style={{ ...s.td, fontSize: 12 }}>{ct.total}</td>
                                  <td style={s.td}>
                                    <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', width: 60 }}>
                                      <div style={{ width: `${pct(ct.entregados, ct.total)}%`, background: '#22c55e' }} />
                                      <div style={{ width: `${pct(ct.devoluciones, ct.total)}%`, background: '#ef4444' }} />
                                      <div style={{ flex: 1, background: '#e2e8f0' }} />
                                    </div>
                                  </td>
                                  <td style={{ ...s.td, color: '#22c55e', fontSize: 12 }}>{ct.entregados}</td>
                                  <td style={{ ...s.td, fontSize: 12 }}><PctBadge value={pct(ct.entregados, ct.total)} /></td>
                                  <td style={{ ...s.td, color: '#ef4444', fontSize: 12 }}>{ct.devoluciones}</td>
                                  <td style={{ ...s.td, fontSize: 12 }}>
                                    <span style={{ color: '#dc2626', fontWeight: 700 }}>{pct(ct.devoluciones, ct.total)}%</span>
                                  </td>
                                  <td style={{ ...s.td, color: '#f59e0b', fontSize: 12 }}>
                                    {ct.en_proceso > 0 ? `⏳ ${ct.en_proceso}` : <span style={{ color: '#94a3b8' }}>—</span>}
                                  </td>
                                  <td style={{ ...s.td, color: '#64748b', fontSize: 12 }}>
                                    {ct.otros > 0 ? ct.otros : <span style={{ color: '#94a3b8' }}>—</span>}
                                  </td>
                                  <td style={{ ...s.td, color: '#ef4444', fontSize: 12 }}>{ct.costo_dev > 0 ? fmt(ct.costo_dev) : '—'}</td>
                                  <td style={{ ...s.td, color: '#22c55e', fontSize: 12 }}>{ct.ganancia > 0 ? fmt(ct.ganancia) : '—'}</td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            );
          })()}

          {/* CITY TABLE */}
          {tab === 'city' && (
            <div className="table-scroll">
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th(false)}>Ciudad</th>
                  <th style={s.th(false)}>Departamento</th>
                  <th style={s.th(true)} onClick={() => toggleSort('total')}>Total{sortIcon('total')}</th>
                  <th style={s.th(false)}>Distribución</th>
                  <th style={s.th(true)} onClick={() => toggleSort('entregados')}>Entregados{sortIcon('entregados')}</th>
                  <th style={s.th(true)} onClick={() => toggleSort('pct_entrega')}>% Entrega{sortIcon('pct_entrega')}</th>
                  <th style={s.th(true)} onClick={() => toggleSort('devoluciones')}>Devoluciones{sortIcon('devoluciones')}</th>
                  <th style={s.th(true)} onClick={() => toggleSort('pct_dev')}>% Dev{sortIcon('pct_dev')}</th>
                  <th style={s.th(false)}>En proceso</th>
                  <th style={s.th(false)}>Otros</th>
                  <th style={s.th(true)} onClick={() => toggleSort('ganancia_total')}>Ganancia{sortIcon('ganancia_total')}</th>
                </tr>
              </thead>
              <tbody>
                {cityRows.map((c, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ ...s.td, fontWeight: 600, color: '#1e293b' }}>{c.ciudad_destino || '—'}</td>
                    <td style={{ ...s.td, color: '#64748b', fontSize: 13 }}>{c.departamento_destino || '—'}</td>
                    <td style={s.td}><span style={{ fontWeight: 600 }}>{c.total}</span></td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', width: 80 }}>
                        <div style={{ width: `${c.pct_entrega}%`, background: '#22c55e' }} />
                        <div style={{ width: `${c.pct_dev}%`, background: '#ef4444' }} />
                        <div style={{ flex: 1, background: '#e2e8f0' }} />
                      </div>
                    </td>
                    <td style={{ ...s.td, color: '#22c55e', fontWeight: 600 }}>{c.entregados}</td>
                    <td style={s.td}><PctBadge value={c.pct_entrega.toFixed(1)} /></td>
                    <td style={{ ...s.td, color: '#ef4444', fontWeight: 600 }}>{c.devoluciones}</td>
                    <td style={s.td}>
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>{c.pct_dev.toFixed(1)}%</span>
                    </td>
                    <td style={{ ...s.td, color: '#f59e0b' }}>
                      {c.en_proceso > 0 ? `⏳ ${c.en_proceso}` : <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                    <td style={{ ...s.td, color: '#64748b' }}>
                      {c.otros > 0 ? c.otros : <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                    <td style={{ ...s.td, color: '#22c55e', fontWeight: 600 }}>{fmt(c.ganancia_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {/* RENTABILIDAD TAB */}
          {tab === 'rentabilidad' && profitData && (() => {
            const rows = profitData.departamentos;
            const totalIngreso = rows.reduce((s, r) => s + r.ingreso_neto, 0);
            const totalPauta = rows.reduce((s, r) => s + r.ad_spend, 0);
            const totalResultado = rows.reduce((s, r) => s + r.resultado_neto, 0);
            const conPerdida = rows.filter(r => r.resultado_neto < 0).length;
            return (
              <>
                <div className="grid-4" style={s.summaryGrid}>
                  <div style={s.summaryCard('#16a34a', '#f0fdf4')}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>{fmt(totalIngreso)}</div>
                    <div style={s.summaryLabel}>Ingreso neto (post-devolución)</div>
                  </div>
                  <div style={s.summaryCard('#d97706', '#fffbeb')}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#d97706' }}>{fmt(totalPauta)}</div>
                    <div style={s.summaryLabel}>Gasto en pauta</div>
                  </div>
                  <div style={s.summaryCard(totalResultado >= 0 ? '#2563eb' : '#dc2626', totalResultado >= 0 ? '#eff6ff' : '#fef2f2')}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: totalResultado >= 0 ? '#2563eb' : '#dc2626' }}>{fmt(totalResultado)}</div>
                    <div style={s.summaryLabel}>Resultado neto total</div>
                  </div>
                  <div style={s.summaryCard('#ef4444', '#fef2f2')}>
                    <div style={s.summaryVal('#ef4444')}>{conPerdida}</div>
                    <div style={s.summaryLabel}>Departamentos con pérdida</div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: '#94a3b8', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
                  Ingreso neto = ganancia de entregados − costo de devoluciones en ese departamento (ya después de devoluciones).
                  El gasto en pauta viene de los CSV de región cargados en <em>Cargar Excel → Publicidad por Departamento</em> —
                  recuerda que la región de Meta/TikTok es la ubicación estimada del comprador, no siempre coincide con el
                  departamento real de envío, así que es una aproximación.
                </div>

                {profitData.unmatched_regions?.length > 0 && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#d97706', marginBottom: 4 }}>
                      ⚠️ {profitData.unmatched_regions.length} región(es) sin reconocer — su gasto no está incluido arriba
                    </div>
                    <div style={{ fontSize: 12, color: '#92400e' }}>
                      Ve a Cargar Excel → Publicidad por Departamento para asignarlas manualmente:{' '}
                      {profitData.unmatched_regions.map(r => r.region_raw).join(', ')}
                    </div>
                  </div>
                )}

                {rows.length > 0 && <ProfitBarChart rows={rows} />}

                <div className="table-scroll">
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th(false)}>Departamento</th>
                      <th style={s.th(false)}>Pedidos</th>
                      <th style={s.th(false)}>Ingreso neto</th>
                      <th style={s.th(false)}>Gasto pauta</th>
                      <th style={s.th(false)}>Resultado neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.departamento} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ ...s.td, fontWeight: 600, color: '#1e293b' }}>{r.departamento}</td>
                        <td style={s.td}>{r.total}</td>
                        <td style={{ ...s.td, color: '#16a34a', fontWeight: 600 }}>{fmt(r.ingreso_neto)}</td>
                        <td style={{ ...s.td, color: r.ad_spend > 0 ? '#d97706' : '#cbd5e1', fontWeight: 600 }}>
                          {r.ad_spend > 0 ? fmt(r.ad_spend) : '—'}
                        </td>
                        <td style={{ ...s.td, fontWeight: 800, color: r.resultado_neto >= 0 ? '#2563eb' : '#dc2626' }}>
                          {fmt(r.resultado_neto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
