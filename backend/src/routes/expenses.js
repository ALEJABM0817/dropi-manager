const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM expense_categories WHERE active=1 ORDER BY sort_order, id').all());
});

router.post('/categories', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM expense_categories').get().m;
  try {
    const result = db.prepare('INSERT INTO expense_categories (name, sort_order) VALUES (?, ?)').run(name.trim(), maxOrder + 1);
    res.json({ id: result.lastInsertRowid, name: name.trim() });
  } catch (e) {
    res.status(409).json({ error: 'Category already exists' });
  }
});

router.patch('/categories/:id', (req, res) => {
  const { name, active } = req.body;
  const fields = [];
  const vals = [];
  if (name !== undefined) { fields.push('name=?'); vals.push(name); }
  if (active !== undefined) { fields.push('active=?'); vals.push(active ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id);
  db.prepare(`UPDATE expense_categories SET ${fields.join(',')} WHERE id=?`).run(...vals);
  res.json({ ok: true });
});

router.delete('/categories/:id', (req, res) => {
  db.prepare('UPDATE expense_categories SET active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Get/set expenses for a period+store
router.get('/', (req, res) => {
  const { period_id, store_id } = req.query;
  if (!period_id || !store_id) return res.status(400).json({ error: 'required' });
  const rows = db.prepare(`
    SELECT e.*, c.name, c.sort_order as cat_sort
    FROM expense_categories c
    LEFT JOIN expenses e ON c.id=e.category_id AND e.period_id=? AND e.store_id=?
    WHERE c.active=1
    ORDER BY c.sort_order, c.id
  `).all(period_id, store_id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { period_id, store_id, category_id, amount } = req.body;
  if (!period_id || !store_id || !category_id) return res.status(400).json({ error: 'required' });
  db.prepare(`
    INSERT INTO expenses (period_id, store_id, category_id, amount)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(period_id, store_id, category_id) DO UPDATE SET amount=excluded.amount
  `).run(period_id, store_id, category_id, amount || 0);
  res.json({ ok: true });
});

module.exports = router;
