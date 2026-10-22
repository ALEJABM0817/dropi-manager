import React, { useEffect, useState, useRef, useCallback } from 'react';
import api from '../api/client';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Default to last month's closing (the one usually being uploaded), not the current one.
function previousMonth() {
  const now = new Date();
  let month = now.getMonth(); // getMonth() is 0-indexed, so this is already "last month" 1-indexed...
  let year = now.getFullYear();
  if (month === 0) { month = 12; year -= 1; } // ...except in January, where it must roll back to December
  return { month, year };
}

const s = {
  title: { fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 4 },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 24 },
  card: { background: '#fff', borderRadius: 10, padding: '28px 32px', boxShadow: '0 1px 4px rgba(0,0,0,.06)', maxWidth: 560, marginBottom: 20 },
  group: { marginBottom: 18 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  select: { width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 14, background: '#fff' },
  dropzone: (drag, hasFile) => ({
    border: `2px dashed ${drag ? '#3b82f6' : hasFile ? '#22c55e' : '#cbd5e1'}`,
    borderRadius: 10, padding: '28px 16px', textAlign: 'center',
    background: drag ? '#eff6ff' : hasFile ? '#f0fdf4' : '#f8fafc', cursor: 'pointer',
    transition: 'all 0.2s', marginBottom: 12,
  }),
  dropText: { fontSize: 13, color: '#64748b' },
  dropFile: { fontSize: 13, color: '#22c55e', fontWeight: 600, marginTop: 6 },
  btn: (disabled) => ({
    width: '100%', padding: '11px', background: disabled ? '#94a3b8' : '#3b82f6',
    color: '#fff', border: 'none', borderRadius: 7, fontSize: 15, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  result: (ok) => ({
    marginTop: 12, padding: '10px 14px', borderRadius: 7,
    background: ok ? '#f0fdf4' : '#fef2f2',
    color: ok ? '#16a34a' : '#dc2626',
    fontSize: 13, fontWeight: 600,
  }),
};

function FileDropzone({ label, icon, file, onFile, accept, dragState }) {
  const ref = useRef();
  const [drag, setDrag] = dragState;
  return (
    <div
      style={s.dropzone(drag, !!file)}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
      onClick={() => ref.current.click()}
    >
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }}
        onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
      <div style={s.dropText}>{icon} {label}</div>
      {file && <div style={s.dropFile}>✓ {file.name}</div>}
    </div>
  );
}

const fmt = n => '$ ' + Math.round(n || 0).toLocaleString('es-CO');

