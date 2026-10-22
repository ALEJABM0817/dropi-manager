import React, { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { COLOR, FONT_HEADING, RADIUS, SHADOW_CARD, btnPrimary } from '../theme';

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const s = {
  title: { fontFamily: FONT_HEADING, fontSize: 24, fontWeight: 700, color: COLOR.ink, letterSpacing: '-0.4px', marginBottom: 4 },
  sub: { fontSize: 13.5, color: COLOR.textMuted, marginBottom: 22 },
  table: {
    background: '#fff', borderRadius: RADIUS.card, padding: '22px 26px',
    boxShadow: SHADOW_CARD, border: `1px solid ${COLOR.border}`, marginBottom: 16,
  },
  tableTitle: { fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 700, color: COLOR.inkSoft, marginBottom: 16 },
  divider: { borderTop: `2px solid ${COLOR.ink}`, margin: '10px 0' },
  totalRow: { display: 'flex', justifyContent: 'space-between', padding: '9px 0', fontWeight: 700, fontSize: 15 },
  noData: { textAlign: 'center', padding: 48, color: COLOR.textMuted, fontSize: 14 },
  selectorBar: {
    display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 24,
    background: '#fff', padding: '16px 20px', borderRadius: RADIUS.card, boxShadow: SHADOW_CARD, border: `1px solid ${COLOR.border}`,
  },
  select: {
    padding: '8px 12px', border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.control, fontSize: 14,
    background: '#fff', color: COLOR.ink, cursor: 'pointer', minWidth: 160,
  },
  label: { fontSize: 12, fontWeight: 600, color: COLOR.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' },
  btn: btnPrimary,
};

// Compact currency for on-bar labels (e.g. "$8.0M", "$340K") — full fmt() is too wide to
// fit above a 28px bar without overlapping its neighbor.
function fmtCompact(n) {
  const v = n || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function MonthlyComparisonChart({ byPeriod }) {
  const [expanded, setExpanded] = useState(null);
  if (!byPeriod || byPeriod.length < 2) return null;
  const series = [
    { key: 'ganancia', label: 'Ganancia', color: '#22c55e' },
    { key: 'devolucion', label: 'Devoluciones', color: '#ef4444' },
    { key: 'ad_spend', label: 'Gasto en pauta', color: '#f59e0b' },
  ];
  const maxAbs = Math.max(
    1,
    ...byPeriod.flatMap(p => series.map(s => Math.abs(p[s.key] || 0)))
  );
  const barAreaHeight = 180;
  const expandedPeriod = byPeriod.find(p => p.period_id === expanded);

  return (
    <div style={s.table}>
      <div style={s.tableTitle}>📊 Comparativo mes a mes</div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
        Haz clic en un mes para ver el detalle exacto.
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
        {series.map(sr => (
          <div key={sr.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: sr.color, display: 'inline-block' }} />
            {sr.label}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-end', overflowX: 'auto', paddingBottom: 8 }}>
        {byPeriod.map(p => {
          const isExpanded = expanded === p.period_id;
          return (
          <div key={p.period_id}
            onClick={() => setExpanded(isExpanded ? null : p.period_id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 100,
              cursor: 'pointer', padding: '6px 8px', borderRadius: 8,
              background: isExpanded ? '#f5f3ff' : 'transparent',
              border: isExpanded ? '1.5px solid #c4b5fd' : '1.5px solid transparent',
            }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: barAreaHeight }}>
              {series.map(sr => {
                const val = p[sr.key] || 0;
                const h = Math.max(2, (Math.abs(val) / maxAbs) * (barAreaHeight - 18));
                return (
                  <div key={sr.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: barAreaHeight }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 3, whiteSpace: 'nowrap' }}>
                      {fmtCompact(val)}
                    </div>
                    <div title={`${sr.label}: ${fmt(val)}`}
                      style={{ width: 24, height: h, background: val < 0 ? '#991b1b' : sr.color, borderRadius: '3px 3px 0 0' }} />
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginTop: 8 }}>
              {MONTHS[p.month - 1].substring(0, 3)} {p.year}
            </div>
            <div style={{ fontSize: 11, color: p.ganancia >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
              {fmt(p.ganancia)}
            </div>
          </div>
          );
        })}
      </div>

      {expandedPeriod && (
        <div style={{ marginTop: 16, padding: '14px 18px', background: '#f5f3ff', borderRadius: 10, border: '1.5px solid #ddd6fe' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5b21b6', marginBottom: 10 }}>
            {MONTHS[expandedPeriod.month - 1]} {expandedPeriod.year} — detalle
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>ENTREGADO DROPI</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#16a34a' }}>{fmt(expandedPeriod.entregado)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>OTROS INGRESOS</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#16a34a' }}>{fmt(expandedPeriod.otros_ingresos)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>DEVOLUCIONES + EN PROCESO</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#dc2626' }}>({fmt(expandedPeriod.devolucion)})</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>GASTO EN PAUTA</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#d97706' }}>({fmt(expandedPeriod.ad_spend)})</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>OTROS GASTOS</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#8b5cf6' }}>({fmt(expandedPeriod.gastos)})</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>GANANCIA</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: expandedPeriod.ganancia >= 0 ? '#16a34a' : '#dc2626' }}>
                {fmt(expandedPeriod.ganancia)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AccumulatedSummary() {
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState('');
  const [periods, setPeriods] = useState([]);
  const [selectedPeriods, setSelectedPeriods] = useState(new Set());
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
      setPeriods(r.data);
      setSelectedPeriods(new Set());
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

  function selectAll() {
    if (selectedPeriods.size === periods.length) {
      setSelectedPeriods(new Set());
    } else {
      setSelectedPeriods(new Set(periods.map(p => p.id)));
    }
  }

  async function handleApply() {
    if (selectedPeriods.size === 0) return;
    setLoading(true);
    try {
      const res = await api.get('/accumulated-summary', {
        params: { store_id: storeId, period_ids: [...selectedPeriods].join(',') }
      });
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }

  const store = stores.find(st => st.id == storeId);
  const entregado = data?.entregado?.total || 0;
  const devolucion = data?.devolucion?.total || 0;
  const enProcesoCosto = data?.en_proceso?.costo_estimado || 0;
  const devolucionTotal = devolucion + enProcesoCosto;
  const totalIncome = (data?.incomes || []).reduce((s, i) => s + (i.amount || 0), 0);
  const totalPublicidadManual = (data?.ads || []).reduce((s, a) => s + (a.amount || 0), 0);
  // Prefers the real campaign-CSV spend per period over manual ad_investments entries —
  // same fallback rule as the monthly Resumen — so this matches what each month actually spent.
  const totalPublicidad = data?.ad_spend_total > 0 ? data.ad_spend_total : totalPublicidadManual;
  const usingCampaignSpend = (data?.ad_spend_total || 0) > totalPublicidadManual;
  const totalGastos = (data?.expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
  const total = entregado + totalIncome - devolucionTotal - totalPublicidad - totalGastos;
  const valor10 = total * 0.1;
  const totalSin10 = total - valor10;
  // Valor DIAN: 3.5% of total entregado (Dropi). For Zindra, the base also includes
  // "Otros ingresos" — same rule as the monthly Resumen, shown as an independent scenario.
  const isZindra = (store?.name || '').toLowerCase().includes('zindra');
  const valorDianBase = entregado + (isZindra ? totalIncome : 0);
  const valorDian = valorDianBase * 0.035;
  const totalSinDian = total - valorDian;

  const selectedLabel = [...selectedPeriods]
    .map(id => periods.find(p => p.id === id))
    .filter(Boolean)
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map(p => `${MONTHS[p.month - 1].substring(0, 3)} ${p.year}`)
    .join(', ');

  return (
    <div>
      <div style={s.title}>Resumen Acumulado</div>
      <div style={s.sub}>Selecciona una tienda y los meses a acumular. Devoluciones en proceso incluidas automáticamente.</div>

      {/* Selector */}
      <div style={s.selectorBar}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={s.label}>Tienda</label>
          <select style={s.select} value={storeId} onChange={e => setStoreId(Number(e.target.value))}>
            {stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </div>

        {periods.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={s.label}>Meses disponibles</label>
              <button onClick={selectAll}
                style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                {selectedPeriods.size === periods.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {periods.map(p => {
                const sel = selectedPeriods.has(p.id);
                return (
                  <button key={p.id} onClick={() => togglePeriod(p.id)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: sel ? `2px solid ${COLOR.accent}` : `1.5px solid ${COLOR.border}`,
                      background: sel ? COLOR.accentBg : '#fff',
                      color: sel ? COLOR.accent : COLOR.textMuted,
                    }}>
                    {MONTHS[p.month - 1]} {p.year}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button style={{ ...s.btn, opacity: selectedPeriods.size === 0 ? 0.5 : 1 }}
          disabled={selectedPeriods.size === 0 || loading} onClick={handleApply}>
          {loading ? 'Cargando...' : 'Generar resumen'}
        </button>
      </div>

      {selectedPeriods.size > 0 && data && (
        <div style={{ fontSize: 13, color: '#7c3aed', fontWeight: 600, marginBottom: 16 }}>
          Acumulado: {selectedLabel} · {store?.name}
        </div>
      )}

      {!data && periods.length > 0 && <div style={s.noData}>Selecciona meses y haz clic en "Generar resumen"</div>}
      {periods.length === 0 && storeId && <div style={s.noData}>No hay períodos registrados para esta tienda</div>}

      {data && <MonthlyComparisonChart byPeriod={data.by_period} />}

      {data && (
        <div style={s.table}>
          <div style={s.tableTitle}>💰 Cierre Periódico · {store?.name}</div>

          {/* ENTREGADO */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>Entregado Dropi</span>
            <span style={{ fontWeight: 600, color: '#22c55e', fontSize: 13 }}>{fmt(entregado)}</span>
          </div>

          {/* OTROS INGRESOS */}
          <div style={{ marginBottom: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '9px 0', borderBottom: '1.5px solid #e2e8f0' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>Otros ingresos</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#22c55e' }}>{fmt(totalIncome)}</span>
            </div>
            <div style={{ paddingLeft: 8 }}>
              {(data.incomes || []).filter(i => i.amount > 0).map((inc, i) => (
                <div key={inc.category_id || i}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{inc.name}</span>
                  <span style={{ fontWeight: 600, color: '#22c55e', fontSize: 13 }}>{fmt(inc.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* DEVOLUCIONES + EN PROCESO */}
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '9px 0', borderBottom: '1.5px solid #e2e8f0' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>Devoluciones + En proceso</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#ef4444' }}>({fmt(devolucionTotal)})</span>
            </div>
            <div style={{ paddingLeft: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>Devoluciones confirmadas</span>
                <span style={{ fontWeight: 600, color: '#ef4444', fontSize: 13 }}>{fmt(devolucion)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: '#d97706' }}>En proceso ({data.en_proceso?.count || 0} pedidos)</span>
                  <span style={{ fontSize: 11, background: '#fffbeb', color: '#d97706', padding: '1px 6px', borderRadius: 8 }}>estimado · incluido</span>
                </div>
                <span style={{ fontWeight: 600, color: '#d97706', fontSize: 13 }}>{fmt(enProcesoCosto)}</span>
              </div>
            </div>
          </div>

          {/* PUBLICIDAD */}
          <div style={{ marginBottom: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '9px 0', borderBottom: '1.5px solid #e2e8f0' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>📣 Publicidad</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#f59e0b' }}>{fmt(totalPublicidad)}</span>
            </div>
            {usingCampaignSpend && (
              <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', borderRadius: 8, padding: '8px 12px', margin: '8px 0' }}>
                ✓ Incluye el gasto real de campañas CSV de los meses que lo tengan cargado (reemplaza la cuenta manual
                de ese mes): {fmt(totalPublicidad)} en vez de {fmt(totalPublicidadManual)} solo manual.
              </div>
            )}
            <div style={{ paddingLeft: 8 }}>
              {(data.ads || []).filter(a => a.amount > 0).map((ad, i) => (
                <div key={ad.ad_account_id || i}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>{ad.name}</span>
                    <span style={{ fontSize: 11, background: '#f1f5f9', color: '#94a3b8',
                                   padding: '1px 6px', borderRadius: 8, textTransform: 'uppercase' }}>{ad.platform}</span>
                  </div>
                  <span style={{ fontWeight: 600, color: '#f59e0b', fontSize: 13 }}>{fmt(ad.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* OTROS GASTOS */}
          <div style={{ marginBottom: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '9px 0', borderBottom: '1.5px solid #e2e8f0' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>💸 Otros gastos</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#8b5cf6' }}>{fmt(totalGastos)}</span>
            </div>
            <div style={{ paddingLeft: 8 }}>
              {(data.expenses || []).filter(e => e.amount > 0).map((exp, i) => (
                <div key={exp.category_id || i}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{exp.name}</span>
                  <span style={{ fontWeight: 600, color: '#8b5cf6', fontSize: 13 }}>{fmt(exp.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* TOTALS */}
          <div style={s.divider} />
          <div style={s.totalRow}>
            <span>TOTAL</span>
            <span style={{ color: total >= 0 ? '#22c55e' : '#ef4444' }}>{fmt(total)}</span>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginTop: 4, marginBottom: 2 }}>
            Supuestos (independientes entre sí)
          </div>
          <div style={{ ...s.totalRow, fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>
            <span>Valor 10% (reserva impuestos)</span>
            <span>({fmt(valor10)})</span>
          </div>
          <div style={{ ...s.totalRow, fontSize: 15, color: '#f59e0b' }}>
            <span>TOTAL SIN 10% (ganancia final)</span>
            <span>{fmt(totalSin10)}</span>
          </div>
          <div style={{ borderTop: '1px dashed #e2e8f0', margin: '6px 0' }} />
          <div style={{ ...s.totalRow, fontSize: 13, fontWeight: 600, color: '#dc2626' }}>
            <span>
              Valor DIAN (3.5%)
              {isZindra && (
                <span style={{ marginLeft: 6, fontSize: 11, background: '#fef2f2', color: '#dc2626', padding: '1px 6px', borderRadius: 8 }}>
                  incluye otros ingresos
                </span>
              )}
            </span>
            <span>({fmt(valorDian)})</span>
          </div>
          <div style={{ ...s.totalRow, fontSize: 15, color: '#dc2626' }}>
            <span>TOTAL SIN DIAN</span>
            <span>{fmt(totalSinDian)}</span>
          </div>

          {/* Period breakdown */}
          {data.periods?.length > 1 && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: '#f8fafc', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Períodos incluidos:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.periods.map(p => (
                  <span key={p.id} style={{ padding: '3px 10px', borderRadius: 8, background: '#f5f3ff',
                    color: '#7c3aed', fontSize: 12, fontWeight: 600 }}>
                    {MONTHS[p.month - 1]} {p.year}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
