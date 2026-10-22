const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM ad_accounts WHERE active=1 ORDER BY sort_order, id').all());
});

router.post('/', (req, res) => {
  const { name, platform } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM ad_accounts').get().m;
  const result = db.prepare('INSERT INTO ad_accounts (name, platform, sort_order) VALUES (?, ?, ?)').run(
    name.trim(), platform || 'meta', maxOrder + 1
  );
  res.json({ id: result.lastInsertRowid, name: name.trim(), platform: platform || 'meta' });
});

router.patch('/:id', (req, res) => {
  const { name, platform, active } = req.body;
  const fields = [];
  const vals = [];
  if (name !== undefined) { fields.push('name=?'); vals.push(name); }
  if (platform !== undefined) { fields.push('platform=?'); vals.push(platform); }
  if (active !== undefined) { fields.push('active=?'); vals.push(active ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id);
  db.prepare(`UPDATE ad_accounts SET ${fields.join(',')} WHERE id=?`).run(...vals);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE ad_accounts SET active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Get/set investments for a period+store
router.get('/investments', (req, res) => {
  const { period_id, store_id } = req.query;
  if (!period_id || !store_id) return res.status(400).json({ error: 'required' });
  const rows = db.prepare(`
    SELECT ai.*, a.name, a.platform
    FROM ad_accounts a
    LEFT JOIN ad_investments ai ON a.id=ai.ad_account_id AND ai.period_id=? AND ai.store_id=?
    WHERE a.active=1
    ORDER BY a.sort_order, a.id
  `).all(period_id, store_id);
  res.json(rows);
});

router.post('/investments', (req, res) => {
  const { period_id, store_id, ad_account_id, amount } = req.body;
  if (!period_id || !store_id || !ad_account_id) return res.status(400).json({ error: 'required' });
  db.prepare(`
    INSERT INTO ad_investments (period_id, store_id, ad_account_id, amount)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(period_id, store_id, ad_account_id) DO UPDATE SET amount=excluded.amount
  `).run(period_id, store_id, ad_account_id, amount || 0);
  res.json({ ok: true });
});

module.exports = router;