function MergeProductsCard({ storeId, products, onMerged }) {
  const [fromKey, setFromKey] = useState('');
  const [intoKey, setIntoKey] = useState('');
  const [aliases, setAliases] = useState([]);
  const [msg, setMsg] = useState(null);

  const loadAliases = useCallback(async () => {
    if (!storeId) return;
    const r = await api.get('/product-aliases', { params: { store_id: storeId } });
    setAliases(r.data);
  }, [storeId]);

  useEffect(() => { loadAliases(); }, [loadAliases]);

  async function handleMerge() {
    if (!fromKey || !intoKey || fromKey === intoKey) return;
    const target = products.find(p => p.key === intoKey);
    if (!target) return;
    try {
      await api.post('/product-aliases', {
        store_id: storeId, from_key: fromKey, into_key: intoKey, into_label: target.label,
      });
      setMsg({ ok: true, text: '✓ Productos fusionados' });
      setFromKey(''); setIntoKey('');
      loadAliases();
      onMerged?.();
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.detail || 'Error al fusionar' });
    }
  }

  async function handleUnmerge(id) {
    await api.delete(`/product-aliases/${id}`);
    loadAliases();
    onMerged?.();
  }

  if (products.length < 2) return null;

  return (
    <div style={s.card}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>🔗 Fusionar productos duplicados</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
        Si el mismo producto aparece con nombres distintos (ej: "Collar Girasol" y "Collar Girasol Giratorio"),
        fusiónalos aquí para que compartan el mismo gasto de pauta y reporte financiero.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 8, alignItems: 'end', marginBottom: 10 }}>
        <div>
          <label style={s.label}>Producto duplicado</label>
          <select style={s.select} value={fromKey} onChange={e => setFromKey(e.target.value)}>
            <option value="">Selecciona...</option>
            {products.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div style={{ paddingBottom: 9, color: '#94a3b8' }}>→</div>
        <div>
          <label style={s.label}>Es el mismo que</label>
          <select style={s.select} value={intoKey} onChange={e => setIntoKey(e.target.value)}>
            <option value="">Selecciona...</option>
            {products.filter(p => p.key !== fromKey).map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <button
          style={{ ...s.btn(!fromKey || !intoKey || fromKey === intoKey), width: 'auto', padding: '9px 16px' }}
          onClick={handleMerge}
          disabled={!fromKey || !intoKey || fromKey === intoKey}
        >
          Fusionar
        </button>
      </div>

      {msg && <div style={s.result(msg.ok)}>{msg.text}</div>}

      {aliases.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Fusiones activas</div>
          {aliases.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                      padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
              <span style={{ color: '#64748b' }}>
                <span style={{ color: '#94a3b8' }}>{a.raw_key}</span> → <strong style={{ color: '#1e293b' }}>{a.canonical_label}</strong>
              </span>
              <button onClick={() => handleUnmerge(a.id)}
                style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 12 }}>
                deshacer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdSpendCard({ periodId, storeId, products, departments }) {
  const [platform, setPlatform] = useState('META');
  const [accountLabel, setAccountLabel] = useState('');
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [batches, setBatches] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [regions, setRegions] = useState([]);

  const loadAll = useCallback(async () => {
    if (!periodId) return;
    const params = { period_id: periodId, store_id: storeId };
    const [batchesRes, campaignsRes, regionsRes] = await Promise.all([
      api.get('/ad-spend/batches', { params }),
      api.get('/ad-campaigns', { params }),
      api.get('/ad-region-spend', { params }),
    ]);
    setBatches(batchesRes.data);
    setCampaigns(campaignsRes.data);
    setRegions(regionsRes.data);
  }, [periodId, storeId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleUploadCsv() {
    if (!file || !periodId) return;
    setLoading(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('period_id', periodId);
      form.append('store_id', storeId);
      form.append('platform', platform);
      form.append('account_label', accountLabel);
      const res = await api.post('/ad-spend/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const parts = [];
      if (res.data.campaigns_imported) parts.push(`${res.data.campaigns_imported} campañas`);
      if (res.data.regions_imported) parts.push(`${res.data.regions_imported} regiones`);
      setMsg({ ok: true, text: `✓ ${parts.join(' · ')} importadas` });
      setFile(null);
      loadAll();
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.detail || 'Error al importar el CSV' });
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteBatch(platform, accountLabel) {
    if (!window.confirm(`¿Eliminar toda la carga de ${platform} · ${accountLabel || 'sin nombre'}? Esto borra sus campañas y regiones de este período.`)) return;
    await api.delete('/ad-spend/clear', { params: { period_id: periodId, store_id: storeId, platform, account_label: accountLabel } });
    loadAll();
  }

  async function handleMapCampaign(campaignId, producto) {
    setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, producto } : c));
    await api.patch(`/ad-campaigns/${campaignId}`, { producto });
  }
  async function handleRemoveCampaign(campaignId) {
    await api.delete(`/ad-campaigns/${campaignId}`);
    setCampaigns(prev => prev.filter(c => c.id !== campaignId));
  }
  async function handleFixRegion(regionRaw, departamento) {
    if (!departamento) return;
    await api.post('/region-aliases', { store_id: storeId, region_raw: regionRaw, departamento });
    loadAll();
  }
  async function handleRemoveRegion(id) {
    await api.delete(`/ad-region-spend/${id}`);
    setRegions(prev => prev.filter(r => r.id !== id));
  }

  const totalCampaignSpend = campaigns.reduce((sum, c) => sum + (c.spend || 0), 0);
  const unmappedCampaigns = campaigns.filter(c => !c.producto).length;
  const totalRegionSpend = regions.reduce((sum, r) => sum + (r.spend || 0), 0);
  const unmatchedRegions = regions.filter(r => !r.departamento);

  const campaignGroups = {};
  campaigns.forEach(c => {
    const key = `${c.platform} · ${c.account_label || 'Sin nombre'}`;
    (campaignGroups[key] = campaignGroups[key] || []).push(c);
  });
  const regionGroups = {};
  regions.forEach(r => {
    const key = `${r.platform} · ${r.account_label || 'Sin nombre'}`;
    (regionGroups[key] = regionGroups[key] || []).push(r);
  });

  return (
    <div style={s.card}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>📢 Publicidad (Campaña + Departamento)</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 18 }}>
        Carga <strong>un solo CSV</strong> por cuenta publicitaria: si en Meta/TikTok activas los desgloses
        "Campaign name" y "Region" al mismo tiempo, este archivo alimenta ambos reportes (por producto y por departamento)
        a la vez. Si tu export solo trae uno de los dos, también funciona — se llena solo lo que traiga.
        <br />⚠️ La región de Meta/TikTok es la ubicación estimada de quien vio el anuncio, no siempre coincide con el
        departamento real de envío — el cruce geográfico es una aproximación.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={s.label}>Plataforma</label>
          <select style={s.select} value={platform} onChange={e => setPlatform(e.target.value)}>
            <option value="META">Meta (Facebook/Instagram)</option>
            <option value="TIKTOK">TikTok</option>
          </select>
        </div>
        <div>
          <label style={s.label}>Cuenta publicitaria (etiqueta)</label>
          <input style={s.select} placeholder="ej: cp1" value={accountLabel}
            onChange={e => setAccountLabel(e.target.value)} />
        </div>
      </div>

      <FileDropzone
        label="CSV de gasto (campaña y/o región)"
        icon="📄"
        file={file}
        onFile={setFile}
        accept=".csv"
        dragState={[drag, setDrag]}
      />

      <button style={s.btn(!file || loading)} onClick={handleUploadCsv} disabled={!file || loading}>
        {loading ? 'Importando...' : 'Cargar CSV'}
      </button>

      {msg && <div style={s.result(msg.ok)}>{msg.text}</div>}

      {batches.length > 0 && (
        <div style={{ marginTop: 18, background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Cargas de este período</div>
          {batches.map(b => (
            <div key={`${b.platform}-${b.account_label}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13 }}>
              <span style={{ color: '#374151' }}>
                {b.platform} · {b.account_label || 'Sin nombre'}
                {b.campaigns > 0 && <span style={{ color: '#94a3b8' }}> — {b.campaigns} campañas ({fmt(b.campaigns_spend)})</span>}
                {b.regions > 0 && <span style={{ color: '#94a3b8' }}> — {b.regions} regiones ({fmt(b.regions_spend)})</span>}
              </span>
              <button onClick={() => handleDeleteBatch(b.platform, b.account_label)}
                style={{ padding: '3px 10px', background: '#fff', border: '1px solid #fca5a5', borderRadius: 6,
                         fontSize: 11, color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
                Eliminar carga
              </button>
            </div>
          ))}
        </div>
      )}

      {campaigns.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
              📦 Por producto — {campaigns.length} campañas · {fmt(totalCampaignSpend)} gastado
            </div>
            {unmappedCampaigns > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#d97706', background: '#fffbeb', padding: '3px 10px', borderRadius: 10 }}>
                {unmappedCampaigns} sin asignar a producto
              </span>
            )}
          </div>

          {Object.entries(campaignGroups).map(([groupName, rows]) => (
            <div key={groupName} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>{groupName}</div>
              {rows.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ flex: 1, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.campaign_name}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', minWidth: 100, textAlign: 'right' }}>
                    {fmt(c.spend)}
                  </div>
                  <select
                    value={c.producto || ''}
                    onChange={e => handleMapCampaign(c.id, e.target.value)}
                    style={{ ...s.select, width: 220, padding: '5px 8px', fontSize: 12,
                             borderColor: c.producto ? '#22c55e' : '#f59e0b' }}
                  >
                    <option value="">— Sin asignar —</option>
                    {products.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                  <button onClick={() => handleRemoveCampaign(c.id)}
                    style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {regions.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
              🗺️ Por departamento — {regions.length} regiones · {fmt(totalRegionSpend)} gastado
            </div>
            {unmatchedRegions.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#d97706', background: '#fffbeb', padding: '3px 10px', borderRadius: 10 }}>
                {unmatchedRegions.length} sin reconocer
              </span>
            )}
          </div>

          {Object.entries(regionGroups).map(([groupName, groupRows]) => (
            <div key={groupName} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>{groupName}</div>
              {groupRows.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ flex: 1, fontSize: 13, color: '#1e293b' }}>{r.region_raw}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', minWidth: 100, textAlign: 'right' }}>
                    {fmt(r.spend)}
                  </div>
                  {r.departamento ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', background: '#f0fdf4',
                                    padding: '3px 10px', borderRadius: 10, minWidth: 140, textAlign: 'center' }}>
                      ✓ {r.departamento}
                    </span>
                  ) : (
                    <select defaultValue="" onChange={e => handleFixRegion(r.region_raw, e.target.value)}
                      style={{ ...s.select, width: 200, padding: '5px 8px', fontSize: 12, borderColor: '#f59e0b' }}>
                      <option value="">¿Qué departamento es?</option>
                      {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  )}
                  <button onClick={() => handleRemoveRegion(r.id)}
                    style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Upload() {
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState('');
  const [year, setYear] = useState(previousMonth().year);
  const [month, setMonth] = useState(previousMonth().month);
  const [fileOrders, setFileOrders] = useState(null);
  const [fileProducts, setFileProducts] = useState(null);
  const [dragOrders, setDragOrders] = useState(false);
  const [dragProducts, setDragProducts] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [loadedData, setLoadedData] = useState(null);
  const [checkingPeriod, setCheckingPeriod] = useState(false);
  const [productNames, setProductNames] = useState([]);
  const [departmentNames, setDepartmentNames] = useState([]);

  useEffect(() => {
    api.get('/stores').then(r => {
      setStores(r.data);
      if (r.data.length) setStoreId(r.data[0].id);
    });
  }, []);

  const checkLoaded = useCallback(async () => {
    if (!storeId) return;
    setCheckingPeriod(true);
    try {
      const sid = Number(storeId);
      const periodRes = await api.post('/periods', { year, month, store_id: sid });
      const period_id = periodRes.data.id;
      const [ordersRes, productsRes, groupsRes, deptRes] = await Promise.all([
        api.get('/orders/summary', { params: { period_id, store_id: sid } }),
        api.get('/product-orders/summary', { params: { period_id, store_id: sid } }),
        api.get('/product-orders/groups', { params: { period_id, store_id: sid } }),
        api.get('/departments/all', { params: { store_id: sid } }),
      ]);
      const ordersCount = ordersRes.data.total_orders || 0;
      const productsCount = productsRes.data?.total_orders || (productsRes.data?.products || []).reduce((sum, p) => sum + (p.total || 0), 0);
      setLoadedData({ period_id, ordersCount, productsCount });
      setProductNames(groupsRes.data || []);
      setDepartmentNames(deptRes.data || []);
    } catch {
      setLoadedData(null);
      setProductNames([]);
      setDepartmentNames([]);
    } finally {
      setCheckingPeriod(false);
    }
  }, [storeId, year, month]);

  useEffect(() => { checkLoaded(); }, [checkLoaded]);

  // Uploads a file; if the backend detects the Excel's own dates belong to a different
  // month than the one selected (classic "wrong month/store" mistake), it responds 409
  // with a period_mismatch detail instead of importing — ask the user before retrying.
  async function uploadWithMismatchCheck(url, buildForm) {
    try {
      return await api.post(url, buildForm(false), { headers: { 'Content-Type': 'multipart/form-data' } });
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (detail && typeof detail === 'object' && detail.type === 'period_mismatch') {
        if (window.confirm(detail.message)) {
          return await api.post(url, buildForm(true), { headers: { 'Content-Type': 'multipart/form-data' } });
        }
        throw new Error('Carga cancelada: el mes del Excel no coincidía con el período seleccionado.');
      }
      throw e;
    }
  }

  async function handleUpload() {
    if (!fileOrders || !fileProducts || !storeId) return;
    setLoading(true);
    setResults([]);
    const newResults = [];
    try {
      const periodRes = await api.post('/periods', { year, month, store_id: storeId });
      const period_id = periodRes.data.id;

      const res1 = await uploadWithMismatchCheck('/orders/upload', (confirm) => {
        const f = new FormData();
        f.append('file', fileOrders);
        f.append('period_id', period_id);
        f.append('store_id', storeId);
        if (confirm) f.append('confirm', 'true');
        return f;
      });
      newResults.push({ ok: true, msg: `✓ Órdenes: ${res1.data.imported} importadas` });

      const res2 = await uploadWithMismatchCheck('/product-orders/upload', (confirm) => {
        const f = new FormData();
        f.append('file', fileProducts);
        f.append('period_id', period_id);
        f.append('store_id', storeId);
        if (confirm) f.append('confirm', 'true');
        return f;
      });
      newResults.push({ ok: true, msg: `✓ Productos: ${res2.data.imported} registros importados` });

      setFileOrders(null);
      setFileProducts(null);
      checkLoaded();
    } catch (e) {
      const detail = e.response?.data?.detail;
      const msg = (detail && typeof detail === 'object') ? detail.message : (e.response?.data?.error || detail || e.message || 'Error al importar');
      newResults.push({ ok: false, msg });
    } finally {
      setResults(newResults);
      setLoading(false);
    }
  }

  async function handleClearOrders() {
    if (!loadedData?.period_id || !window.confirm('¿Eliminar todas las órdenes de este período? Esta acción no se puede deshacer.')) return;
    await api.delete('/orders/clear', { params: { period_id: loadedData.period_id, store_id: storeId } });
    checkLoaded();
    setResults([{ ok: true, msg: '✓ Órdenes eliminadas de este período' }]);
  }

  async function handleClearProducts() {
    if (!loadedData?.period_id || !window.confirm('¿Eliminar todos los registros de productos de este período? Esta acción no se puede deshacer.')) return;
    await api.delete('/product-orders/clear', { params: { period_id: loadedData.period_id, store_id: storeId } });
    checkLoaded();
    setResults([{ ok: true, msg: '✓ Órdenes por producto eliminadas de este período' }]);
  }

  async function handleClearAll() {
    if (!loadedData?.period_id || !window.confirm('¿Eliminar TODOS los datos cargados (órdenes + productos) de este período? Esta acción no se puede deshacer.')) return;
    await Promise.all([
      api.delete('/orders/clear', { params: { period_id: loadedData.period_id, store_id: storeId } }),
      api.delete('/product-orders/clear', { params: { period_id: loadedData.period_id, store_id: storeId } }),
    ]);
    checkLoaded();
    setResults([{ ok: true, msg: '✓ Todos los datos cargados eliminados de este período' }]);
  }

  const years = [];
  for (let y = 2023; y <= new Date().getFullYear() + 1; y++) years.push(y);
  const canUpload = fileOrders && fileProducts && storeId && !loading;
  const storeName = stores.find(st => st.id == storeId)?.name || '';
  const hasData = loadedData && (loadedData.ordersCount > 0 || loadedData.productsCount > 0);

  return (
    <div>
      <div style={s.title}>Cargar Excel de Órdenes</div>
      <div style={s.sub}>
        Importa los archivos descargados de Dropi para el cierre mensual.
        Se requieren <strong>ambos archivos</strong>: Órdenes y Órdenes por Producto.
      </div>

      <div style={s.card}>
        <div style={s.group}>
          <label style={s.label}>Tienda</label>
          <select style={s.select} value={storeId} onChange={e => setStoreId(e.target.value)}>
            {stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
          <div>
            <label style={s.label}>Mes del cierre</label>
            <select style={s.select} value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Año</label>
            <select style={s.select} value={year} onChange={e => setYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Status de datos cargados */}
        {hasData && (
          <div style={{ background: '#eff6ff', borderRadius: 8, padding: '12px 16px', marginBottom: 18, border: '1px solid #bfdbfe' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginBottom: 8 }}>
              Datos cargados · {MONTHS[month - 1]} {year} · {storeName}
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: loadedData.ordersCount > 0 ? '#22c55e' : '#cbd5e1', display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: '#374151' }}>Órdenes: <strong>{loadedData.ordersCount}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: loadedData.productsCount > 0 ? '#22c55e' : '#cbd5e1', display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: '#374151' }}>Productos: <strong>{loadedData.productsCount}</strong></span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {loadedData.ordersCount > 0 && (
                <button onClick={handleClearOrders}
                  style={{ padding: '5px 12px', background: '#fff', border: '1px solid #fca5a5', borderRadius: 6,
                           fontSize: 12, color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
                  Eliminar órdenes
                </button>
              )}
              {loadedData.productsCount > 0 && (
                <button onClick={handleClearProducts}
                  style={{ padding: '5px 12px', background: '#fff', border: '1px solid #fca5a5', borderRadius: 6,
                           fontSize: 12, color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
                  Eliminar productos
                </button>
              )}
              {loadedData.ordersCount > 0 && loadedData.productsCount > 0 && (
                <button onClick={handleClearAll}
                  style={{ padding: '5px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6,
                           fontSize: 12, color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}>
                  Eliminar todo
                </button>
              )}
            </div>
          </div>
        )}

        <label style={{ ...s.label, marginBottom: 10 }}>Archivos requeridos</label>

        <FileDropzone
          label="Excel de Órdenes (valores, ganancia, flete)"
          icon="📋"
          file={fileOrders}
          onFile={setFileOrders}
          accept=".xlsx,.xls"
          dragState={[dragOrders, setDragOrders]}
        />
        <FileDropzone
          label="Excel de Órdenes por Producto (productos, variaciones)"
          icon="🏷️"
          file={fileProducts}
          onFile={setFileProducts}
          accept=".xlsx,.xls"
          dragState={[dragProducts, setDragProducts]}
        />

        {(!fileOrders || !fileProducts) && (
          <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 12, textAlign: 'center' }}>
            {!fileOrders && !fileProducts
              ? 'Selecciona ambos archivos Excel para continuar'
              : !fileOrders
              ? 'Falta el Excel de Órdenes'
              : 'Falta el Excel de Órdenes por Producto'}
          </div>
        )}

        <button
          style={s.btn(!canUpload)}
          onClick={handleUpload}
          disabled={!canUpload}
        >
          {loading ? 'Importando...' : hasData ? 'Reemplazar y cargar nuevos archivos' : 'Importar Ambos Archivos'}
        </button>

        {results.map((r, i) => <div key={i} style={s.result(r.ok)}>{r.msg}</div>)}
      </div>

      {loadedData?.period_id && loadedData.productsCount > 0 && (
        <MergeProductsCard storeId={Number(storeId)} products={productNames} onMerged={checkLoaded} />
      )}

      {loadedData?.period_id && loadedData.ordersCount > 0 && (
        <AdSpendCard periodId={loadedData.period_id} storeId={Number(storeId)} products={productNames} departments={departmentNames} />
      )}
    </div>
  );
}
