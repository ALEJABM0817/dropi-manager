import React, { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import PeriodSelector from '../components/PeriodSelector';

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

const s = {
  title: { fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 4 },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 20 },
  noData: { textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 },
  section: {
    background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,.06)',
    marginBottom: 20, overflow: 'hidden',
  },
  sectionHeader: (color) => ({
    padding: '16px 20px', borderLeft: `4px solid ${color}`,
  }),
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#1e293b' },
  sectionSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 20px', borderTop: '1px solid #f1f5f9', fontSize: 13,
  },
  emptyMsg: { padding: '18px 20px', color: '#94a3b8', fontSize: 13, textAlign: 'center' },
  pill: (bg, color) => ({ padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: bg, color }),
};

function Section({ title, icon, color, description, count, children }) {
  return (
    <div style={s.section}>
      <div style={s.sectionHeader(color)}>
        <div style={s.sectionTitle}>{icon} {title} {count > 0 && <span style={{ color }}>({count})</span>}</div>
        <div style={s.sectionSub}>{description}</div>
      </div>
      {count === 0 ? <div style={s.emptyMsg}>Nada que recomendar aquí este mes ✅</div> : children}
    </div>
  );
}

export default function RecommendationsPage() {
  const [period, setPeriod] = useState(null);
  const [data, setData] = useState(null);

  const load = useCallback(async (p) => {
    if (!p?.period_id) return;
    const res = await api.get('/recommendations', { params: { period_id: p.period_id, store_id: p.store_id } });
    setData(res.data);
  }, []);

  useEffect(() => { if (period) load(period); }, [period, load]);

  return (
    <div>
      <div style={s.title}>Recomendaciones</div>
      <div style={s.sub}>
        Acciones concretas calculadas a partir de los datos ya cargados: qué productos apagar o escalar,
        qué departamentos excluir, y qué transportadora usar o evitar por zona.
      </div>

      <PeriodSelector value={period} onChange={setPeriod} />

      {!period && <div style={s.noData}>Selecciona una tienda y período para ver las recomendaciones</div>}

      {period && data && (
        <>
          <Section
            title="Apagar estos productos"
            icon="🔴"
            color="#ef4444"
            description="Resultado neto negativo este mes (ingreso estimado − devoluciones − gasto en pauta), con suficiente volumen para no ser ruido"
            count={data.productos_apagar.length}
          >
            {data.productos_apagar.map(p => (
              <div key={p.grupo} style={s.row}>
                <div>
                  <div style={{ fontWeight: 600, color: '#1e293b' }}>{p.producto}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.pedidos} pedidos · {fmt(p.ad_spend)} en pauta</div>
                </div>
                <span style={s.pill('#fef2f2', '#dc2626')}>{fmt(p.resultado_neto)}</span>
              </div>
            ))}
          </Section>

          <Section
            title="Escalar estos productos"
            icon="🟢"
            color="#16a34a"
            description="Resultado neto positivo con pauta activa — ya demostraron que son rentables, vale la pena subirles presupuesto"
            count={data.productos_escalar.length}
          >
            {data.productos_escalar.map(p => (
              <div key={p.grupo} style={s.row}>
                <div>
                  <div style={{ fontWeight: 600, color: '#1e293b' }}>{p.producto}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.pedidos} pedidos · {fmt(p.ad_spend)} en pauta</div>
                </div>
                <span style={s.pill('#f0fdf4', '#16a34a')}>{fmt(p.resultado_neto)}</span>
              </div>
            ))}
          </Section>

          <Section
            title="Montar producto en departamento"
            icon="🎯"
            color="#8b5cf6"
            description='Este producto ya es rentable con pauta geo-dirigida a este departamento específico — vale la pena reforzarlo ahí. Requiere haber subido un CSV con Campaña + Región combinadas'
            count={data.producto_departamento_ganador.length}
          >
            {data.producto_departamento_ganador.map((p, i) => (
              <div key={i} style={s.row}>
                <div>
                  <div style={{ fontWeight: 600, color: '#1e293b' }}>{p.producto} <span style={{ color: '#8b5cf6' }}>→ {p.departamento}</span></div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.pedidos} pedidos · {fmt(p.ad_spend)} en pauta ahí</div>
                </div>
                <span style={s.pill('#f5f3ff', '#7c3aed')}>{fmt(p.resultado_neto)}</span>
              </div>
            ))}
          </Section>

          <Section
            title="Excluir estos departamentos"
            icon="🚫"
            color="#dc2626"
            description="Ingreso neto menos gasto en pauta da pérdida en este departamento — considera quitarlo de tu segmentación"
            count={data.departamentos_excluir.length}
          >
            {data.departamentos_excluir.map(d => (
              <div key={d.departamento} style={s.row}>
                <div>
                  <div style={{ fontWeight: 600, color: '#1e293b' }}>{d.departamento}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.pedidos} pedidos · {fmt(d.ad_spend)} en pauta</div>
                </div>
                <span style={s.pill('#fef2f2', '#dc2626')}>{fmt(d.resultado_neto)}</span>
              </div>
            ))}
          </Section>

          <Section
            title="No usar esta transportadora"
            icon="🚚"
            color="#f59e0b"
            description="% de devolución muy por encima del promedio de tus demás transportadoras este mes"
            count={data.transportadoras_evitar.length}
          >
            {data.transportadoras_evitar.map(c => (
              <div key={c.transportadora} style={s.row}>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>{c.transportadora}</div>
                <span style={s.pill('#fffbeb', '#d97706')}>{c.pct_devolucion}% devolución · {c.total} pedidos</span>
              </div>
            ))}
          </Section>

          <Section
            title="Transportadora por departamento"
            icon="🗺️"
            color="#0ea5e9"
            description="Cuando dos o más transportadoras sirven el mismo departamento con resultados muy distintos"
            count={data.transportadora_por_departamento.length}
          >
            {data.transportadora_por_departamento.map((t, i) => (
              <div key={i} style={s.row}>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>{t.departamento}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={s.pill('#f0fdf4', '#16a34a')}>Usar {t.usar} ({t.pct_devolucion_usar}%)</span>
                  <span style={s.pill('#fef2f2', '#dc2626')}>Evitar {t.evitar} ({t.pct_devolucion_evitar}%)</span>
                </div>
              </div>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}
