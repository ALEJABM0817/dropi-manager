import React, { useEffect, useState } from 'react';
import api from '../api/client';

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const s = {
  title: { fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 4 },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 20 },
  card: {
    background: '#fff', borderRadius: 10, padding: '20px 24px',
    boxShadow: '0 1px 4px rgba(0,0,0,.06)', marginBottom: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 14 },
  label: { fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, display: 'block' },
  select: {
    padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 14,
    background: '#fff', color: '#1e293b', cursor: 'pointer', minWidth: 200,
  },
  input: {
    padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 14,
    color: '#1e293b', width: 140,
  },
  periodsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10 },
  periodChip: (checked) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8,
    border: `1.5px solid ${checked ? '#8b5cf6' : '#e2e8f0'}`, background: checked ? '#f5f3ff' : '#fff',
    cursor: 'pointer', fontSize: 13, fontWeight: 600, color: checked ? '#6d28d9' : '#64748b',
  }),
  configGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 4 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  btnRow: { display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 },
  btn: {
    padding: '10px 20px', background: '#8b5cf6', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  btnSecondary: {
    padding: '10px 20px', background: '#f1f5f9', color: '#1e293b', border: 'none',
    borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  toggleBtn: { background: 'none', border: 'none', color: '#8b5cf6', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '8px 10px', background: '#f8fafc', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase' },
  td: { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#374151' },
  acumuladoRow: { background: '#faf5ff' },
  errorBox: { background: '#fef2f2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, fontSize: 13, marginBottom: 16 },
  noData: { textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 },
};

// Piso de bajo valor ~= 50% de la ganancia típica por ticket de cada tienda
// (CH ~35-44k, Zindra ~69-77k de utilidad neta). Un piso fijo no escala: 25k
// casi no filtra nada en Zindra, y en CH queda muy pegado al típico.
function defaultPrefixAndPiso(storeName) {
  if (!storeName) return { prefijo: 'DP', piso: 25000 };
  const upper = storeName.toUpperCase();
  if (upper.includes('ZINDRA')) return { prefijo: 'ZIN', piso: 38000 };
  if (upper.includes('CH') || upper.includes('JOYER')) return { prefijo: 'CH', piso: 20000 };
  return { prefijo: upper.replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'DP', piso: 25000 };
}

export default function MetaAudiencesPage() {
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState('');
  const [periods, setPeriods] = useState([]);
  const [selectedPeriods, setSelectedPeriods] = useState(new Set());
  const [showConfig, setShowConfig] = useState(false);
  const [cfg, setCfg] = useState({
    valor_base: 'ganancia', piso_bajo_valor: 25000,
    dias_en_riesgo: 90, dias_desinteresado: 180, apellido: 'dos', prefijo: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    api.get('/stores').then(r => {
      setStores(r.data);
      if (r.data.length) setStoreId(r.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!storeId) return;
    setResultado(null);
    setError('');
    api.get('/periods/by-store', { params: { store_id: storeId } }).then(r => {
      setPeriods(r.data);
      setSelectedPeriods(new Set(r.data.map(p => p.id)));
    });
    const store = stores.find(st => st.id == storeId);
    const { prefijo, piso } = defaultPrefixAndPiso(store?.name);
    setCfg(c => ({ ...c, prefijo, piso_bajo_valor: piso }));
  }, [storeId, stores]);

  function togglePeriod(id) {
    setSelectedPeriods(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleGenerate() {
    if (selectedPeriods.size === 0) {
      setError('Selecciona al menos un período.');
      return;
    }
    setLoading(true);
    setError('');
    setResultado(null);
    try {
      const res = await api.post('/meta-audiences/generate', {
        store_id: Number(storeId),
        period_ids: Array.from(selectedPeriods),
        valor_base: cfg.valor_base,
        piso_bajo_valor: Number(cfg.piso_bajo_valor),
        dias_en_riesgo: Number(cfg.dias_en_riesgo),
        dias_desinteresado: Number(cfg.dias_desinteresado),
        apellido: cfg.apellido,
        prefijo: cfg.prefijo || undefined,
      });
      setResultado(res.data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Error generando las audiencias.');
    } finally {
      setLoading(false);
    }
  }

  const store = stores.find(st => st.id == storeId);

  return (
    <div>
      <div style={s.title}>Audiencias Meta</div>
      <div style={s.sub}>
        Genera los CSV de Públicos Personalizados para Meta Ads a partir de los pedidos ya cargados en Dropi Manager — sin volver a subir ningún Excel.
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>1. Tienda y períodos</div>
        <label style={s.label}>Tienda</label>
        <select style={s.select} value={storeId} onChange={e => setStoreId(e.target.value)}>
          {stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>

        {periods.length === 0 && storeId && (
          <div style={{ ...s.noData, padding: 20 }}>No hay períodos cargados para esta tienda todavía.</div>
        )}

        {periods.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
              <label style={{ ...s.label, marginBottom: 0 }}>Períodos a incluir ({selectedPeriods.size} de {periods.length})</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={s.toggleBtn} onClick={() => setSelectedPeriods(new Set(periods.map(p => p.id)))}>Todos</button>
                <button style={s.toggleBtn} onClick={() => setSelectedPeriods(new Set())}>Ninguno</button>
              </div>
            </div>
            <div style={s.periodsGrid}>
              {periods.map(p => (
                <label key={p.id} style={s.periodChip(selectedPeriods.has(p.id))}>
                  <input
                    type="checkbox"
                    checked={selectedPeriods.has(p.id)}
                    onChange={() => togglePeriod(p.id)}
                    style={{ cursor: 'pointer' }}
                  />
                  {MONTHS[p.month - 1]} {p.year}
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={s.cardTitle}>2. Reglas del algoritmo (opcional)</div>
          <button style={s.toggleBtn} onClick={() => setShowConfig(v => !v)}>
            {showConfig ? 'Ocultar ▲' : 'Ajustar ▼'}
          </button>
        </div>
        {!showConfig && (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Por defecto: recibió el pedido = alto valor · piso de bajo valor {Number(cfg.piso_bajo_valor).toLocaleString('es-CO')} COP de utilidad neta ·
            {' '}en riesgo tras {cfg.dias_en_riesgo} días · dormido tras {cfg.dias_desinteresado} días.
          </div>
        )}
        {showConfig && (
          <div style={s.configGrid}>
            <div style={s.field}>
              <label style={s.label}>Base de valor</label>
              <select style={s.select} value={cfg.valor_base} onChange={e => setCfg(c => ({ ...c, valor_base: e.target.value }))}>
                <option value="ganancia">Ganancia (utilidad neta)</option>
                <option value="venta">Venta (valor facturado)</option>
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Piso de bajo valor (COP)</label>
              <input style={s.input} type="number" value={cfg.piso_bajo_valor}
                     onChange={e => setCfg(c => ({ ...c, piso_bajo_valor: e.target.value }))} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Prefijo del público en Meta</label>
              <input style={s.input} value={cfg.prefijo}
                     onChange={e => setCfg(c => ({ ...c, prefijo: e.target.value.toUpperCase() }))} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Días para "en riesgo"</label>
              <input style={s.input} type="number" value={cfg.dias_en_riesgo}
                     onChange={e => setCfg(c => ({ ...c, dias_en_riesgo: e.target.value }))} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Días para "desinteresado"</label>
              <input style={s.input} type="number" value={cfg.dias_desinteresado}
                     onChange={e => setCfg(c => ({ ...c, dias_desinteresado: e.target.value }))} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Apellido</label>
              <select style={s.select} value={cfg.apellido} onChange={e => setCfg(c => ({ ...c, apellido: e.target.value }))}>
                <option value="dos">Dos últimos apellidos</option>
                <option value="ultimo">Último apellido</option>
                <option value="todo">Todo lo que sobre del nombre</option>
              </select>
            </div>
          </div>
        )}

        <div style={s.btnRow}>
          <button
            style={{ ...s.btn, ...(loading || selectedPeriods.size === 0 ? s.btnDisabled : {}) }}
            onClick={handleGenerate}
            disabled={loading || selectedPeriods.size === 0}
          >
            {loading ? 'Generando...' : '⚡ Generar audiencias'}
          </button>
          {resultado && (
            <a
              style={s.btnSecondary}
              href={`/api/meta-audiences/download?zip_name=${encodeURIComponent(resultado.zip_name)}`}
            >
              📦 Descargar ZIP ({resultado.archivos.length} archivos)
            </a>
          )}
        </div>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {resultado && (
        <div style={s.card}>
          <div style={s.cardTitle}>
            3. Resultado — {resultado.contactos_unicos} contactos únicos de {resultado.filas_leidas} pedidos
            {store ? ` · ${store.name}` : ''}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
            Umbral alto valor: {resultado.calculo.percentil_alto_valor ?? '—'} · Umbral bajo valor: {resultado.calculo.percentil_bajo_valor ?? '—'} ·
            {' '}Corte de recencia: {resultado.calculo.fecha_referencia}
          </div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Archivo</th>
                <th style={s.th}>Público en Meta</th>
                <th style={s.th}>Etiqueta</th>
                <th style={s.th}>Personas</th>
                <th style={s.th}>¿Valor?</th>
                <th style={s.th}>Para qué sirve</th>
              </tr>
            </thead>
            <tbody>
              {resultado.archivos.map((a, i) => (
                <tr key={i} style={a.acumulado ? s.acumuladoRow : undefined}>
                  <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>{a.archivo}</td>
                  <td style={{ ...s.td, fontWeight: 600 }}>{a.nombre_publico}</td>
                  <td style={s.td}>{a.grupo_meta} › {a.etiqueta_meta}</td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: a.personas < 100 ? '#f59e0b' : '#1e293b' }}>
                    {a.personas}
                  </td>
                  <td style={s.td}>{a.basado_en_valor ? 'Sí' : 'No'}</td>
                  <td style={{ ...s.td, fontSize: 12, color: '#64748b' }}>{a.uso}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 12 }}>
            Dentro del ZIP: cada CSV listo para subir a Meta, un <code>LEEME_como_subir_a_meta.md</code> con los pasos y nombres ya armados,
            y un <code>_diagnostico_clientes.csv</code> para auditar por qué quedó cada cliente en su segmento.
          </div>
        </div>
      )}
    </div>
  );
}
