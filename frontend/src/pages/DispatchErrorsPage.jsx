import React, { useEffect, useState, useCallback } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/client';
import PeriodSelector from '../components/PeriodSelector';

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

const s = {
  title: { fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 4 },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 20 },
  noData: { textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 },
  summaryGrid: { marginBottom: 24 },
  summaryCard: (color, bg) => ({
    background: bg, borderRadius: 10, padding: '16px 20px',
    boxShadow: '0 1px 4px rgba(0,0,0,.06)', borderLeft: `4px solid ${color}`,
  }),
  summaryVal: (color) => ({ fontSize: 24, fontWeight: 800, color }),
  summaryLabel: { fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' },
  section: {
    background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,.06)',
    marginBottom: 20, overflow: 'hidden',
  },
  sectionHeader: (color) => ({
    padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexWrap: 'wrap', gap: 10, cursor: 'pointer', borderLeft: `4px solid ${color}`,
  }),
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#1e293b' },
  sectionSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  badge: (bg, color) => ({ padding: '4px 12px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: bg, color }),
  table: { width: '100%', minWidth: 560, borderCollapse: 'collapse' },
  th: { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b',
        textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', whiteSpace: 'nowrap' },
  td: { padding: '9px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: '#374151' },
  emptyMsg: { padding: '18px 20px', color: '#94a3b8', fontSize: 13, textAlign: 'center' },
};

function EstatusBadge({ estatus }) {
  const isDevolucion = estatus === 'DEVOLUCION';
  const isEntregado = estatus === 'ENTREGADO';
  const bg = isDevolucion ? '#fef2f2' : isEntregado ? '#f0fdf4' : '#fffbeb';
  const color = isDevolucion ? '#dc2626' : isEntregado ? '#16a34a' : '#d97706';
  return <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: bg, color }}>{estatus || '—'}</span>;
}

function Section({ title, color, icon, description, data, columns, open, onToggle }) {
  const resumen = data?.resumen || { total: 0, devoluciones: 0, costo_devoluciones: 0 };
  const items = data?.items || (data?.grupos ? data.grupos.flatMap(g => g.orders) : []);

  return (
    <div style={s.section}>
      <div style={s.sectionHeader(color)} onClick={onToggle}>
        <div>
          <div style={s.sectionTitle}>{icon} {title} {open ? '▲' : '▼'}</div>
          <div style={s.sectionSub}>{description}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={s.badge('#f1f5f9', '#374151')}>{resumen.total} detectados</span>
          {resumen.devoluciones > 0 && (
            <span style={s.badge('#fef2f2', '#dc2626')}>
              {resumen.devoluciones} devoluciones · {fmt(resumen.costo_devoluciones)}
            </span>
          )}
        </div>
      </div>
      {open && (
        items.length === 0 ? (
          <div style={s.emptyMsg}>Nada detectado este mes ✅</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>{columns.map(c => <th key={c.key} style={s.th}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    {columns.map(c => (
                      <td key={c.key} style={s.td}>{c.render ? c.render(item) : (item[c.key] ?? '—')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

export default function DispatchErrorsPage() {
  const [period, setPeriod] = useState(null);
  const [data, setData] = useState(null);
  const [openSection, setOpenSection] = useState('duplicados');

  const load = useCallback(async (p) => {
    if (!p?.period_id) return;
    const res = await api.get('/orders/dispatch-errors', { params: { period_id: p.period_id, store_id: p.store_id } });
    setData(res.data);
  }, []);

  useEffect(() => { if (period) load(period); }, [period, load]);

  const toggle = (key) => setOpenSection(prev => prev === key ? null : key);

  const CATEGORY_KEYS = [
    'duplicados_telefono', 'telefonos_invalidos', 'ciudad_incorrecta',
    'oficina_transportadora_incorrecta', 'precio_recaudo_sospechoso', 'reincidentes_devolucion',
  ];
  const sumAcross = (field) => data
    ? CATEGORY_KEYS.reduce((s, k) => s + (data[k]?.resumen?.[field] || 0), 0)
    : 0;
  const totalDetectados = sumAcross('total');
  const totalDevoluciones = sumAcross('devoluciones');
  const totalCosto = sumAcross('costo_devoluciones');

  // Same 6 categories shown on screen — kept in one place so the PDF always matches
  // exactly what's rendered (title, data key, and which extra column to include).
  const EXPORT_CATEGORIES = [
    { key: 'duplicados_telefono', title: 'Pedidos duplicados (mismo celular)',
      extraCol: null },
    { key: 'telefonos_invalidos', title: 'Celulares inválidos',
      extraCol: { label: 'Dígitos', get: r => r.digitos } },
    { key: 'ciudad_incorrecta', title: 'Ciudad de despacho equivocada',
      extraCol: { label: 'Dirección dice / se despachó a', get: r => `${r.municipio_mencionado || ''} → ${r.ciudad_despachada || ''}` } },
    { key: 'oficina_transportadora_incorrecta', title: 'Reclamo en oficina con transportadora incorrecta',
      extraCol: { label: 'Debía ser / se envió con', get: r => `${r.transportadora_esperada || ''} → ${r.transportadora || ''}` } },
    { key: 'precio_recaudo_sospechoso', title: 'Recaudo con precio sospechoso',
      extraCol: { label: 'Recaudo', get: r => fmt(r.valor_recaudo) } },
    { key: 'reincidentes_devolucion', title: 'Cliente reincidente',
      extraCol: { label: 'Devolución anterior', get: r => `${r.mes_anterior || ''} (guía ${r.guia_anterior || ''})` } },
  ];

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Errores de Despacho', 14, 18);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`${period.store_name} — ${period.month}/${period.year}`, 14, 25);
    doc.setFontSize(10);
    doc.text(`${totalDetectados} errores detectados · ${totalDevoluciones} terminaron en devolución · ${fmt(totalCosto)} de costo`, 14, 31);

    let y = 38;
    for (const cat of EXPORT_CATEGORIES) {
      const catData = data[cat.key];
      const items = catData?.items || (catData?.grupos ? catData.grupos.flatMap(g => g.orders) : []);
      if (items.length === 0) continue;

      if (y > 260) { doc.addPage(); y = 18; }
      doc.setFontSize(12);
      doc.setTextColor(30);
      doc.text(`${cat.title} (${items.length})`, 14, y);
      y += 4;

      const head = ['Fecha', 'Celular', 'Cliente', 'Ciudad', ...(cat.extraCol ? [cat.extraCol.label] : []), 'Guía', 'Estatus', 'Costo devolución'];
      const body = items.map(r => [
        r.fecha || '—', r.telefono || '—', r.cliente || '—', r.ciudad_destino || '—',
        ...(cat.extraCol ? [cat.extraCol.get(r)] : []),
        r.numero_guia || '—', r.estatus || '—',
        r.estatus === 'DEVOLUCION' ? fmt(r.costo_devolucion_flete) : '—',
      ]);

      autoTable(doc, {
        startY: y, head: [head], body,
        theme: 'striped', styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    const fileName = `Errores_Despacho_${period.store_name}_${period.month}_${period.year}`.replace(/[^\w.-]+/g, '_') + '.pdf';
    doc.save(fileName);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={s.title}>Errores de Despacho</div>
          <div style={s.sub}>
            Fallos operativos que suelen provocar una devolución: celulares duplicados o inválidos, direcciones
            despachadas a la ciudad equivocada, pedidos de reclamo en oficina enviados con la transportadora incorrecta,
            y recaudos con precios que no corresponden al catálogo.
          </div>
        </div>
        {period && data && totalDetectados > 0 && (
          <button onClick={exportPDF}
            style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none',
                     borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            ⬇️ Descargar PDF
          </button>
        )}
      </div>

      <PeriodSelector value={period} onChange={setPeriod} />

      {!period && <div style={s.noData}>Selecciona una tienda y período para ver el análisis</div>}

      {period && data && (
        <>
          <div className="grid-4" style={s.summaryGrid}>
            <div style={s.summaryCard('#f59e0b', '#fffbeb')}>
              <div style={s.summaryVal('#f59e0b')}>{totalDetectados}</div>
              <div style={s.summaryLabel}>Errores detectados</div>
            </div>
            <div style={s.summaryCard('#ef4444', '#fef2f2')}>
              <div style={s.summaryVal('#ef4444')}>{totalDevoluciones}</div>
              <div style={s.summaryLabel}>Terminaron en devolución</div>
            </div>
            <div style={s.summaryCard('#dc2626', '#fef2f2')}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#dc2626' }}>{fmt(totalCosto)}</div>
              <div style={s.summaryLabel}>Costo de esas devoluciones</div>
            </div>
            <div style={s.summaryCard('#3b82f6', '#eff6ff')}>
              <div style={s.summaryVal('#3b82f6')}>
                {totalDetectados > 0 ? Math.round((totalDevoluciones / totalDetectados) * 100) : 0}%
              </div>
              <div style={s.summaryLabel}>De los errores terminó en devolución</div>
            </div>
          </div>

          <Section
            title="Pedidos duplicados (mismo celular)"
            icon="📱"
            color="#f59e0b"
            description="Dos o más pedidos distintos este mes con el mismo número de celular, donde al menos uno no fue entregado"
            data={data.duplicados_telefono}
            open={openSection === 'duplicados'}
            onToggle={() => toggle('duplicados')}
            columns={[
              { key: 'fecha', label: 'Fecha' },
              { key: 'telefono', label: 'Celular' },
              { key: 'numero_guia', label: 'Guía' },
              { key: 'cliente', label: 'Cliente' },
              { key: 'ciudad_destino', label: 'Ciudad' },
              { key: 'estatus', label: 'Estatus', render: r => <EstatusBadge estatus={r.estatus} /> },
              { key: 'costo_devolucion_flete', label: 'Costo devolución', render: r => r.estatus === 'DEVOLUCION' ? fmt(r.costo_devolucion_flete) : '—' },
            ]}
          />

          <Section
            title="Celulares inválidos"
            icon="☎️"
            color="#8b5cf6"
            description="Menos de 10 dígitos — el transportador probablemente no pudo contactar al cliente"
            data={data.telefonos_invalidos}
            open={openSection === 'telefonos'}
            onToggle={() => toggle('telefonos')}
            columns={[
              { key: 'fecha', label: 'Fecha' },
              { key: 'telefono', label: 'Celular' },
              { key: 'digitos', label: 'Dígitos' },
              { key: 'numero_guia', label: 'Guía' },
              { key: 'cliente', label: 'Cliente' },
              { key: 'ciudad_destino', label: 'Ciudad' },
              { key: 'estatus', label: 'Estatus', render: r => <EstatusBadge estatus={r.estatus} /> },
              { key: 'costo_devolucion_flete', label: 'Costo devolución', render: r => r.estatus === 'DEVOLUCION' ? fmt(r.costo_devolucion_flete) : '—' },
            ]}
          />

          <Section
            title="Ciudad de despacho equivocada"
            icon="🗺️"
            color="#ef4444"
            description='La dirección menciona un municipio vecino (ej. Soacha, Itagüí) pero se despachó a la ciudad metro (Bogotá, Medellín, etc.)'
            data={data.ciudad_incorrecta}
            open={openSection === 'ciudad'}
            onToggle={() => toggle('ciudad')}
            columns={[
              { key: 'fecha', label: 'Fecha' },
              { key: 'telefono', label: 'Celular' },
              { key: 'municipio_mencionado', label: 'Dirección dice', render: r => r.municipio_mencionado?.charAt(0) + r.municipio_mencionado?.slice(1).toLowerCase() },
              { key: 'ciudad_despachada', label: 'Se despachó a', render: r => r.ciudad_despachada?.charAt(0) + r.ciudad_despachada?.slice(1).toLowerCase() },
              { key: 'numero_guia', label: 'Guía' },
              { key: 'cliente', label: 'Cliente' },
              { key: 'direccion', label: 'Dirección' },
              { key: 'estatus', label: 'Estatus', render: r => <EstatusBadge estatus={r.estatus} /> },
              { key: 'costo_devolucion_flete', label: 'Costo devolución', render: r => r.estatus === 'DEVOLUCION' ? fmt(r.costo_devolucion_flete) : '—' },
            ]}
          />

          <Section
            title="Reclamo en oficina con transportadora incorrecta"
            icon="🏢"
            color="#0ea5e9"
            description="La dirección pide reclamar en oficina de una transportadora, pero se envió con otra"
            data={data.oficina_transportadora_incorrecta}
            open={openSection === 'oficina'}
            onToggle={() => toggle('oficina')}
            columns={[
              { key: 'fecha', label: 'Fecha' },
              { key: 'telefono', label: 'Celular' },
              { key: 'transportadora_esperada', label: 'Debía ser', render: r => r.transportadora_esperada?.charAt(0) + r.transportadora_esperada?.slice(1).toLowerCase() },
              { key: 'transportadora', label: 'Se envió con' },
              { key: 'numero_guia', label: 'Guía' },
              { key: 'cliente', label: 'Cliente' },
              { key: 'direccion', label: 'Dirección' },
              { key: 'estatus', label: 'Estatus', render: r => <EstatusBadge estatus={r.estatus} /> },
              { key: 'costo_devolucion_flete', label: 'Costo devolución', render: r => r.estatus === 'DEVOLUCION' ? fmt(r.costo_devolucion_flete) : '—' },
            ]}
          />

          <Section
            title="Recaudo con precio sospechoso"
            icon="💲"
            color="#dc2626"
            description="El valor a cobrar no corresponde a ningún precio real del catálogo de esta tienda, y terminó en devolución"
            data={data.precio_recaudo_sospechoso}
            open={openSection === 'precio'}
            onToggle={() => toggle('precio')}
            columns={[
              { key: 'fecha', label: 'Fecha' },
              { key: 'telefono', label: 'Celular' },
              { key: 'valor_recaudo', label: 'Recaudo', render: r => fmt(r.valor_recaudo) },
              { key: 'numero_guia', label: 'Guía' },
              { key: 'cliente', label: 'Cliente' },
              { key: 'ciudad_destino', label: 'Ciudad' },
              { key: 'estatus', label: 'Estatus', render: r => <EstatusBadge estatus={r.estatus} /> },
              { key: 'costo_devolucion_flete', label: 'Costo devolución', render: r => r.estatus === 'DEVOLUCION' ? fmt(r.costo_devolucion_flete) : '—' },
            ]}
          />

          <Section
            title="Cliente reincidente (ya tuvo devolución en un mes anterior)"
            icon="🔁"
            color="#a855f7"
            description="Mismo celular ya tuvo una devolución en un mes anterior y volvió a tener devolución ahora — cruza todos los meses, no solo el actual"
            data={data.reincidentes_devolucion}
            open={openSection === 'reincidentes'}
            onToggle={() => toggle('reincidentes')}
            columns={[
              { key: 'fecha', label: 'Fecha' },
              { key: 'telefono', label: 'Celular' },
              { key: 'mes_anterior', label: 'Devolución anterior' },
              { key: 'guia_anterior', label: 'Guía anterior' },
              { key: 'numero_guia', label: 'Guía actual' },
              { key: 'cliente', label: 'Cliente' },
              { key: 'ciudad_destino', label: 'Ciudad' },
              { key: 'estatus', label: 'Estatus actual', render: r => <EstatusBadge estatus={r.estatus} /> },
              { key: 'costo_devolucion_flete', label: 'Costo devolución', render: r => r.estatus === 'DEVOLUCION' ? fmt(r.costo_devolucion_flete) : '—' },
            ]}
          />
        </>
      )}
    </div>
  );
}
