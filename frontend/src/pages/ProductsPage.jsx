import React, { useEffect, useState, useCallback, useMemo } from 'react';
import api from '../api/client';
import PeriodSelector from '../components/PeriodSelector';
import { COLOR, FONT_HEADING, RADIUS, SHADOW_CARD } from '../theme';

const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) : '0.0');
const fmt = n => '$ ' + Math.round(n || 0).toLocaleString('es-CO');

function PctBadge({ value }) {
  const v = parseFloat(value);
  const bg = v >= 70 ? '#f0fdf4' : v >= 50 ? '#fffbeb' : '#fef2f2';
  const color = v >= 70 ? '#16a34a' : v >= 50 ? '#d97706' : '#dc2626';
  return <span style={{ padding: '3px 9px', borderRadius: 12, fontSize: 13, fontWeight: 700, background: bg, color }}>{value}%</span>;
}

function MiniBar({ value, max, color }) {
  const w = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 80, height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{value}</span>
    </div>
  );
}

function ProfitBarChart({ products, onSelect }) {
  const sorted = [...products].sort((a, b) => b.resultado_neto - a.resultado_neto);
  const maxAbs = Math.max(...sorted.map(p => Math.abs(p.resultado_neto)), 1);
  return (
    <div style={{ background: '#fff', borderRadius: RADIUS.card, padding: '20px 22px', boxShadow: SHADOW_CARD, border: `1px solid ${COLOR.border}`, marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>
        Resultado neto estimado por producto (mayor a menor)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 520, overflowY: 'auto' }}>
        {sorted.map(p => {
          const isLoss = p.resultado_neto < 0;
          const w = (Math.abs(p.resultado_neto) / maxAbs) * 100;
          return (
            <div key={p.grupo} onClick={() => onSelect(p)} className="profit-bar-row" style={{ cursor: 'pointer' }}>
              <div style={{ fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={p.producto}>
                {p.producto}
              </div>
              <div style={{ height: 16, background: '#f8fafc', borderRadius: 4, position: 'relative' }}>
                <div style={{
                  height: '100%', width: `${w}%`, borderRadius: 4,
                  background: isLoss ? '#ef4444' : '#22c55e',
                }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', color: isLoss ? '#dc2626' : '#16a34a' }}>
                {fmt(p.resultado_neto)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s = {
  title: { fontFamily: FONT_HEADING, fontSize: 24, fontWeight: 700, color: COLOR.ink, letterSpacing: '-0.4px', marginBottom: 4 },
  sub:   { fontSize: 13.5, color: COLOR.textMuted, marginBottom: 22 },
  noData: { textAlign: 'center', padding: 48, color: COLOR.textMuted, fontSize: 14 },
  grid4: { marginBottom: 20 },
  card: (color) => ({
    background: '#fff', borderRadius: RADIUS.card, padding: '18px 20px',
    boxShadow: SHADOW_CARD, border: `1px solid ${COLOR.border}`, borderTop: `3px solid ${color}`,
  }),
  cardTitle: { fontSize: 11, fontWeight: 700, color: COLOR.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 },
  cardVal: (color) => ({ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.3px' }),
  table: { width: '100%', minWidth: 640, borderCollapse: 'collapse', background: '#fff', borderRadius: RADIUS.card, overflow: 'hidden', border: `1px solid ${COLOR.border}`, boxShadow: SHADOW_CARD },
  th: (clickable) => ({ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLOR.textFaint, textTransform: 'uppercase', borderBottom: `1px solid ${COLOR.border}`, background: '#FAFAFD', cursor: clickable ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }),
  td: { padding: '10px 14px', borderBottom: `1px solid ${COLOR.borderSoft}`, fontSize: 13.5, whiteSpace: 'nowrap' },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 60, zIndex: 1000 },
  modalInner: { background: '#fff', borderRadius: RADIUS.card, padding: '24px 28px', maxWidth: 900, width: '95%', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,.15)' },
  tabBtn: (active) => ({
    padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: active ? COLOR.accent : '#F1F2F7', color: active ? '#fff' : COLOR.textMuted,
  }),
};

function DetailModal({ product, period, onClose }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('dept');

  useEffect(() => {
    api.get('/product-orders/detail', {
      params: { period_id: period.period_id, store_id: period.store_id, producto: product.grupo || product.producto }
    }).then(r => setData(r.data));
  }, [product, period]);

  if (!data) return null;

  const tabs = [
    { key: 'financiero', label: '💰 Financiero' },
    { key: 'dept', label: 'Departamentos', data: data.byDept, nameCol: 'departamento_destino' },
    { key: 'city', label: 'Ciudades', data: data.byCity, nameCol: 'ciudad_destino' },
    { key: 'carrier', label: 'Transportadoras', data: data.byCarrier, nameCol: 'transportadora' },
    { key: 'variation', label: 'Variaciones', data: data.byVariation, nameCol: 'variacion' },
  ];
  const current = tabs.find(t => t.key === tab);
  const f = data.financiero || {};

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={s.modalInner} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{product.producto}</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {product.total} pedidos · {product.entregados} entregados · {product.devoluciones} devoluciones
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button key={t.key} style={s.tabBtn(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {tab === 'financiero' ? (
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
              El Excel de Dropi solo trae la ganancia por pedido completo, no por producto. Cuando un pedido tiene un solo producto,
              usamos su ganancia/costo de devolución real. Cuando un pedido combina varios productos (ej. "chaqueta motera" + "chaqueta ferrari"
              en la misma guía), se reparte proporcionalmente entre ellos según la cantidad — así el mismo pedido no infla la ganancia
              ni la pérdida en más de un producto. Solo se usa un promedio de la tienda cuando el pedido no tiene número de guía (excels antiguos).
            </div>
            <div className="grid-2" style={{ gap: 10, marginBottom: 14 }}>
              <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>INGRESO ESTIMADO</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>{fmt(f.ingreso_estimado)}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{f.entregados} entregados × {fmt(f.avg_ganancia_por_entregado)} prom.</div>
              </div>
              <div style={{ background: '#fef2f2', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>COSTO DEVOLUCIÓN ESTIMADO</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#dc2626' }}>{fmt(f.costo_devolucion_estimado)}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{f.devoluciones} devoluciones × {fmt(f.avg_costo_por_devolucion)} prom.</div>
              </div>
              <div style={{ background: '#fffbeb', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>GASTO EN PAUTA</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#d97706' }}>{fmt(f.gasto_pauta)}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.campanas ? f.campanas.split(',').join(', ') : 'Sin campañas asignadas'}
                </div>
              </div>
              <div style={{ background: f.resultado_neto >= 0 ? '#eff6ff' : '#fef2f2', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>RESULTADO NETO</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: f.resultado_neto >= 0 ? '#2563eb' : '#dc2626' }}>{fmt(f.resultado_neto)}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Ingreso − devolución − pauta</div>
              </div>
            </div>
          </div>
        ) : (
          <>
          {tab === 'dept' && (
            <div style={{ fontSize: 12, color: '#94a3b8', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
              {data.tieneCruceDepartamento
                ? 'Resultado neto por departamento para este producto: ingreso estimado (con el promedio de la tienda) menos el gasto en pauta que cayó en ese departamento — cruzado desde un CSV con desglose de Campaña + Región.'
                : 'Para ver ganancia/pérdida por departamento de este producto, sube en Cargar Excel → Publicidad un CSV con los desgloses de Campaña y Región activados a la vez.'}
            </div>
          )}
          <div className="table-scroll">
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th(false)}>{current.label === 'Variaciones' ? 'Variación' : current.label.slice(0, -2)}</th>
                <th style={s.th(false)}>Total</th>
                <th style={s.th(false)}>Entregados</th>
                <th style={s.th(false)}>% Entrega</th>
                <th style={s.th(false)}>Devoluciones</th>
                <th style={s.th(false)}>% Dev</th>
                <th style={s.th(false)}>En proceso</th>
                {tab === 'dept' && data.tieneCruceDepartamento && (
                  <>
                    <th style={s.th(false)}>Gasto pauta</th>
                    <th style={s.th(false)}>Resultado neto</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {current.data.map((row, i) => {
                const df = tab === 'dept' ? data.byDeptFinanciero?.find(d => d.departamento === row.departamento_destino) : null;
                return (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ ...s.td, fontWeight: 600, color: '#1e293b' }}>{row[current.nameCol] || '—'}</td>
                  <td style={s.td}>{row.total}</td>
                  <td style={{ ...s.td, color: '#22c55e', fontWeight: 600 }}>{row.entregados}</td>
                  <td style={s.td}><PctBadge value={pct(row.entregados, row.total)} /></td>
                  <td style={{ ...s.td, color: '#ef4444', fontWeight: 600 }}>{row.devoluciones}</td>
                  <td style={s.td}>
                    <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 13 }}>{pct(row.devoluciones, row.total)}%</span>
                  </td>
                  <td style={{ ...s.td, color: '#f59e0b', fontWeight: 600 }}>
                    {row.en_proceso > 0 ? `⏳ ${row.en_proceso}` : <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  {tab === 'dept' && data.tieneCruceDepartamento && (
                    <>
                      <td style={{ ...s.td, color: df?.gasto_pauta > 0 ? '#d97706' : '#cbd5e1', fontWeight: 600 }}>
                        {df?.gasto_pauta > 0 ? fmt(df.gasto_pauta) : '—'}
                      </td>
                      <td style={{ ...s.td, fontWeight: 800, color: (df?.resultado_neto ?? 0) >= 0 ? '#2563eb' : '#dc2626' }}>
                        {df ? fmt(df.resultado_neto) : '—'}
                      </td>
                    </>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [period, setPeriod] = useState(null);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [sortKey, setSortKey] = useState('total');
  const [sortDir, setSortDir] = useState(-1);
  const [view, setView] = useState('operativo');

  useEffect(() => {
    if (period?.period_id) {
      api.get('/product-orders/summary', { params: { period_id: period.period_id, store_id: period.store_id } })
        .then(r => setData(r.data))
        .catch(() => setData(null));
    }
  }, [period]);

  async function toggleLinea(grupo, currentLinea) {
    const nextLinea = currentLinea === 'DAMA' ? 'HOMBRE' : 'DAMA';
    await api.post('/product-lines', { store_id: period.store_id, canonical_key: grupo, line: nextLinea });
    setData(prev => ({
      ...prev,
      products: prev.products.map(p => p.grupo === grupo ? { ...p, linea: nextLinea } : p),
    }));
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d * -1);
    else { setSortKey(key); setSortDir(-1); }
  }

  const products = useMemo(() => {
    if (!data?.products) return [];
    const arr = data.products.map(p => ({
      ...p,
      pct_entrega: p.total > 0 ? (p.entregados / p.total) * 100 : 0,
      pct_dev: p.total > 0 ? (p.devoluciones / p.total) * 100 : 0,
      pct_total: data.total_orders > 0 ? (p.total / data.total_orders) * 100 : 0,
    }));
    arr.sort((a, b) => {
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
      return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir;
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const maxTotal = Math.max(...products.map(p => p.total), 1);
  const totalEntregados = products.reduce((s, p) => s + p.entregados, 0);
  const totalDevoluciones = products.reduce((s, p) => s + p.devoluciones, 0);
  const totalUnidades = products.reduce((s, p) => s + (p.unidades || 0), 0);

  const totalIngreso = products.reduce((s, p) => s + (p.ingreso_estimado || 0), 0);
  const totalCostoDevolucion = products.reduce((s, p) => s + (p.costo_devolucion_estimado || 0), 0);
  const totalPauta = products.reduce((s, p) => s + (p.ad_spend || 0), 0);
  const totalResultado = products.reduce((s, p) => s + (p.resultado_neto || 0), 0);
  const productosConPerdida = products.filter(p => p.resultado_neto < 0).length;
  const productosConGanancia = products.filter(p => p.resultado_neto > 0).length;
  const peores = [...products].sort((a, b) => a.resultado_neto - b.resultado_neto).slice(0, 5).filter(p => p.resultado_neto < 0);
  const mejores = [...products].sort((a, b) => b.resultado_neto - a.resultado_neto).slice(0, 5);

  const sortIcon = (key) => sortKey === key ? (sortDir > 0 ? ' ↑' : ' ↓') : ' ↕';

  return (
    <div>
      <div style={s.title}>Productos</div>
      <div style={s.sub}>Análisis por producto: % de pedidos, entrega, devoluciones por departamento, ciudad y transportadora</div>

      <PeriodSelector value={period} onChange={setPeriod} />

      {!period && <div style={s.noData}>Selecciona una tienda y período para ver los productos</div>}

      {period && data && data.total_orders === 0 && (
        <div style={s.noData}>No hay órdenes de producto importadas para este período. Carga el Excel de "Órdenes por Producto" primero.</div>
      )}

      {period && data && data.total_orders > 0 && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            <button style={s.tabBtn(view === 'operativo')} onClick={() => setView('operativo')}>📦 Operativo</button>
            <button style={s.tabBtn(view === 'rentabilidad')} onClick={() => setView('rentabilidad')}>💰 Rentabilidad</button>
          </div>

          {view === 'rentabilidad' ? (
            <>
              <div className="grid-4" style={s.grid4}>
                <div style={s.card('#16a34a')}>
                  <div style={s.cardTitle}>Ingreso estimado</div>
                  <div style={s.cardVal('#16a34a')}>{fmt(totalIngreso)}</div>
                </div>
                <div style={s.card('#d97706')}>
                  <div style={s.cardTitle}>Gasto en pauta</div>
                  <div style={s.cardVal('#d97706')}>{fmt(totalPauta)}</div>
                </div>
                <div style={s.card(totalResultado >= 0 ? '#2563eb' : '#dc2626')}>
                  <div style={s.cardTitle}>Resultado neto total</div>
                  <div style={s.cardVal(totalResultado >= 0 ? '#2563eb' : '#dc2626')}>{fmt(totalResultado)}</div>
                </div>
                <div style={s.card('#ef4444')}>
                  <div style={s.cardTitle}>Productos con pérdida</div>
                  <div style={s.cardVal('#ef4444')}>{productosConPerdida}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{productosConGanancia} con ganancia</div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: '#94a3b8', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
                El ingreso y costo de devolución por producto son <strong>estimados</strong> con el promedio de ganancia/devolución
                de toda la tienda en este período (Dropi no da la ganancia por producto individual). El gasto en pauta es real,
                según las campañas que hayas asignado en <em>Cargar Excel → Publicidad por Campaña</em>.
              </div>

              {peores.length > 0 && (
                <div className="grid-2" style={{ marginBottom: 20 }}>
                  <div style={{ background: '#fef2f2', borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>⚠️ Peores productos</div>
                    {peores.map(p => (
                      <div key={p.grupo} onClick={() => setSelected(p)} style={{ display: 'flex', justifyContent: 'space-between',
                        padding: '4px 0', fontSize: 13, cursor: 'pointer' }}>
                        <span style={{ color: '#374151' }}>{p.producto}</span>
                        <span style={{ fontWeight: 700, color: '#dc2626' }}>{fmt(p.resultado_neto)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', marginBottom: 8 }}>🏆 Mejores productos</div>
                    {mejores.map(p => (
                      <div key={p.grupo} onClick={() => setSelected(p)} style={{ display: 'flex', justifyContent: 'space-between',
                        padding: '4px 0', fontSize: 13, cursor: 'pointer' }}>
                        <span style={{ color: '#374151' }}>{p.producto}</span>
                        <span style={{ fontWeight: 700, color: '#16a34a' }}>{fmt(p.resultado_neto)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <ProfitBarChart products={products} onSelect={setSelected} />

              <div className="table-scroll">
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th(true)} onClick={() => toggleSort('producto')}>Producto{sortIcon('producto')}</th>
                    <th style={s.th(true)} onClick={() => toggleSort('ingreso_estimado')}>Ingreso est.{sortIcon('ingreso_estimado')}</th>
                    <th style={s.th(true)} onClick={() => toggleSort('costo_devolucion_estimado')}>Costo dev. est.{sortIcon('costo_devolucion_estimado')}</th>
                    <th style={s.th(true)} onClick={() => toggleSort('ad_spend')}>Gasto pauta{sortIcon('ad_spend')}</th>
                    <th style={s.th(true)} onClick={() => toggleSort('resultado_neto')}>Resultado neto{sortIcon('resultado_neto')}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={p.grupo} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }} onClick={() => setSelected(p)}>
                      <td style={{ ...s.td, fontWeight: 700, color: '#1e293b', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        🏷️ {p.producto}
                      </td>
                      <td style={{ ...s.td, color: '#16a34a', fontWeight: 600 }}>{fmt(p.ingreso_estimado)}</td>
                      <td style={{ ...s.td, color: '#dc2626', fontWeight: 600 }}>{fmt(p.costo_devolucion_estimado)}</td>
                      <td style={{ ...s.td, color: p.ad_spend > 0 ? '#d97706' : '#cbd5e1', fontWeight: 600 }}>
                        {p.ad_spend > 0 ? fmt(p.ad_spend) : '—'}
                      </td>
                      <td style={{ ...s.td, fontWeight: 800, color: p.resultado_neto >= 0 ? '#2563eb' : '#dc2626' }}>
                        {fmt(p.resultado_neto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          ) : (
          <>
          <div className="grid-4" style={s.grid4}>
            <div style={s.card('#3b82f6')}>
              <div style={s.cardTitle}>Productos</div>
              <div style={s.cardVal('#3b82f6')}>{products.length}</div>
            </div>
            <div style={s.card('#6366f1')}>
              <div style={s.cardTitle}>Total pedidos</div>
              <div style={s.cardVal('#6366f1')}>{data.total_orders}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{totalUnidades} unidades</div>
            </div>
            <div style={s.card('#22c55e')}>
              <div style={s.cardTitle}>Entregados</div>
              <div style={s.cardVal('#22c55e')}>{totalEntregados}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{pct(totalEntregados, data.total_orders)}%</div>
            </div>
            <div style={s.card('#ef4444')}>
              <div style={s.cardTitle}>Devoluciones</div>
              <div style={s.cardVal('#ef4444')}>{totalDevoluciones}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{pct(totalDevoluciones, data.total_orders)}%</div>
            </div>
          </div>

          <div className="table-scroll">
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th(true)} onClick={() => toggleSort('producto')}>Producto{sortIcon('producto')}</th>
                <th style={s.th(false)}>Línea</th>
                <th style={s.th(true)} onClick={() => toggleSort('total')}>Pedidos{sortIcon('total')}</th>
                <th style={s.th(false)}>% del total</th>
                <th style={s.th(false)}>Distribución</th>
                <th style={s.th(true)} onClick={() => toggleSort('unidades')}>Unidades{sortIcon('unidades')}</th>
                <th style={s.th(true)} onClick={() => toggleSort('entregados')}>Entregados{sortIcon('entregados')}</th>
                <th style={s.th(true)} onClick={() => toggleSort('pct_entrega')}>% Entrega{sortIcon('pct_entrega')}</th>
                <th style={s.th(true)} onClick={() => toggleSort('devoluciones')}>Devoluciones{sortIcon('devoluciones')}</th>
                <th style={s.th(true)} onClick={() => toggleSort('pct_dev')}>% Dev{sortIcon('pct_dev')}</th>
                <th style={s.th(false)}>En proceso</th>
                <th style={s.th(true)} onClick={() => toggleSort('ad_spend')}>Gasto Pauta{sortIcon('ad_spend')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr
                  key={p.producto}
                  style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                  onClick={() => setSelected(p)}
                >
                  <td style={{ ...s.td, fontWeight: 700, color: '#1e293b', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    🏷️ {p.producto}
                  </td>
                  <td style={s.td}>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleLinea(p.grupo, p.linea); }}
                      style={{
                        padding: '3px 9px', borderRadius: 12, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                        background: p.linea === 'DAMA' ? '#fce7f3' : '#eff6ff',
                        color: p.linea === 'DAMA' ? '#db2777' : '#2563eb',
                      }}
                      title="Clic para cambiar de línea"
                    >
                      {p.linea === 'DAMA' ? '👗 Dama' : '👔 Hombre'}
                    </button>
                  </td>
                  <td style={s.td}>
                    <MiniBar value={p.total} max={maxTotal} color="#3b82f6" />
                  </td>
                  <td style={{ ...s.td }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6' }}>{p.pct_total.toFixed(1)}%</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>({p.total}/{data.total_orders})</span>
                  </td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', width: 100 }}>
                      <div style={{ width: `${p.pct_entrega}%`, background: '#22c55e' }} />
                      <div style={{ width: `${p.pct_dev}%`, background: '#ef4444' }} />
                      <div style={{ flex: 1, background: '#e2e8f0' }} />
                    </div>
                  </td>
                  <td style={{ ...s.td, fontWeight: 600, color: '#6366f1' }}>{p.unidades}</td>
                  <td style={{ ...s.td, color: '#22c55e', fontWeight: 600 }}>{p.entregados}</td>
                  <td style={s.td}><PctBadge value={p.pct_entrega.toFixed(1)} /></td>
                  <td style={{ ...s.td, color: '#ef4444', fontWeight: 600 }}>{p.devoluciones}</td>
                  <td style={s.td}>
                    <span style={{ padding: '3px 9px', borderRadius: 12, fontSize: 13, fontWeight: 700, background: '#fef2f2', color: '#dc2626' }}>
                      {p.pct_dev.toFixed(1)}%
                    </span>
                  </td>
                  <td style={{ ...s.td, color: '#f59e0b', fontWeight: 600 }}>
                    {p.en_proceso > 0 ? `⏳ ${p.en_proceso}` : <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ ...s.td, fontWeight: 600, color: p.ad_spend > 0 ? '#d97706' : '#cbd5e1' }}>
                    {p.ad_spend > 0 ? fmt(p.ad_spend) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 12 }}>
            Haz clic en un producto para ver desglose por departamento, ciudad, transportadora y variación
          </div>
          </>
          )}
        </>
      )}

      {selected && period && (
        <DetailModal product={selected} period={period} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
