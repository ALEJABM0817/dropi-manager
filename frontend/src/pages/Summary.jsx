import React, { useEffect, useState, useCallback, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api/client';
import PeriodSelector from '../components/PeriodSelector';
import { COLOR, FONT_HEADING, RADIUS, SHADOW_CARD, pill, btnPrimary, kpiIcon } from '../theme';

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) : '0.0');
const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

// ── Inline quick-add row ──────────────────────────────────────────────────────
function QuickAddRow({ type, platform, onAdded, placeholder }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef();

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  async function handle() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await api.post('/quick-add', { name: name.trim(), type, platform });
      onAdded({ ...res.data, name: name.trim(), amount: 0 });
      setName('');
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return (
    <div
      onClick={() => setOpen(true)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', cursor: 'pointer',
               color: '#94a3b8', fontSize: 13, userSelect: 'none' }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span>
      <span>Agregar {placeholder || 'nuevo'}...</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handle(); if (e.key === 'Escape') setOpen(false); }}
        placeholder={`Nombre de ${placeholder || 'categoría'}...`}
        style={{ flex: 1, padding: '5px 8px', border: '1.5px solid #3b82f6', borderRadius: 6, fontSize: 13 }}
      />
      <button
        onClick={handle}
        disabled={loading || !name.trim()}
        style={{ padding: '5px 12px', background: '#3b82f6', color: '#fff', border: 'none',
                 borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >
        {loading ? '...' : 'Guardar'}
      </button>
      <button
        onClick={() => setOpen(false)}
        style={{ padding: '5px 8px', background: 'none', border: '1px solid #e2e8f0',
                 borderRadius: 6, fontSize: 13, cursor: 'pointer', color: '#64748b' }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Quick-add for manual counts ───────────────────────────────────────────────
function QuickAddCount({ onAdded, placeholder, countType }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef();

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  function handle() {
    if (!name.trim()) return;
    onAdded({ name: name.trim(), type: countType, quantity: 0 });
    setName('');
    setOpen(false);
  }

  if (!open) return (
    <div onClick={() => setOpen(true)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', cursor: 'pointer', color: '#94a3b8', fontSize: 12, userSelect: 'none' }}>
      <span style={{ fontSize: 14, lineHeight: 1 }}>＋</span>
      <span>Agregar {placeholder}...</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
      <input ref={inputRef} value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handle(); if (e.key === 'Escape') setOpen(false); }}
        placeholder={`Nombre...`}
        style={{ flex: 1, padding: '4px 8px', border: '1.5px solid #3b82f6', borderRadius: 6, fontSize: 12 }} />
      <button onClick={handle} disabled={!name.trim()}
        style={{ padding: '4px 10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        ✓
      </button>
      <button onClick={() => setOpen(false)}
        style={{ padding: '4px 6px', background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#64748b' }}>
        ✕
      </button>
    </div>
  );
}

// ── Editable amount cell ──────────────────────────────────────────────────────
function AmountInput({ value, onSave }) {
  const [val, setVal] = useState(value === 0 ? '' : String(value));
  useEffect(() => { setVal(value === 0 ? '' : String(value)); }, [value]);

  function handleBlur() {
    const n = Number(String(val).replace(/\./g, '').replace(',', '.')) || 0;
    onSave(n);
  }

  return (
    <input
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={e => e.key === 'Enter' && e.target.blur()}
      placeholder="0"
      style={{
        padding: '4px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6,
        fontSize: 14, width: 150, textAlign: 'right', color: '#1e293b', outline: 'none',
      }}
      onFocus={e => e.target.style.borderColor = '#3b82f6'}
      onBlurCapture={e => e.target.style.borderColor = '#e2e8f0'}
    />
  );
}

// ── Editable integer cell ─────────────────────────────────────────────────────
function IntInput({ value, onSave, width }) {
  const [val, setVal] = useState(value === 0 ? '' : String(value));
  useEffect(() => { setVal(value === 0 ? '' : String(value)); }, [value]);

  function handleBlur() {
    const n = parseInt(String(val).replace(/\./g, '').replace(/,/g, '')) || 0;
    onSave(n);
  }

  return (
    <input
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={e => e.key === 'Enter' && e.target.blur()}
      placeholder="0"
      style={{
        padding: '4px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6,
        fontSize: 13, width: width || 90, textAlign: 'right', color: '#1e293b', outline: 'none',
      }}
      onFocus={e => e.target.style.borderColor = '#3b82f6'}
      onBlurCapture={e => e.target.style.borderColor = '#e2e8f0'}
    />
  );
}

// ── Section block ─────────────────────────────────────────────────────────────
function Section({ title, total, totalColor, children }) {
  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '9px 0', borderBottom: '1.5px solid #e2e8f0' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>{title}</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: totalColor || '#1e293b' }}>{typeof total === 'string' ? total : fmt(total)}</span>
      </div>
      <div style={{ paddingLeft: 8 }}>{children}</div>
    </div>
  );
}

function PctBadge({ value, size }) {
  const v = parseFloat(value);
  const bg = v >= 70 ? '#f0fdf4' : v >= 50 ? '#fffbeb' : '#fef2f2';
  const color = v >= 70 ? '#16a34a' : v >= 50 ? '#d97706' : '#dc2626';
  return <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: size || 12, fontWeight: 700, background: bg, color }}>{value}%</span>;
}

// ── Proyección de utilidad ──────────────────────────────────────────────────
// "Bruto" = TOTAL proyectado (misma fórmula que el TOTAL de arriba), "Neto" = TOTAL sin el
// 10% de reserva. Solo los pedidos que AÚN NO tienen desenlace final pueden convertirse en
// entregas futuras — eso es más que el "en_proceso" angosto que usa el resto de la app
// (RECLAME EN OFICINA, EN BODEGA...): aquí cuenta cualquier estado que no sea ENTREGADO ni
// una devolución ya confirmada (novedad, novedad solucionada, despachada, tránsito urbano,
// asignado, etc. — todo lo que todavía puede llegar a entregarse). Por eso `pendienteCount`
// se calcula afuera como total − entregados − devoluciones, no como el en_proceso del resto
// de la app. Flete y publicidad ya están gastados (son fijos); lo único que varía por pedido
// extra entregado es su ganancia promedio (ingreso − costo de producto, que es justo lo que
// ya representa el campo "ganancia" de Dropi por pedido).
function buildProjectionSteps({ totalOrders, entregadoCount, pendienteCount, avgGanancia, baseTotal }) {
  if (!totalOrders || entregadoCount == null) return null;
  const currentPct = (entregadoCount / totalOrders) * 100;
  const maxDeliverable = entregadoCount + (pendienteCount || 0);
  const maxPct = Math.min(100, (maxDeliverable / totalOrders) * 100);
  const steps = [];
  let p = Math.floor(currentPct / 5) * 5 + 5;
  while (p < maxPct - 0.5) { steps.push(Math.round(p)); p += 5; }
  const lastWhole = Math.floor(maxPct);
  if (lastWhole > currentPct + 0.5 && (steps.length === 0 || lastWhole > steps[steps.length - 1])) {
    steps.push(lastWhole);
  }
  const rows = steps.map(pct => {
    const targetCount = Math.min(maxDeliverable, Math.round((pct / 100) * totalOrders));
    const extraOrders = Math.max(0, targetCount - entregadoCount);
    const bruto = baseTotal + extraOrders * (avgGanancia || 0);
    return { pct, extraOrders, bruto, neto: bruto * 0.9 };
  });
  return { currentPct, maxPct, maxDeliverable, pendienteCount: pendienteCount || 0, baseTotal, baseNeto: baseTotal * 0.9, rows };
}

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const t2 = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(ar + (br - ar) * t2)},${Math.round(ag + (bg - ag) * t2)},${Math.round(ab + (bb - ab) * t2)})`;
}

function ProjectionCard({ title, subtitle, data }) {
  if (!data) return null;
  const { currentPct, maxPct, baseTotal, baseNeto, rows, maxDeliverable, pendienteCount } = data;
  return (
    <div style={{ background: '#fff', borderRadius: RADIUS.card, padding: '20px 24px', boxShadow: SHADOW_CARD, border: `1px solid ${COLOR.border}`, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span style={{ fontFamily: FONT_HEADING, fontSize: 14.5, fontWeight: 700, color: COLOR.inkSoft }}>{title}</span>
      </div>
      <div style={{ fontSize: 12, color: COLOR.textMuted, marginBottom: 16 }}>
        {subtitle || `Tasa actual ${currentPct.toFixed(0)}% de entrega. Solo varía ingreso y costo de producto — flete y publicidad ya están fijos.`}
      </div>

      {/* HOY */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', background: '#F8F9FC', borderRadius: 10, marginBottom: rows.length ? 10 : 0 }}>
        <div style={{ width: 70, fontSize: 12, fontWeight: 700, color: COLOR.textMuted, flexShrink: 0 }}>HOY · {currentPct.toFixed(0)}%</div>
        <div style={{ flex: 1, height: 8, borderRadius: 4, background: COLOR.border, overflow: 'hidden' }}>
          <div style={{ width: `${currentPct}%`, height: '100%', background: '#94A3B8', borderRadius: 4 }} />
        </div>
        <div style={{ textAlign: 'right', minWidth: 120 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLOR.ink }}>{fmt(baseTotal)}</div>
          <div style={{ fontSize: 10.5, color: COLOR.textMuted }}>Bruto</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: COLOR.textMuted, padding: '8px 2px' }}>
          {pendienteCount > 0
            ? `Quedan ${pendienteCount} pedido${pendienteCount === 1 ? '' : 's'} pendiente${pendienteCount === 1 ? '' : 's'} (sin desenlace final todavía), pero no alcanzan para subir ni un 5% más — el ${maxPct.toFixed(1)}% es el máximo posible este mes, muy cerca del ${currentPct.toFixed(1)}% actual.`
            : `No quedan pedidos pendientes este mes — el ${currentPct.toFixed(0)}% actual ya es el resultado final.`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r, i) => {
            const t = (r.pct - currentPct) / Math.max(1, 100 - currentPct);
            const barColor = lerpColor('#A3E635', '#16A34A', t);
            return (
              <div key={r.pct} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 10,
                                        background: i === rows.length - 1 ? '#F0FDF4' : 'transparent', border: `1px solid ${i === rows.length - 1 ? '#BBF7D0' : 'transparent'}` }}>
                <div style={{ width: 70, flexShrink: 0 }}>
                  <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                                 border: `1.5px solid ${barColor}`, color: barColor }}>
                    {r.pct}%
                  </span>
                </div>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: COLOR.border, overflow: 'hidden' }}>
                  <div style={{ width: `${r.pct}%`, height: '100%', background: barColor, borderRadius: 4 }} />
                </div>
                <div style={{ textAlign: 'right', minWidth: 150 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: barColor }}>{fmt(r.bruto)}</div>
                  <div style={{ fontSize: 10.5, color: COLOR.textMuted }}>Bruto</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: barColor, marginTop: 2 }}>{fmt(r.neto)}</div>
                  <div style={{ fontSize: 10.5, color: COLOR.textMuted }}>Neto · +{r.extraOrders} pedidos</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const s = {
  title: { fontFamily: FONT_HEADING, fontSize: 24, fontWeight: 700, color: COLOR.ink, letterSpacing: '-0.4px', marginBottom: 4 },
  sub:   { fontSize: 13.5, color: COLOR.textMuted, marginBottom: 22 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 },
  card:  (color) => ({
    background: '#fff', borderRadius: RADIUS.card, padding: '18px 22px',
    boxShadow: SHADOW_CARD, border: `1px solid ${COLOR.border}`, borderTop: `3px solid ${color}`,
  }),
  cardTitle: { fontSize: 11, fontWeight: 700, color: COLOR.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 },
  cardVal:   (color) => ({ fontSize: 25, fontWeight: 800, color, letterSpacing: '-0.4px' }),
  cardSub:   { fontSize: 12, color: COLOR.textMuted, marginTop: 3 },
  table: {
    background: '#fff', borderRadius: RADIUS.card, padding: '22px 26px',
    boxShadow: SHADOW_CARD, border: `1px solid ${COLOR.border}`, marginBottom: 16,
  },
  tableTitle: { fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 700, color: COLOR.inkSoft, marginBottom: 16 },
  divider: { borderTop: `2px solid ${COLOR.ink}`, margin: '10px 0' },
  totalRow: { display: 'flex', justifyContent: 'space-between', padding: '9px 0', fontWeight: 700, fontSize: 15 },
  noData: { textAlign: 'center', padding: 48, color: COLOR.textMuted, fontSize: 14 },
};

export default function Summary() {
  const [period, setPeriod]         = useState(null);
  const [summary, setSummary]       = useState(null);
  const [incomes, setIncomes]       = useState([]);
  const [adInvestments, setAdInvestments] = useState([]);
  const [expenses, setExpenses]     = useState([]);
  const [includeEnProceso, setIncludeEnProceso] = useState(false);
  const [showEnProcesoModal, setShowEnProcesoModal] = useState(false);
  const [totalPedidosShopify, setTotalPedidosShopify] = useState(0);
  const [totalPedidosWhatsapp, setTotalPedidosWhatsapp] = useState(0);
  const totalPedidos = (totalPedidosShopify || 0) + (totalPedidosWhatsapp || 0);
  const [manualCounts, setManualCounts] = useState([]);
  const [byCarrier, setByCarrier]   = useState([]);
  const [expandedCarrier, setExpandedCarrier] = useState(null);
  const [campaignSpend, setCampaignSpend] = useState(0);
  const [productLines, setProductLines] = useState([]);
  const [productsModalLinea, setProductsModalLinea] = useState(null); // 'HOMBRE' | 'DAMA' | null

  const load = useCallback(async (p) => {
    if (!p?.period_id) return;
    const [sumRes, incRes, adRes, expRes, mcRes, carrierRes, campaignsRes, prodRes] = await Promise.all([
      api.get('/orders/summary',        { params: { period_id: p.period_id, store_id: p.store_id } }),
      api.get('/income',                { params: { period_id: p.period_id, store_id: p.store_id } }),
      api.get('/ad-accounts/investments',{ params: { period_id: p.period_id, store_id: p.store_id } }),
      api.get('/expenses',              { params: { period_id: p.period_id, store_id: p.store_id } }),
      api.get('/manual-counts',         { params: { period_id: p.period_id, store_id: p.store_id } }),
      api.get('/orders/by-carrier',     { params: { period_id: p.period_id, store_id: p.store_id } }),
      api.get('/ad-campaigns',          { params: { period_id: p.period_id, store_id: p.store_id } }),
      api.get('/product-orders/summary',{ params: { period_id: p.period_id, store_id: p.store_id } }),
    ]);
    setSummary(sumRes.data);
    setIncomes(incRes.data);
    setAdInvestments(adRes.data);
    setExpenses(expRes.data);
    setCampaignSpend(campaignsRes.data.reduce((s, c) => s + (c.spend || 0), 0));
    setTotalPedidosShopify(sumRes.data.total_pedidos_shopify || 0);
    setTotalPedidosWhatsapp(sumRes.data.total_pedidos_whatsapp || 0);
    setManualCounts(mcRes.data);
    setByCarrier(carrierRes.data.carriers || []);
    setProductLines(prodRes.data.products || []);
  }, []);

  useEffect(() => { if (period) load(period); }, [period]);

  // ── Save helpers ────────────────────────────────────────────────────────────
  async function saveIncome(categoryId, amount) {
    await api.post('/income', { period_id: period.period_id, store_id: period.store_id, category_id: categoryId, amount });
  }
  async function saveAd(adAccountId, amount) {
    await api.post('/ad-accounts/investments', { period_id: period.period_id, store_id: period.store_id, ad_account_id: adAccountId, amount });
  }
  async function saveExpense(categoryId, amount) {
    await api.post('/expenses', { period_id: period.period_id, store_id: period.store_id, category_id: categoryId, amount });
  }
  async function saveTotalPedidosShopify(val) {
    setTotalPedidosShopify(val);
    await api.patch(`/periods/${period.period_id}/total-pedidos`, { total_pedidos_shopify: val, total_pedidos_whatsapp: totalPedidosWhatsapp });
  }
  async function saveTotalPedidosWhatsapp(val) {
    setTotalPedidosWhatsapp(val);
    await api.patch(`/periods/${period.period_id}/total-pedidos`, { total_pedidos_shopify: totalPedidosShopify, total_pedidos_whatsapp: val });
  }
  async function saveManualCount(name, type, quantity) {
    await api.post('/manual-counts', { period_id: period.period_id, store_id: period.store_id, name, type, quantity });
  }

  // ── Quick-add callbacks ─────────────────────────────────────────────────────
  // Categories are global (shared by name across stores), so GET already returned this
  // category — possibly with amount 0 for this store+period — before the user quick-added
  // it. Reusing that existing entry (instead of pushing a second one with the same
  // category_id) avoids duplicate rows that both react to the same category_id updates.
  function handleIncomeAdded(item) {
    setIncomes(prev => {
      const idx = prev.findIndex(x => x.category_id === item.category_id);
      if (idx >= 0) return prev.map((x, i) => i === idx ? { ...x, _new: true } : x);
      return [...prev, { ...item, amount: 0, _new: true }];
    });
  }
  function handleAdAdded(item) {
    setAdInvestments(prev => {
      const idx = prev.findIndex(x => x.ad_account_id === item.id);
      if (idx >= 0) return prev.map((x, i) => i === idx ? { ...x, _new: true } : x);
      return [...prev, { ad_account_id: item.id, name: item.name, platform: 'meta', amount: 0, _new: true }];
    });
  }
  function handleExpenseAdded(item) {
    setExpenses(prev => {
      const idx = prev.findIndex(x => x.category_id === item.category_id);
      if (idx >= 0) return prev.map((x, i) => i === idx ? { ...x, _new: true } : x);
      return [...prev, { ...item, amount: 0, _new: true }];
    });
  }
  function handleManualCountAdded(item) { setManualCounts(prev => [...prev, item]); }

  // ── Remove helpers (only remove entry for THIS period+store, not the global category) ──
  async function removeIncome(categoryId) {
    await api.delete('/income/entry', { params: { category_id: categoryId, period_id: period.period_id, store_id: period.store_id } });
    setIncomes(prev => prev.map(i => i.category_id === categoryId ? { ...i, amount: 0 } : i).filter(i => i.amount > 0 || i.category_id !== categoryId));
  }
  async function removeAd(adAccountId) {
    await api.delete(`/ad-accounts/${adAccountId}/investment`, { params: { period_id: period.period_id, store_id: period.store_id } });
    setAdInvestments(prev => prev.map(a => a.ad_account_id === adAccountId ? { ...a, amount: 0 } : a).filter(a => a.amount > 0 || a.ad_account_id !== adAccountId));
  }
  async function removeExpense(categoryId) {
    await api.delete('/expenses/entry', { params: { category_id: categoryId, period_id: period.period_id, store_id: period.store_id } });
    setExpenses(prev => prev.map(e => e.category_id === categoryId ? { ...e, amount: 0 } : e).filter(e => e.amount > 0 || e.category_id !== categoryId));
  }
  async function removeManualCount(name, type) {
    await api.delete('/manual-counts', { params: { period_id: period.period_id, store_id: period.store_id, name, type } });
    setManualCounts(prev => prev.filter(m => !(m.name === name && m.type === type)));
  }

  // ── Calculations ────────────────────────────────────────────────────────────
  const entregado        = summary?.entregado?.total || 0;
  const entregadoCount   = summary?.entregado?.count || 0;
  const devolucion       = summary?.devolucion?.total || 0;
  const devolucionCount  = summary?.devolucion?.count || 0;
  const enProcesoCosto   = summary?.en_proceso?.costo_estimado || 0;
  const enProcesoCount   = summary?.en_proceso?.count || 0;
  const totalOrders      = summary?.total_orders || 0;
  const devolucionTotal  = devolucion + (includeEnProceso ? enProcesoCosto : 0);
  const totalIncome      = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalPublicidadManual = adInvestments.reduce((s, a) => s + (a.amount || 0), 0);
  // If a Meta/TikTok campaign CSV was uploaded this month (Cargar Excel → Publicidad), its
  // real total replaces the manual entry below — avoids keeping two numbers in sync by hand.
  const usingCampaignSpend = campaignSpend > 0;
  const totalPublicidad  = usingCampaignSpend ? campaignSpend : totalPublicidadManual;
  const totalGastos      = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const total            = entregado + totalIncome - devolucionTotal - totalPublicidad - totalGastos;
  const valor10          = total * 0.1;
  const totalSin10       = total - valor10;
  // Valor DIAN: 3.5% of total entregado (Dropi). For Zindra, the base also includes
  // "Otros ingresos" (e.g. "Entregado Bogota" / proveedor entries) per the user's own rule.
  // Shown as its own independent scenario — NOT stacked on top of the 10% deduction.
  const isZindra         = (period?.store_name || '').toLowerCase().includes('zindra');
  const valorDianBase    = entregado + (isZindra ? totalIncome : 0);
  const valorDian        = valorDianBase * 0.035;
  const totalSinDian     = total - valorDian;

  // Zindra Hombre vs Dama: a virtual split of the SAME store for this mini P&L only —
  // not a real second store. Ad spend comes directly from each product's mapped campaigns
  // (real money, already tracked per product). Everything that has NO per-product source —
  // "Otros gastos", "Otros ingresos" (manual entries like "Proveedor Bogotá"), en-proceso cost
  // when the checkbox is on, and any ad spend/ingreso/devolución that isn't attributable to a
  // specific product — is allocated by each line's share of despachados (dispatched orders)
  // this period. This keeps Hombre + Dama always adding up exactly to the main TOTAL above.
  const lineaStats = {
    HOMBRE: { total: 0, ingreso: 0, costoDev: 0, adSpend: 0, entregados: 0, devoluciones: 0 },
    DAMA: { total: 0, ingreso: 0, costoDev: 0, adSpend: 0, entregados: 0, devoluciones: 0 },
  };
  for (const p of productLines) {
    const bucket = p.linea === 'DAMA' ? lineaStats.DAMA : lineaStats.HOMBRE;
    bucket.total += p.total || 0;
    bucket.ingreso += p.ingreso_estimado || 0;
    bucket.costoDev += p.costo_devolucion_estimado || 0;
    bucket.adSpend += p.ad_spend || 0;
    bucket.entregados += p.entregados || 0;
    bucket.devoluciones += p.devoluciones || 0;
  }
  const totalDespachados = lineaStats.HOMBRE.total + lineaStats.DAMA.total;
  const showLineas = isZindra && lineaStats.DAMA.total > 0;
  const sumIngresoProductos = lineaStats.HOMBRE.ingreso + lineaStats.DAMA.ingreso;
  const sumCostoDevProductos = lineaStats.HOMBRE.costoDev + lineaStats.DAMA.costoDev;
  const sumAdSpendProductos = lineaStats.HOMBRE.adSpend + lineaStats.DAMA.adSpend;
  // "Otros ingresos" (ej. Proveedor Bogotá) siempre ha sido de productos de Hombre, así que
  // va completo a esa línea — no se reparte. Lo que sí se reparte proporcionalmente es
  // cualquier residuo que el dato por producto no haya cubierto (ej. un pedido sin línea
  // de producto asociada), para que nada se pierda sin asignar.
  const ingresoSinAsignarProducto = Math.max(0, entregado - sumIngresoProductos);
  const costoDevSinAsignar  = Math.max(0, devolucion - sumCostoDevProductos) + (includeEnProceso ? enProcesoCosto : 0);
  const adSpendSinAsignar   = Math.max(0, totalPublicidad - sumAdSpendProductos);
  function lineaResultado(key) {
    const b = lineaStats[key];
    const share = totalDespachados > 0 ? b.total / totalDespachados : 0;
    const otrosIngresos = key === 'HOMBRE' ? totalIncome : 0;
    const ingresoProducto = b.ingreso + ingresoSinAsignarProducto * share;
    const ingreso = ingresoProducto + otrosIngresos;
    const costoDev = b.costoDev + costoDevSinAsignar * share;
    const adSpend = b.adSpend + adSpendSinAsignar * share;
    const otrosAsignados = totalGastos * share;
    const resultado = ingreso - costoDev - adSpend - otrosAsignados;
    // Same base Valor DIAN uses above (entregado + otros ingresos para Zindra) — per línea
    // esto es exactamente "ingreso" de esta línea, así que Hombre+Dama suma el mismo
    // valorDianBase y valorDian del resumen principal. Escenario independiente, no se resta del resultado.
    const valorDian = ingreso * 0.035;
    const resultadoSinDian = resultado - valorDian;
    return { total: b.total, share, ingresoProducto, ingreso, costoDev, adSpend, otrosAsignados, otrosIngresos, resultado, valorDian, resultadoSinDian };
  }

  // ── Proyección de utilidad ──────────────────────────────────────────────────
  // Siempre usa devoluciones confirmadas (nunca el estimado de "en proceso", sin importar
  // el checkbox de arriba) como línea base — los pedidos pendientes son justo el grupo que
  // se está proyectando que se conviertan en entrega, así que no pueden contar dos veces.
  // "Pendiente" = todo lo que no es ENTREGADO ni DEVOLUCION confirmada (novedad, novedad
  // solucionada, despachada, tránsito, asignado, reclame en oficina, etc.) — más amplio que
  // el "en_proceso" angosto que usa el resto de la app (que solo mira el camino a devolución).
  const totalForProjection = entregado + totalIncome - devolucion - totalPublicidad - totalGastos;
  const avgGananciaEntregado = entregadoCount > 0 ? entregado / entregadoCount : 0;
  const pendienteCount = Math.max(0, totalOrders - entregadoCount - devolucionCount);
  const storeProjection = buildProjectionSteps({
    totalOrders, entregadoCount, pendienteCount, avgGanancia: avgGananciaEntregado, baseTotal: totalForProjection,
  });

  const costoDevSinAsignarBase = Math.max(0, devolucion - sumCostoDevProductos);
  function lineaBaseTotal(key) {
    const b = lineaStats[key];
    const share = totalDespachados > 0 ? b.total / totalDespachados : 0;
    const otrosIngresos = key === 'HOMBRE' ? totalIncome : 0;
    const ingreso = b.ingreso + ingresoSinAsignarProducto * share + otrosIngresos;
    const costoDev = b.costoDev + costoDevSinAsignarBase * share;
    const adSpend = b.adSpend + adSpendSinAsignar * share;
    const otrosAsignados = totalGastos * share;
    return ingreso - costoDev - adSpend - otrosAsignados;
  }
  const hombreProjection = showLineas ? buildProjectionSteps({
    totalOrders: lineaStats.HOMBRE.total, entregadoCount: lineaStats.HOMBRE.entregados,
    pendienteCount: Math.max(0, lineaStats.HOMBRE.total - lineaStats.HOMBRE.entregados - lineaStats.HOMBRE.devoluciones),
    avgGanancia: lineaStats.HOMBRE.entregados > 0 ? lineaStats.HOMBRE.ingreso / lineaStats.HOMBRE.entregados : 0,
    baseTotal: lineaBaseTotal('HOMBRE'),
  }) : null;
  const damaProjection = showLineas ? buildProjectionSteps({
    totalOrders: lineaStats.DAMA.total, entregadoCount: lineaStats.DAMA.entregados,
    pendienteCount: Math.max(0, lineaStats.DAMA.total - lineaStats.DAMA.entregados - lineaStats.DAMA.devoluciones),
    avgGanancia: lineaStats.DAMA.entregados > 0 ? lineaStats.DAMA.ingreso / lineaStats.DAMA.entregados : 0,
    baseTotal: lineaBaseTotal('DAMA'),
  }) : null;

  // Manual counts
  const manualEntregados = manualCounts.filter(m => m.type === 'entregado');
  const manualDevoluciones = manualCounts.filter(m => m.type === 'devolucion');
  const totalManualEntregados = manualEntregados.reduce((s, m) => s + (m.quantity || 0), 0);
  const totalManualDevoluciones = manualDevoluciones.reduce((s, m) => s + (m.quantity || 0), 0);
  const totalEntregadosGlobal = entregadoCount + totalManualEntregados;
  const totalDevolucionesGlobal = devolucionCount + totalManualDevoluciones;
  const totalDespachadosGlobal = totalOrders + totalManualEntregados + totalManualDevoluciones;

  function exportPDF() {
    const periodLabel = `${MONTHS[period.month - 1]} ${period.year}`;
    // style: 'section' (bold header), 'total' (bold, colored), 'sub' (indented detail), 'normal'
    const rows = [
      { cells: ['Entregado Dropi', fmt(entregado)], style: 'section' },
      { cells: ['Otros ingresos', fmt(totalIncome)], style: 'section' },
      ...incomes.filter(i => i.amount > 0).map(i => ({ cells: [i.name, fmt(i.amount)], style: 'sub' })),
      { cells: ['Devoluciones' + (includeEnProceso ? ' + En proceso' : ''), `(${fmt(devolucionTotal)})`], style: 'section' },
      { cells: ['Devoluciones confirmadas', fmt(devolucion)], style: 'sub' },
      ...(includeEnProceso ? [{ cells: ['En proceso (estimado)', fmt(enProcesoCosto)], style: 'sub' }] : []),
      { cells: ['Publicidad', `(${fmt(totalPublicidad)})`], style: 'section' },
      ...(usingCampaignSpend
        ? [{ cells: ['Gasto real de campañas (CSV)', fmt(campaignSpend)], style: 'sub' }]
        : adInvestments.filter(a => a.amount > 0).map(a => ({ cells: [a.name, fmt(a.amount)], style: 'sub' }))),
      { cells: ['Otros gastos', `(${fmt(totalGastos)})`], style: 'section' },
      ...expenses.filter(e => e.amount > 0).map(e => ({ cells: [e.name, fmt(e.amount)], style: 'sub' })),
      { cells: ['TOTAL', fmt(total)], style: 'total' },
      { cells: ['Valor 10% (reserva impuestos)', `(${fmt(valor10)})`], style: 'normal' },
      { cells: ['TOTAL SIN 10% (ganancia final)', fmt(totalSin10)], style: 'total' },
      { cells: ['Valor DIAN (3.5%)', `(${fmt(valorDian)})`], style: 'normal' },
      { cells: ['TOTAL SIN DIAN', fmt(totalSinDian)], style: 'total' },
    ];
    if (showLineas) {
      for (const key of ['HOMBRE', 'DAMA']) {
        const r = lineaResultado(key);
        rows.push({ cells: [`Zindra ${key === 'DAMA' ? 'Dama' : 'Hombre'}`, `${r.total} despachados (${(r.share * 100).toFixed(1)}%)`], style: 'section' });
        rows.push({ cells: ['Ingreso estimado (producto)', fmt(r.ingresoProducto)], style: 'sub' });
        if (r.otrosIngresos > 0) rows.push({ cells: ['Otros ingresos', fmt(r.otrosIngresos)], style: 'sub' });
        rows.push({ cells: ['Costo devolución', `(${fmt(r.costoDev)})`], style: 'sub' });
        rows.push({ cells: ['Gasto en pauta', `(${fmt(r.adSpend)})`], style: 'sub' });
        rows.push({ cells: ['Otros gastos asignados', `(${fmt(r.otrosAsignados)})`], style: 'sub' });
        rows.push({ cells: ['Ganancia / pérdida', fmt(r.resultado)], style: 'total' });
        rows.push({ cells: ['Valor DIAN (3.5%)', `(${fmt(r.valorDian)})`], style: 'normal' });
        rows.push({ cells: ['Ganancia sin DIAN', fmt(r.resultadoSinDian)], style: 'total' });
      }
    }

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Cierre de Mes', 14, 18);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`${period.store_name} — ${periodLabel}`, 14, 25);

    autoTable(doc, {
      startY: 32,
      head: [['Concepto', 'Valor']],
      body: rows.map(r => r.cells),
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' } },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const style = rows[data.row.index].style;
        if (style === 'section') { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [241, 245, 249]; }
        else if (style === 'sub') { data.cell.styles.textColor = [100, 116, 139]; if (data.column.index === 0) data.cell.text = ['    ' + data.cell.text]; }
        else if (style === 'total') { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fontSize = 11; data.cell.styles.fillColor = [238, 242, 255]; data.cell.styles.textColor = [55, 48, 163]; }
      },
    });

    const fileName = `Cierre_${period.store_name}_${periodLabel}`.replace(/[^\w.-]+/g, '_') + '.pdf';
    doc.save(fileName);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={s.title}>Resumen de Cierre</div>
          <div style={s.sub}>Todos los campos se guardan automáticamente al salir.</div>
        </div>
        {period && summary && (
          <button onClick={exportPDF} style={{ ...btnPrimary, whiteSpace: 'nowrap' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3V15M12 15L7 10M12 15L17 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 17V19A2 2 0 0 0 6 21H18A2 2 0 0 0 20 19V17" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Descargar PDF
          </button>
        )}
      </div>

      <PeriodSelector value={period} onChange={setPeriod} />

      {!period && <div style={s.noData}>Selecciona una tienda y período para comenzar</div>}

      {period && summary && (
        <>
          {/* ═══ SECCIÓN 1: RESUMEN DE ESTADO (del Excel) ═══ */}
          <div style={s.table}>
            <div style={s.tableTitle}>Resumen de Estado · Del Excel</div>

            {/* Status cards */}
            <div className="grid-4" style={{ marginBottom: 18, marginTop: 14 }}>
              <div style={{ background: '#F8F9FC', borderRadius: 12, padding: '14px 16px' }}>
                <div style={kpiIcon('#E0E7FF', '#C7D2FE')}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" stroke="#4F46E5" strokeWidth="1.8" /><path d="M3.3 7L12 12L20.7 7M12 12V21.5" stroke="#4F46E5" strokeWidth="1.8" /></svg>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: COLOR.ink, marginTop: 10, letterSpacing: '-0.4px' }}>{totalOrders}</div>
                <div style={{ fontSize: 11.5, color: COLOR.textMuted, fontWeight: 600, marginTop: 2 }}>Despachados</div>
              </div>
              <div style={{ background: '#F8F9FC', borderRadius: 12, padding: '14px 16px' }}>
                <div style={kpiIcon('#DCFCE7', '#BBF7D0')}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 13L9 17L19 7" stroke="#16A34A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: COLOR.success, marginTop: 10, letterSpacing: '-0.4px' }}>{entregadoCount}</div>
                <div style={{ fontSize: 11.5, color: COLOR.textMuted, fontWeight: 600, marginTop: 2 }}>Entregados · {pct(entregadoCount, totalOrders)}%</div>
              </div>
              <div style={{ background: '#F8F9FC', borderRadius: 12, padding: '14px 16px' }}>
                <div style={kpiIcon('#FEE2E2', '#FECACA')}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M19 13L15 9M15 9L19 5M15 9H9.5C6.5 9 5 10.5 5 13.5V19" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: COLOR.danger, marginTop: 10, letterSpacing: '-0.4px' }}>{devolucionCount}</div>
                <div style={{ fontSize: 11.5, color: COLOR.textMuted, fontWeight: 600, marginTop: 2 }}>Devoluciones · {pct(devolucionCount, totalOrders)}%</div>
              </div>
              <div style={{ background: '#F8F9FC', borderRadius: 12, padding: '14px 16px' }}>
                <div style={kpiIcon('#FEF3C7', '#FDE68A')}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#D97706" strokeWidth="1.9" /><path d="M12 7V12L15.5 14" stroke="#D97706" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: COLOR.warning, marginTop: 10, letterSpacing: '-0.4px' }}>{enProcesoCount}</div>
                <div style={{ fontSize: 11.5, color: COLOR.textMuted, fontWeight: 600, marginTop: 2 }}>En proceso · {pct(enProcesoCount, totalOrders)}%</div>
              </div>
            </div>

            {/* Status donut */}
            {(() => {
              const otrosCount = Math.max(0, totalOrders - entregadoCount - devolucionCount - enProcesoCount);
              const donutData = [
                { name: 'Entregados', value: entregadoCount, color: COLOR.accent },
                { name: 'Devoluciones', value: devolucionCount, color: COLOR.danger },
                { name: 'En proceso', value: enProcesoCount, color: COLOR.warning },
                ...(otrosCount > 0 ? [{ name: 'Otros', value: otrosCount, color: '#94A3B8' }] : []),
              ].filter(d => d.value > 0);
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ width: 150, height: 150, flexShrink: 0, position: 'relative' }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={donutData} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%"
                             paddingAngle={2} stroke="none">
                          {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip formatter={(v, n) => [`${v} pedidos`, n]}
                                 contentStyle={{ borderRadius: 10, border: `1px solid ${COLOR.border}`, fontSize: 12.5 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                                  alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <div style={{ fontFamily: FONT_HEADING, fontSize: 20, fontWeight: 800, color: COLOR.ink }}>
                        {pct(entregadoCount, totalOrders)}%
                      </div>
                      <div style={{ fontSize: 10.5, color: COLOR.textMuted, fontWeight: 600 }}>entregados</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {donutData.map((d, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, display: 'inline-block' }} />
                        <span style={{ color: COLOR.text, fontWeight: 500 }}>{d.name}</span>
                        <span style={{ color: COLOR.ink, fontWeight: 700 }}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Detail of otros status */}
            {summary.otros_status?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Detalle otros status:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {summary.otros_status.map((st, i) => (
                    <span key={i} style={{ padding: '3px 10px', borderRadius: 8, background: '#fffbeb',
                      color: '#d97706', fontSize: 12, fontWeight: 600 }}>
                      {st.estatus} ({st.count})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ═══ SECCIÓN 2: EMBUDO DE PEDIDOS ═══ */}
          <div style={s.table}>
            <div style={s.tableTitle}>Embudo de Pedidos</div>

            {/* Tabla resumen de métricas */}
            <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, minWidth: 560 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Métrica</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Cantidad</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>% sobre despacho</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>% sobre pedidos</th>
                </tr>
              </thead>
              <tbody>
                {/* Total pedidos */}
                <tr>
                  <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                    Total de pedidos (Tienda)
                    <span style={{ marginLeft: 6, fontSize: 10, background: '#f1f5f9', color: '#94a3b8', padding: '1px 6px', borderRadius: 8 }}>manual</span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{totalPedidos}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#94a3b8', fontSize: 12 }}>—</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#1e293b' }}>100%</td>
                </tr>
                {/* Shopify sub-row */}
                <tr style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '6px 12px 6px 28px', fontSize: 12, color: '#64748b' }}>↳ Shopify</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                    <IntInput value={totalPedidosShopify} onSave={saveTotalPedidosShopify} width={110} />
                  </td>
                  <td style={{ padding: '6px 12px' }} />
                  <td style={{ padding: '6px 12px' }} />
                </tr>
                {/* WhatsApp sub-row */}
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <td style={{ padding: '6px 12px 6px 28px', fontSize: 12, color: '#64748b' }}>↳ WhatsApp</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                    <IntInput value={totalPedidosWhatsapp} onSave={saveTotalPedidosWhatsapp} width={110} />
                  </td>
                  <td style={{ padding: '6px 12px' }} />
                  <td style={{ padding: '6px 12px' }} />
                </tr>
                {/* Despachados */}
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13, color: '#3b82f6' }}>Despachados</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#3b82f6' }}>{totalDespachadosGlobal}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {totalPedidos > 0 ? <PctBadge value={pct(totalDespachadosGlobal, totalPedidos)} /> : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#94a3b8', fontSize: 12 }}>—</td>
                </tr>
                {/* Entregados */}
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: '#22c55e', fontWeight: 600 }}>Entregados</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#22c55e' }}>{totalEntregadosGlobal}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <PctBadge value={pct(totalEntregadosGlobal, totalDespachadosGlobal)} />
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {totalPedidos > 0 ? <PctBadge value={pct(totalEntregadosGlobal, totalPedidos)} /> : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                </tr>
                {/* Devoluciones */}
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: '#ef4444', fontWeight: 600 }}>Devoluciones</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#ef4444' }}>{totalDevolucionesGlobal}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: '#fef2f2', color: '#dc2626' }}>
                      {pct(totalDevolucionesGlobal, totalDespachadosGlobal)}%
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {totalPedidos > 0
                      ? <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: '#fef2f2', color: '#dc2626' }}>{pct(totalDevolucionesGlobal, totalPedidos)}%</span>
                      : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                </tr>
                {/* En proceso */}
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: '#f59e0b', fontWeight: 600 }}>En proceso</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#f59e0b' }}>{enProcesoCount}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: '#fffbeb', color: '#d97706' }}>
                      {pct(enProcesoCount, totalDespachadosGlobal)}%
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {totalPedidos > 0
                      ? <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: '#fffbeb', color: '#d97706' }}>{pct(enProcesoCount, totalPedidos)}%</span>
                      : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                </tr>
              </tbody>
            </table>
            </div>

            {/* Detalle: desglose Excel vs manuales */}
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>Desglose</div>
              <div className="grid-2">
                {/* Col izq: Entregados */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', marginBottom: 4 }}>ENTREGADOS ({totalEntregadosGlobal})</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, color: '#64748b' }}>
                    <span>Dropi (excel)</span><span style={{ fontWeight: 600 }}>{entregadoCount}</span>
                  </div>
                  {manualEntregados.map(m => (
                    <div key={m.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 12, color: '#64748b' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>{m.name}</span>
                        <button onClick={() => removeManualCount(m.name, 'entregado')}
                          style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 10 }}>✕</button>
                      </div>
                      <IntInput value={m.quantity || 0} onSave={n => {
                        saveManualCount(m.name, 'entregado', n);
                        setManualCounts(prev => prev.map(x => x.name === m.name && x.type === 'entregado' ? { ...x, quantity: n } : x));
                      }} width={70} />
                    </div>
                  ))}
                  <QuickAddCount placeholder="entregado (ej: Bogotá)" countType="entregado"
                    onAdded={item => handleManualCountAdded(item)} />
                </div>
                {/* Col der: Devoluciones */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>DEVOLUCIONES ({totalDevolucionesGlobal})</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, color: '#64748b' }}>
                    <span>Dropi (excel)</span><span style={{ fontWeight: 600 }}>{devolucionCount}</span>
                  </div>
                  {manualDevoluciones.map(m => (
                    <div key={m.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 12, color: '#64748b' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>{m.name}</span>
                        <button onClick={() => removeManualCount(m.name, 'devolucion')}
                          style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 10 }}>✕</button>
                      </div>
                      <IntInput value={m.quantity || 0} onSave={n => {
                        saveManualCount(m.name, 'devolucion', n);
                        setManualCounts(prev => prev.map(x => x.name === m.name && x.type === 'devolucion' ? { ...x, quantity: n } : x));
                      }} width={70} />
                    </div>
                  ))}
                  <QuickAddCount placeholder="devolución (ej: Bogotá)" countType="devolucion"
                    onAdded={item => handleManualCountAdded(item)} />
                </div>
              </div>
            </div>
          </div>

          {/* ═══ SECCIÓN 2.5: POR TRANSPORTADORA ═══ */}
          {byCarrier.length > 0 && (
            <div style={s.table}>
              <div style={s.tableTitle}>Por Transportadora</div>
              <div className="table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Transportadora</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Despachados</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Entregados</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Devoluciones</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>En proceso</th>
                    <th style={{ padding: '10px 12px', width: 30 }} />
                  </tr>
                </thead>
                <tbody>
                  {byCarrier.map(c => (
                    <React.Fragment key={c.transportadora}>
                      <tr style={{ borderBottom: '1px solid #f1f5f9', cursor: c.otros_status.length ? 'pointer' : 'default' }}
                        onClick={() => c.otros_status.length && setExpandedCarrier(prev => prev === c.transportadora ? null : c.transportadora)}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{c.transportadora}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#3b82f6' }}>{c.despachados}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#22c55e' }}>{c.entregados}</div>
                          <PctBadge value={c.pct_entregados} size={11} />
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#ef4444' }}>{c.devoluciones}</div>
                          <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: '#fef2f2', color: '#dc2626' }}>{c.pct_devoluciones}%</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#f59e0b' }}>{c.en_proceso}</div>
                          <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: '#fffbeb', color: '#d97706' }}>{c.pct_en_proceso}%</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                          {c.otros_status.length ? (expandedCarrier === c.transportadora ? '▲' : '▼') : ''}
                        </td>
                      </tr>
                      {expandedCarrier === c.transportadora && c.otros_status.length > 0 && (
                        <tr>
                          <td colSpan={6} style={{ padding: '4px 12px 14px 24px', background: '#f8fafc' }}>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, fontWeight: 700 }}>Detalle en proceso:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {c.otros_status.map((st, i) => (
                                <span key={i} style={{ padding: '3px 10px', borderRadius: 8, background: '#fffbeb',
                                  color: '#d97706', fontSize: 12, fontWeight: 600 }}>
                                  {st.estatus} ({st.count})
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* ═══ SECCIÓN 3: CIERRE FINANCIERO ═══ */}
          <div style={s.table}>
            <div style={s.tableTitle}>Cierre Mensual · {period.store_name}</div>

            {/* ENTREGADO DROPI */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>
                Entregado Dropi
                <span style={{ marginLeft: 6, fontSize: 11, background: '#f0fdf4', color: '#16a34a', padding: '1px 6px', borderRadius: 8 }}>del excel</span>
              </span>
              <span style={{ fontWeight: 600, color: '#22c55e', fontSize: 13 }}>{fmt(entregado)}</span>
            </div>

            {/* DYNAMIC INCOMES */}
            <Section title="Otros ingresos" total={totalIncome} totalColor="#22c55e">
              {incomes.filter(inc => inc.amount > 0 || inc._new).map((inc, i) => (
                <div key={inc.category_id || i}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                           padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>{inc.name}</span>
                    <button onClick={() => removeIncome(inc.category_id)}
                      style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 11 }}>✕</button>
                  </div>
                  <AmountInput value={inc.amount || 0} onSave={n => {
                    saveIncome(inc.category_id, n);
                    setIncomes(prev => prev.map(x => x.category_id === inc.category_id ? { ...x, amount: n } : x));
                  }} />
                </div>
              ))}
              {period && <QuickAddRow type="income" placeholder="ingreso / proveedor" onAdded={handleIncomeAdded} />}
            </Section>

            {/* DEVOLUCIONES */}
            <div style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '9px 0', borderBottom: '1.5px solid #e2e8f0' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>
                  Devoluciones{includeEnProceso ? ' + En proceso' : ''}
                </span>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#ef4444' }}>({fmt(devolucionTotal)})</span>
              </div>
              <div style={{ paddingLeft: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>
                    Devoluciones confirmadas
                    <span style={{ marginLeft: 6, fontSize: 11, background: '#fef2f2', color: '#dc2626', padding: '1px 6px', borderRadius: 8 }}>del excel</span>
                  </span>
                  <span style={{ fontWeight: 600, color: '#ef4444', fontSize: 13 }}>{fmt(devolucion)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ position: 'relative', width: 36, height: 20, cursor: 'pointer' }}>
                      <input type="checkbox" checked={includeEnProceso}
                        onChange={e => setIncludeEnProceso(e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                      <span style={{ position: 'absolute', inset: 0, borderRadius: 10,
                        background: includeEnProceso ? '#f59e0b' : '#cbd5e1', transition: 'background 0.2s' }}>
                        <span style={{ position: 'absolute', top: 2, left: includeEnProceso ? 18 : 2,
                          width: 16, height: 16, borderRadius: '50%', background: '#fff',
                          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                      </span>
                    </label>
                    <span style={{ fontSize: 13, color: includeEnProceso ? '#d97706' : '#94a3b8' }}>
                      En proceso ({enProcesoCount} pedidos)
                    </span>
                    <span style={{ fontSize: 11, background: '#fffbeb', color: '#d97706', padding: '1px 6px', borderRadius: 8 }}>estimado</span>
                    {enProcesoCount > 0 && (
                      <button onClick={() => setShowEnProcesoModal(true)}
                        style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6,
                                 padding: '2px 8px', fontSize: 11, color: '#3b82f6', cursor: 'pointer' }}>
                        ver pedidos
                      </button>
                    )}
                  </div>
                  <span style={{ fontWeight: 600, color: includeEnProceso ? '#d97706' : '#94a3b8', fontSize: 13 }}>
                    {fmt(enProcesoCosto)}
                  </span>
                </div>
              </div>
            </div>

            {/* PUBLICIDAD */}
            <Section title="📣 Publicidad" total={totalPublicidad} totalColor="#f59e0b">
              {usingCampaignSpend && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
                              padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#1e40af' }}>
                  ✓ Usando el gasto real de las campañas cargadas en <strong>Cargar Excel → Publicidad</strong>: {fmt(campaignSpend)}.
                  {totalPublicidadManual > 0 && (
                    <> Las cuentas de abajo (suma manual: {fmt(totalPublicidadManual)}) quedan solo de referencia y no se usan en el total mientras haya campañas cargadas.</>
                  )}
                </div>
              )}
              {adInvestments.filter(ad => ad.amount > 0 || ad._new).map((ad) => (
                <div key={ad.ad_account_id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                           padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>{ad.name}</span>
                    <span style={{ fontSize: 11, background: '#f1f5f9', color: '#94a3b8',
                                   padding: '1px 6px', borderRadius: 8, textTransform: 'uppercase' }}>{ad.platform}</span>
                    <button onClick={() => removeAd(ad.ad_account_id)}
                      style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 11 }}>✕</button>
                  </div>
                  <AmountInput value={ad.amount || 0} onSave={n => {
                    saveAd(ad.ad_account_id, n);
                    setAdInvestments(prev => prev.map(x => x.ad_account_id === ad.ad_account_id ? { ...x, amount: n } : x));
                  }} />
                </div>
              ))}
              {period && <QuickAddRow type="ad" placeholder="cuenta publicitaria" onAdded={handleAdAdded} />}
            </Section>

            {/* OTROS GASTOS */}
            <Section title="💸 Otros gastos" total={totalGastos} totalColor="#8b5cf6">
              {/* Categories this store has ever actually paid show up every month at $0 until
                  edited — they're fixed/recurring costs, no need to re-add them by hand monthly. */}
              {expenses.filter(exp => exp.amount > 0 || exp._new || exp.usual_for_store).map((exp) => (
                <div key={exp.category_id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                           padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>{exp.name}</span>
                    <button onClick={() => removeExpense(exp.category_id)}
                      style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 11 }}>✕</button>
                  </div>
                  <AmountInput value={exp.amount || 0} onSave={n => {
                    saveExpense(exp.category_id, n);
                    setExpenses(prev => prev.map(x => x.category_id === exp.category_id ? { ...x, amount: n } : x));
                  }} />
                </div>
              ))}
              {period && <QuickAddRow type="expense" placeholder="gasto / servicio" onAdded={handleExpenseAdded} />}
            </Section>

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
          </div>

          {/* ═══ PROYECCIÓN DE UTILIDAD ═══ */}
          {showLineas ? (
            <>
              <ProjectionCard title={`Proyección de utilidad — Zindra Hombre`} data={hombreProjection} />
              <ProjectionCard title={`Proyección de utilidad — Zindra Dama`} data={damaProjection} />
            </>
          ) : (
            <ProjectionCard title="Proyección de utilidad" data={storeProjection} />
          )}

          {showLineas && (
            <div style={s.table}>
              <div style={s.tableTitle}>Zindra Hombre vs Dama (mini-resumen)</div>
              <div style={{ fontSize: 12, color: '#94a3b8', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
                Separación solo para este mini-resumen, no es una tienda nueva. El gasto en pauta es el real de cada línea
                (según las campañas asignadas por producto). "Otros ingresos" (ej. Proveedor Bogotá) va completo a Hombre.
                Lo demás que no se puede dividir por producto — otros gastos, y el costo de en proceso si lo activas arriba —
                se reparte según el % de pedidos despachados de cada línea este mes. Hombre + Dama siempre debe sumar
                exactamente el TOTAL de arriba.
              </div>
              <div className="grid-2">
                {['HOMBRE', 'DAMA'].map(key => {
                  const r = lineaResultado(key);
                  const icon = key === 'DAMA' ? '👗' : '👔';
                  const color = r.resultado >= 0 ? '#2563eb' : '#dc2626';
                  return (
                    <div key={key} style={{ background: key === 'DAMA' ? '#fdf2f8' : '#eff6ff', borderRadius: 10, padding: '14px 18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                          {icon} Zindra {key === 'DAMA' ? 'Dama' : 'Hombre'}
                        </div>
                        <button onClick={() => setProductsModalLinea(key)}
                          style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 7,
                                   padding: '3px 10px', fontSize: 11.5, fontWeight: 600, color: COLOR.accent, cursor: 'pointer' }}>
                          Ver productos
                        </button>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                        {r.total} despachados ({(r.share * 100).toFixed(1)}%)
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                        <span>Ingreso estimado (producto)</span><span style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(r.ingresoProducto)}</span>
                      </div>
                      {r.otrosIngresos > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                          <span>Otros ingresos</span><span style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(r.otrosIngresos)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                        <span>Costo devolución</span><span style={{ color: '#dc2626', fontWeight: 600 }}>({fmt(r.costoDev)})</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                        <span>Gasto en pauta</span><span style={{ color: '#d97706', fontWeight: 600 }}>({fmt(r.adSpend)})</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                        <span>Otros gastos asignados</span><span style={{ color: '#d97706', fontWeight: 600 }}>({fmt(r.otrosAsignados)})</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, padding: '8px 0 0', borderTop: '1px solid #e2e8f0', marginTop: 6, color }}>
                        <span>Ganancia / pérdida</span><span>{fmt(r.resultado)}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginTop: 10, marginBottom: 2 }}>
                        Supuesto independiente
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, padding: '3px 0', color: '#dc2626' }}>
                        <span>Valor DIAN (3.5%)</span><span>({fmt(r.valorDian)})</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, padding: '3px 0', color: '#dc2626' }}>
                        <span>Ganancia sin DIAN</span><span>{fmt(r.resultadoSinDian)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PRODUCTOS POR LÍNEA (HOMBRE/DAMA) MODAL */}
          {productsModalLinea && (() => {
            const items = productLines
              .filter(p => (p.linea === 'DAMA' ? 'DAMA' : 'HOMBRE') === productsModalLinea)
              .slice()
              .sort((a, b) => (b.total || 0) - (a.total || 0));
            const icon = productsModalLinea === 'DAMA' ? '👗' : '👔';
            return (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex',
                            justifyContent: 'center', alignItems: 'flex-start', paddingTop: 50, zIndex: 1000 }}
                onClick={() => setProductsModalLinea(null)}>
                <div style={{ background: '#fff', borderRadius: RADIUS.card, padding: '24px 28px', maxWidth: 820, width: '95%',
                              maxHeight: '80vh', overflow: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,.15)' }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontFamily: FONT_HEADING, fontSize: 18, fontWeight: 700, color: COLOR.ink }}>
                        {icon} Productos — Zindra {productsModalLinea === 'DAMA' ? 'Dama' : 'Hombre'}
                      </div>
                      <div style={{ fontSize: 13, color: COLOR.textMuted }}>{items.length} productos asignados a esta línea</div>
                    </div>
                    <button onClick={() => setProductsModalLinea(null)}
                      style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                  </div>
                  {items.length === 0 ? (
                    <div style={s.noData}>No hay productos asignados a esta línea todavía.</div>
                  ) : (
                    <div className="table-scroll">
                      <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#FAFAFD' }}>
                            {['Producto', 'Despachados', 'Entregados', 'Devoluciones', 'Resultado neto'].map((h, i) => (
                              <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right',
                                color: COLOR.textFaint, fontWeight: 700, fontSize: 11, textTransform: 'uppercase',
                                borderBottom: `1px solid ${COLOR.border}` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((p, i) => (
                            <tr key={p.grupo || i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                              <td style={{ padding: '7px 12px', fontWeight: 600, color: COLOR.inkSoft }}>{p.producto}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right' }}>{p.total}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right', color: COLOR.success, fontWeight: 600 }}>{p.entregados}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right', color: COLOR.danger, fontWeight: 600 }}>{p.devoluciones}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700,
                                color: (p.resultado_neto || 0) >= 0 ? COLOR.success : COLOR.danger }}>
                                {fmt(p.resultado_neto)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
            Los valores se guardan automáticamente al salir del campo (Enter o clic fuera)
          </div>

          {/* EN PROCESO MODAL */}
          {showEnProcesoModal && summary?.en_proceso_orders && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex',
                          justifyContent: 'center', alignItems: 'flex-start', paddingTop: 50, zIndex: 1000 }}
              onClick={() => setShowEnProcesoModal(false)}>
              <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', maxWidth: 950, width: '95%',
                            maxHeight: '80vh', overflow: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,.15)' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Pedidos en proceso de devolución</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      {enProcesoCount} pedidos · Costo estimado: {fmt(enProcesoCosto)}
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#94a3b8' }}>(Interrapidísimo = 100% flete, Otras = 80% flete)</span>
                    </div>
                  </div>
                  <button onClick={() => setShowEnProcesoModal(false)}
                    style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Guía','Cliente','Estado','Transportadora','Destino','Flete','Costo est.'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Flete' || h === 'Costo est.' ? 'right' : 'left',
                          color: '#64748b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.en_proceso_orders.map((o, i) => {
                      const isInter = ['INTERRAPIDISIMO','INTERRAPIDÍSIMO','IR'].includes((o.transportadora||'').toUpperCase());
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 12 }}>{o.numero_guia}</td>
                          <td style={{ padding: '7px 10px' }}>{o.nombre_cliente}</td>
                          <td style={{ padding: '7px 10px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 8, background: '#fffbeb', color: '#d97706', fontSize: 12, fontWeight: 600 }}>
                              {o.estatus}
                            </span>
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            {o.transportadora}
                            <span style={{ marginLeft: 4, fontSize: 10, color: isInter ? '#ef4444' : '#f59e0b' }}>{isInter ? '100%' : '80%'}</span>
                          </td>
                          <td style={{ padding: '7px 10px', fontSize: 12 }}>{o.ciudad_destino}, {o.departamento_destino}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b' }}>{fmt(o.precio_flete)}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#d97706' }}>{fmt(o.costo_estimado)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                      <td colSpan={6} style={{ padding: '10px', textAlign: 'right' }}>Total costo estimado:</td>
                      <td style={{ padding: '10px', textAlign: 'right', color: '#d97706', fontSize: 15 }}>{fmt(enProcesoCosto)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
