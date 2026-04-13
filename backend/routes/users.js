const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');

// GET all users (Admin only)
router.get('/', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const users = db.prepare('SELECT id, name, email, role, status, is_on_break, created_at FROM users').all();
  res.json(users);
});

// GET workers only
router.get('/workers', auth, (req, res) => {
  const workers = db.prepare("SELECT id, name, email, status, is_on_break FROM users WHERE role = 'worker'").all();
  res.json(workers);
});

// POST create user (Admin only)
router.post('/', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'All fields required.' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, hash, role);
    res.json({ id: result.lastInsertRowid, name, email, role });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists.' });
    res.status(500).json({ error: err.message });
  }
});

// PUT update user (Admin only)
router.put('/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { name, role } = req.body;
  db.prepare('UPDATE users SET name = ?, role = ? WHERE id = ?').run(name, role, req.params.id);
  res.json({ success: true });
});

// DELETE user (Admin only)
router.delete('/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const userId = req.params.id;
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  const io = req.app.get('io');
  if (io) {
    io.emit('user:deleted', { id: parseInt(userId) });
    // Trigger autoAssign because a worker might have been deleted, leaving tasks unassigned
    const autoAssign = req.app.get('autoAssign');
    if (autoAssign) autoAssign.attemptAutoAssign(io);
  }

  res.json({ success: true });
});

module.exports = router;
