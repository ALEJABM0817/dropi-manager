const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../db');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const COL_MAP = {
  fecha: 'FECHA',
  nombre_cliente: 'NOMBRE CLIENTE',
  numero_guia: 'NÚMERO GUIA',
  estatus: 'ESTATUS',
  tipo_envio: 'TIPO DE ENVIO',
  departamento_destino: 'DEPARTAMENTO DESTINO',
  ciudad_destino: 'CIUDAD DESTINO',
  valor_facturado: 'VALOR FACTURADO',
  valor_compra_productos: 'VALOR DE COMPRA EN PRODUCTOS',
  ganancia: 'GANANCIA',
  precio_flete: 'PRECIO FLETE',
  costo_devolucion_flete: 'COSTO DEVOLUCION FLETE',
  comision: 'COMISION',
  total_proveedor: 'TOTAL EN PRECIOS DE PROVEEDOR',
  numero_factura: 'NUMERO DE FACTURA',
};

function normalizeHeader(h) {
  return h.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

router.post('/upload', upload.single('file'), (req, res) => {
  const { period_id, store_id } = req.body;
  if (!period_id || !store_id) return res.status(400).json({ error: 'period_id and store_id required' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

    // Build normalized header map
    const headerMap = {};
    if (rows.length > 0) {
      Object.keys(rows[0]).forEach(k => {
        headerMap[normalizeHeader(k)] = k;
      });
    }

    function getVal(row, fieldKey) {
      const colName = COL_MAP[fieldKey];
      const normalized = normalizeHeader(colName);
      const actualKey = headerMap[normalized];
      if (!actualKey) return null;
      const val = row[actualKey];
      if (val === null || val === undefined || val === '') return null;
      return val;
    }

    // Delete existing orders for this period+store before re-importing
    db.prepare('DELETE FROM orders WHERE period_id = ? AND store_id = ?').run(period_id, store_id);

    const insert = db.prepare(`
      INSERT INTO orders (period_id, store_id, fecha, nombre_cliente, numero_guia, estatus,
        tipo_envio, departamento_destino, ciudad_destino, valor_facturado,
        valor_compra_productos, ganancia, precio_flete, costo_devolucion_flete,
        comision, total_proveedor, numero_factura)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const importMany = db.transaction((rows) => {
      let count = 0;
      for (const row of rows) {
        const fecha = getVal(row, 'fecha');
        const fechaStr = fecha instanceof Date ? fecha.toISOString().split('T')[0] : String(fecha || '');
        insert.run(
          period_id, store_id,
          fechaStr,
          getVal(row, 'nombre_cliente'),
          getVal(row, 'numero_guia'),
          getVal(row, 'estatus'),
          getVal(row, 'tipo_envio'),
          getVal(row, 'departamento_destino'),
          getVal(row, 'ciudad_destino'),
          Number(getVal(row, 'valor_facturado')) || 0,
          Number(getVal(row, 'valor_compra_productos')) || 0,
          Number(getVal(row, 'ganancia')) || 0,
          Number(getVal(row, 'precio_flete')) || 0,
          Number(getVal(row, 'costo_devolucion_flete')) || 0,
          Number(getVal(row, 'comision')) || 0,
          Number(getVal(row, 'total_proveedor')) || 0,
          getVal(row, 'numero_factura'),
        );
        count++;
      }
      return count;
    });

    const count = importMany(rows);
    res.json({ ok: true, imported: count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Summary for a period+store
router.get('/summary', (req, res) => {
  const { period_id, store_id } = req.query;
  if (!period_id || !store_id) return res.status(400).json({ error: 'period_id and store_id required' });

  const entregado = db.prepare(`
    SELECT COALESCE(SUM(ganancia), 0) as total, COUNT(*) as count
    FROM orders WHERE period_id=? AND store_id=? AND estatus='ENTREGADO'
  `).get(period_id, store_id);

  const devolucion = db.prepare(`
    SELECT COALESCE(SUM(costo_devolucion_flete), 0) as total, COUNT(*) as count
    FROM orders WHERE period_id=? AND store_id=? AND estatus='DEVOLUCION'
  `).get(period_id, store_id);

  const totalOrders = db.prepare(
    'SELECT COUNT(*) as count FROM orders WHERE period_id=? AND store_id=?'
  ).get(period_id, store_id);

  res.json({ entregado, devolucion, total_orders: totalOrders.count });
});

// Dept/city breakdown
router.get('/geo-breakdown', (req, res) => {
  const { period_id, store_id } = req.query;
  if (!period_id || !store_id) return res.status(400).json({ error: 'required' });

  const byDept = db.prepare(`
    SELECT departamento_destino, estatus, COUNT(*) as count,
           SUM(ganancia) as ganancia_total,
           SUM(costo_devolucion_flete) as devolucion_total
    FROM orders WHERE period_id=? AND store_id=?
    GROUP BY departamento_destino, estatus
    ORDER BY count DESC
  `).all(period_id, store_id);

  const byCity = db.prepare(`
    SELECT ciudad_destino, departamento_destino, estatus, COUNT(*) as count
    FROM orders WHERE period_id=? AND store_id=?
    GROUP BY ciudad_destino, departamento_destino, estatus
    ORDER BY count DESC
    LIMIT 50
  `).all(period_id, store_id);

  res.json({ byDept, byCity });
});

module.exports = router;
