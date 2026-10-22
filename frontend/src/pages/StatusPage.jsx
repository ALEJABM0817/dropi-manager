import React, { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import PeriodSelector from '../components/PeriodSelector';
import { COLOR, FONT_HEADING, RADIUS, SHADOW_CARD } from '../theme';

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

const CATEGORY_META = {
  entregado:  { label: 'Entregados',           color: '#22c55e', bg: '#f0fdf4', icon: '✅' },
  devolucion: { label: 'Devoluciones',          color: '#ef4444', bg: '#fef2f2', icon: '↩️' },
  en_proceso: { label: 'En proceso devolución', color: '#f59e0b', bg: '#fffbeb', icon: '⏳' },
  otro:       { label: 'Otros',                 color: '#6366f1', bg: '#eef2ff', icon: '📦' },
};

const s = {
  title:   { fontFamily: FONT_HEADING, fontSize: 24, fontWeight: 700, color: COLOR.ink, letterSpacing: '-0.4px', marginBottom: 4 },
  sub:     { fontSize: 13.5, color: COLOR.textMuted, marginBottom: 22 },
  grid3:   { marginBottom: 20 },
  grid2:   { marginBottom: 20 },
  card:    (bg, border) => ({
    background: bg, borderRadius: RADIUS.card, padding: '20px 24px',
    boxShadow: SHADOW_CARD,
    border: `1px solid ${border}30`,
  }),
  bigPct:  (color) => ({ fontSize: 36, fontWeight: 800, color, lineHeight: 1 }),
  label:   { fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 4 },
  count:   { fontSize: 13, color: '#94a3b8', marginTop: 4 },
  bar:     { height: 8, borderRadius: 4, background: '#e2e8f0', marginTop: 12, overflow: 'hidden' },
  barFill: (color, pct) => ({ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.5s' }),
  clickHint: { fontSize: 11, color: '#94a3b8', marginTop: 8, cursor: 'pointer', textDecoration: 'underline' },

  // Status chips
  chipsWrap: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  chip:    (color, bg) => ({
    padding: '8px 16px', borderRadius: 20, background: bg, border: `1.5px solid ${color}30`,
    fontSize: 13, fontWeight: 600, color, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6,
  }),
  journeyBtn: (color) => ({
    border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
    color, opacity: 0.75, padding: 0, marginLeft: 2,
  }),

  // Journey modal
  journeyGrid: { padding: '18px 24px' },
  journeyCard: (color, bg) => ({
    background: bg, borderRadius: 10, padding: '14px 16px', border: `1.5px solid ${color}30`,
  }),
  journeyPct: (color) => ({ fontSize: 24, fontWeight: 800, color }),
  journeyLabel: { fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginTop: 4 },
  journeySummary: {
    margin: '0 24px 20px', padding: '14px 18px', borderRadius: 10,
    background: '#f8fafc', fontSize: 13,
  },

  // Cost panel
  costCard: {
    background: '#fff', borderRadius: RADIUS.card, padding: '20px 24px',
    boxShadow: SHADOW_CARD, border: `1px solid ${COLOR.border}`, marginBottom: 20,
  },
  costTitle: { fontFamily: FONT_HEADING, fontSize: 14.5, fontWeight: 700, color: COLOR.inkSoft, marginBottom: 14 },
  costRow:   { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 },
  costTotal: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontWeight: 700, fontSize: 15, color: '#f59e0b' },

  // Modal overlay
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  modal: {
    background: '#fff', borderRadius: RADIUS.card, width: '100%', maxWidth: 860,
    maxHeight: '85vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,.25)',
  },
  modalHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '18px 24px', borderBottom: '1px solid #e2e8f0',
  },
  modalTitle: { fontSize: 16, fontWeight: 700, color: '#1e293b' },
  closeBtn:   { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' },
  modalBody:  { overflowY: 'auto', overflowX: 'auto', flex: 1 },
  table:      { width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 13 },
  th:         { padding: '10px 12px', background: '#f8fafc', textAlign: 'left', fontWeight: 600,
                color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.4px',
                position: 'sticky', top: 0, borderBottom: '1px solid #e2e8f0' },
  td:         { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: '#374151', verticalAlign: 'top' },
  noData:     { textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 },
};

function OrdersModal({ period, estatus, category, onClose }) {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    api.get('/orders/by-status', { params: { period_id: period.period_id, store_id: period.store_id, estatus } })
      .then(r => setOrders(r.data));
  }, [estatus]);

  const meta = CATEGORY_META[category] || CATEGORY_META.otro;

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={s.modalHead}>
          <div style={s.modalTitle}>
            <span style={{ color: meta.color }}>{meta.icon} {estatus}</span>
            {orders && <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 400, marginLeft: 8 }}>({orders.length} pedidos)</span>}
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={s.modalBody}>
          {!orders && <div style={s.noData}>Cargando...</div>}
          {orders && orders.length === 0 && <div style={s.noData}>Sin pedidos</div>}
          {orders && orders.length > 0 && (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Fecha</th>
                  <th style={s.th}>Cliente</th>
                  <th style={s.th}>Guía</th>
                  <th style={s.th}>Transportadora</th>
                  <th style={s.th}>Ciudad</th>
                  <th style={s.th}>Flete</th>
                  {category === 'en_proceso' && <th style={s.th}>Costo devol.</th>}
                  {category === 'en_proceso' && <th style={s.th}>% flete</th>}
                  {category === 'entregado' && <th style={s.th}>Ganancia</th>}
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={s.td}>{o.fecha}</td>
                    <td style={s.td}>{o.nombre_cliente}</td>
                    <td style={{ ...s.td, fontSize: 11, color: '#64748b' }}>{o.numero_guia}</td>
                    <td style={s.td}>{o.transportadora}</td>
                    <td style={s.td}>{o.ciudad_destino}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{fmt(o.precio_flete)}</td>
                    {category === 'en_proceso' && (
                      <>
                        <td style={{ ...s.td, textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>
                          {fmt(o.costo_devolucion_estimado)}
                        </td>
                        <td style={{ ...s.td, textAlign: 'center', fontSize: 12 }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 10,
                            background: o.pct_flete === 100 ? '#fef2f2' : '#fffbeb',
                            color: o.pct_flete === 100 ? '#ef4444' : '#f59e0b',
                            fontWeight: 600,
                          }}>
                            {o.pct_flete}%
                          </span>
                        </td>
                      </>
                    )}
                    {category === 'entregado' && (
                      <td style={{ ...s.td, textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>
                        {fmt(o.ganancia)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function JourneyModal({ period, estatus, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/orders/status-journey', { params: { period_id: period.period_id, store_id: period.store_id, estatus } })
      .then(r => setData(r.data));
  }, [estatus]);

  const pct = (count) => data && data.total ? Math.round(count / data.total * 100) : 0;

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={s.modalHead}>
          <div style={s.modalTitle}>
            📊 Evolución: {estatus}
            {data && <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 400, marginLeft: 8 }}>({data.total} pedidos en total)</span>}
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={s.modalBody}>
          {!data && <div style={s.noData}>Cargando...</div>}
          {data && data.total === 0 && <div style={s.noData}>Sin pedidos en este estado</div>}
          {data && data.total > 0 && (
            <>
              <div className="grid-4" style={s.journeyGrid}>
                <div style={s.journeyCard('#f59e0b', '#fffbeb')}>
                  <div style={s.journeyPct('#f59e0b')}>{pct(data.still_same.count)}%</div>
                  <div style={s.journeyLabel}>⏳ Sigue en {estatus}</div>
                  <div style={s.count}>{data.still_same.count} pedidos</div>
                </div>
                <div style={s.journeyCard('#22c55e', '#f0fdf4')}>
                  <div style={s.journeyPct('#22c55e')}>{pct(data.now_entregado.count)}%</div>
                  <div style={s.journeyLabel}>✅ Se entregaron</div>
                  <div style={s.count}>{data.now_entregado.count} pedidos</div>
                </div>
                <div style={s.journeyCard('#ef4444', '#fef2f2')}>
                  <div style={s.journeyPct('#ef4444')}>{pct(data.now_devolucion.count)}%</div>
                  <div style={s.journeyLabel}>↩️ Se devolvieron</div>
                  <div style={s.count}>{data.now_devolucion.count} pedidos</div>
                </div>
                <div style={s.journeyCard('#6366f1', '#eef2ff')}>
                  <div style={s.journeyPct('#6366f1')}>{pct(data.now_otro.count)}%</div>
                  <div style={s.journeyLabel}>📦 Pasaron a otro estado</div>
                  <div style={s.count}>{data.now_otro.count} pedidos</div>
                </div>
              </div>
              <div style={s.journeySummary}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>Ganancia realizada (entregados)</span>
                  <span style={{ fontWeight: 700, color: '#22c55e' }}>{fmt(data.summary.ganancia_realizada)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>Costo de devolución (devueltos)</span>
                  <span style={{ fontWeight: 700, color: '#ef4444' }}>-{fmt(data.summary.costo_devolucion_realizado)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', borderTop: '1px solid #e2e8f0', marginTop: 6 }}>
                  <span style={{ fontWeight: 700 }}>Resultado neto</span>
                  <span style={{ fontWeight: 800, color: data.summary.resultado_neto >= 0 ? '#22c55e' : '#ef4444' }}>
                    {fmt(data.summary.resultado_neto)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const [period, setPeriod] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [modal, setModal] = useState(null); // { estatus, category }
  const [journeyModal, setJourneyModal] = useState(null); // estatus string

  const load = useCallback(async (p) => {
    if (!p?.period_id) return;
    const res = await api.get('/orders/status-breakdown', {
      params: { period_id: p.period_id, store_id: p.store_id },
    });
    setBreakdown(res.data);
  }, []);

  useEffect(() => { if (period) load(period); }, [period]);

  const entregadoGroup = breakdown?.groups?.find(g => g.category === 'entregado');
  const devolucionGroup = breakdown?.groups?.find(g => g.category === 'devolucion');
  const enProcesoGroups = breakdown?.groups?.filter(g => g.category === 'en_proceso') || [];
  const otroGroups = breakdown?.groups?.filter(g => g.category === 'otro') || [];

  const enProcesoPct = enProcesoGroups.reduce((s, g) => s + g.pct, 0);
  const enProcesoCount = enProcesoGroups.reduce((s, g) => s + g.count, 0);

  return (
    <div>
      <div style={s.title}>Estado de Pedidos</div>
      <div style={s.sub}>Análisis de entregas, devoluciones y estados en curso — sin contar cancelados ni rechazados</div>

      <PeriodSelector value={period} onChange={setPeriod} />

      {!period && <div style={s.noData}>Selecciona una tienda y período para ver el estado</div>}

      {period && breakdown && breakdown.total === 0 && (
        <div style={s.noData}>No hay órdenes importadas para este período. Ve a "Cargar Excel" primero.</div>
      )}

      {period && breakdown && breakdown.total > 0 && (
        <>
          {/* Main 3 cards */}
          <div className="grid-3" style={s.grid3}>
            {/* Entregados */}
            <div
              style={{ ...s.card(CATEGORY_META.entregado.bg, CATEGORY_META.entregado.color), cursor: 'pointer' }}
              onClick={() => setModal({ estatus: 'ENTREGADO', category: 'entregado' })}
            >
              <div style={s.bigPct(CATEGORY_META.entregado.color)}>{entregadoGroup?.pct ?? 0}%</div>
              <div style={s.label}>✅ Entregados</div>
              <div style={s.count}>{entregadoGroup?.count ?? 0} pedidos de {breakdown.total}</div>
              <div style={s.bar}><div style={s.barFill(CATEGORY_META.entregado.color, entregadoGroup?.pct ?? 0)} /></div>
              <div style={s.clickHint}>Ver pedidos →</div>
            </div>

            {/* Devoluciones */}
            <div
              style={{ ...s.card(CATEGORY_META.devolucion.bg, CATEGORY_META.devolucion.color), cursor: 'pointer' }}
              onClick={() => setModal({ estatus: 'DEVOLUCION', category: 'devolucion' })}
            >
              <div style={s.bigPct(CATEGORY_META.devolucion.color)}>{devolucionGroup?.pct ?? 0}%</div>
              <div style={s.label}>↩️ Devoluciones confirmadas</div>
              <div style={s.count}>{devolucionGroup?.count ?? 0} pedidos de {breakdown.total}</div>
              <div style={s.bar}><div style={s.barFill(CATEGORY_META.devolucion.color, devolucionGroup?.pct ?? 0)} /></div>
              <div style={s.clickHint}>Ver pedidos →</div>
            </div>

            {/* En proceso devolución */}
            <div style={s.card(CATEGORY_META.en_proceso.bg, CATEGORY_META.en_proceso.color)}>
              <div style={s.bigPct(CATEGORY_META.en_proceso.color)}>{enProcesoPct.toFixed(1)}%</div>
              <div style={s.label}>⏳ En proceso de devolución</div>
              <div style={s.count}>{enProcesoCount} pedidos de {breakdown.total}</div>
              <div style={s.bar}><div style={s.barFill(CATEGORY_META.en_proceso.color, enProcesoPct)} /></div>
              <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, marginTop: 10 }}>
                Costo estimado: {fmt(breakdown.en_proceso_costo.total)}
              </div>
            </div>
          </div>

          {/* En proceso: status chips */}
          {enProcesoGroups.length > 0 && (
            <div style={{ ...s.costCard, marginBottom: 12 }}>
              <div style={s.costTitle}>⏳ En proceso de devolución — detalle por estado</div>
              <div style={s.chipsWrap}>
                {enProcesoGroups.map(g => (
                  <div key={g.estatus} style={s.chip(CATEGORY_META.en_proceso.color, CATEGORY_META.en_proceso.bg)}>
                    <span onClick={() => setModal({ estatus: g.estatus, category: 'en_proceso' })}>{g.estatus}</span>
                    <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>
                      {g.count}
                    </span>
                    <button
                      style={s.journeyBtn(CATEGORY_META.en_proceso.color)}
                      title="Ver evolución: entregados / siguen ahí / devueltos"
                      onClick={() => setJourneyModal(g.estatus)}
                    >
                      📊
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cost breakdown panel */}
          {enProcesoCount > 0 && (
            <div style={s.costCard}>
              <div style={s.costTitle}>💰 Costo estimado de devoluciones en proceso</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
                Interrapidísimo = 100% del flete · Otras transportadoras = 80% del flete
              </div>
              <div style={s.costRow}>
                <span>Interrapidísimo (100%)</span>
                <span style={{ fontWeight: 600, color: '#ef4444' }}>{fmt(breakdown.en_proceso_costo.interrapidisimo)}</span>
              </div>
              <div style={s.costRow}>
                <span>Otras transportadoras (80%)</span>
                <span style={{ fontWeight: 600, color: '#ef4444' }}>{fmt(breakdown.en_proceso_costo.otras)}</span>
              </div>
              <div style={s.costTotal}>
                <span>Total pérdida estimada</span>
                <span>{fmt(breakdown.en_proceso_costo.total)}</span>
              </div>
            </div>
          )}

          {/* Otros estados */}
          {otroGroups.length > 0 && (
            <div style={s.costCard}>
              <div style={s.costTitle}>📦 Otros estados</div>
              <div style={s.chipsWrap}>
                {otroGroups.map(g => (
                  <div
                    key={g.estatus}
                    style={s.chip(CATEGORY_META.otro.color, CATEGORY_META.otro.bg)}
                    onClick={() => setModal({ estatus: g.estatus, category: 'otro' })}
                  >
                    <span>{g.estatus}</span>
                    <span style={{ background: '#6366f1', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>
                      {g.count} · {g.pct}%
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                Haz clic en cualquier estado para ver los pedidos
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
            Total analizado: {breakdown.total} pedidos (excluye cancelados, rechazados y pendientes de confirmación)
          </div>
        </>
      )}

      {modal && period && (
        <OrdersModal
          period={period}
          estatus={modal.estatus}
          category={modal.category}
          onClose={() => setModal(null)}
        />
      )}

      {journeyModal && period && (
        <JourneyModal
          period={period}
          estatus={journeyModal}
          onClose={() => setJourneyModal(null)}
        />
      )}
    </div>
  );
}
