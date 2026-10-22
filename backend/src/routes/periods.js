const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const { store_id } = req.query;
  let query = `
    SELECT p.*, s.name as store_name
    FROM periods p JOIN stores s ON p.store_id = s.id
  `;
  const params = [];
  if (store_id) { query += ' WHERE p.store_id = ?'; params.push(store_id); }
  query += ' ORDER BY p.year DESC, p.month DESC';
  res.json(db.prepare(query).all(...params));
});

router.post('/', (req, res) => {
  const { year, month, store_id } = req.body;
  if (!year || !month || !store_id) return res.status(400).json({ error: 'year, month, store_id required' });
  try {
    const result = db.prepare(
      'INSERT INTO periods (year, month, store_id) VALUES (?, ?, ?)'
    ).run(year, month, store_id);
    res.json({ id: result.lastInsertRowid, year, month, store_id });
  } catch (e) {
    const existing = db.prepare(
      'SELECT * FROM periods WHERE year=? AND month=? AND store_id=?'
    ).get(year, month, store_id);
    res.json(existing);
  }
});

router.patch('/:id/bogota', (req, res) => {
  const { bogota_income } = req.body;
  db.prepare('UPDATE periods SET bogota_income = ? WHERE id = ?').run(bogota_income, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
