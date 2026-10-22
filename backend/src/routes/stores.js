const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const stores = db.prepare('SELECT * FROM stores ORDER BY name').all();
  res.json(stores);
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const result = db.prepare('INSERT INTO stores (name) VALUES (?)').run(name.trim());
    res.json({ id: result.lastInsertRowid, name: name.trim() });
  } catch (e) {
    res.status(409).json({ error: 'Store already exists' });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM stores WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
