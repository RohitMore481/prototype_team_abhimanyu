const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET all machines
router.get('/', auth, (req, res) => {
  let query = 'SELECT id, name, type, status, idle_since, last_active_at, project_id FROM machines';
  let projectId = req.user.project_id;
  if (req.user.role === 'supervisor' || req.user.role === 'worker') {
    const user = db.prepare('SELECT project_id FROM users WHERE id = ?').get(req.user.id);
    projectId = user ? user.project_id : null;
  }

  const params = [];
  if ((req.user.role === 'supervisor' || req.user.role === 'worker') && projectId !== null) {
    query += ' WHERE project_id = ?';
    params.push(projectId);
  } else if (req.user.role === 'supervisor' || req.user.role === 'worker') {
    query += ' WHERE project_id = -1'; // Force empty
  }
  query += ' ORDER BY name';
  const machines = db.prepare(query).all(...params);
  res.json(machines);
});

// GET single machine
router.get('/:id', auth, (req, res) => {
  const machine = db.prepare('SELECT id, name, type, status, idle_since, last_active_at, project_id FROM machines WHERE id = ?').get(req.params.id);
  if (!machine) return res.status(404).json({ error: 'Machine not found' });
  res.json(machine);
});

// POST create machine (Admin)
router.post('/', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden. Only administrators can add machines.' });
  const { name, type, project_id } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Name and type required.' });
  const result = db.prepare('INSERT INTO machines (name, type, status, idle_since, project_id) VALUES (?, ?, ?, ?, ?)').run(name, type, 'idle', new Date().toISOString(), project_id || null);
  res.json(db.prepare('SELECT id, name, type, status, idle_since, last_active_at, project_id FROM machines WHERE id = ?').get(result.lastInsertRowid));
});

// PUT update machine (Admin/Supervisor)
router.put('/:id', auth, (req, res) => {
  if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });
  const { name, type, status, project_id } = req.body;
  const now = new Date().toISOString();
  let idleSince = null;
  if (status === 'idle' || status === 'breakdown') {
    if (status === 'breakdown' && req.user.role === 'worker') {
      return res.status(403).json({ error: 'Workers must report breakdowns via the requests system.' });
    }
    idleSince = now;
  }
  db.prepare('UPDATE machines SET name = ?, type = ?, status = ?, idle_since = ?, last_active_at = ?, project_id = ? WHERE id = ?')
    .run(name, type, status, idleSince, status === 'running' ? now : null, project_id || null, req.params.id);
  const machine = db.prepare('SELECT id, name, type, status, idle_since, last_active_at, project_id FROM machines WHERE id = ?').get(req.params.id);

  // Emit socket event
  const io = req.app.get('io');
  if (io) io.emit('machine:status', machine);

  res.json(machine);
});

// POST mark machine as repaired (Supervisor only)
router.post('/:id/repair', auth, (req, res) => {
  if (req.user.role !== 'supervisor') return res.status(403).json({ error: 'Repairing machines is restricted to supervisors only.' });

  const now = new Date().toISOString();
  db.prepare("UPDATE machines SET status = 'idle', idle_since = ?, last_active_at = NULL WHERE id = ?").run(now, req.params.id);

  const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(req.params.id);

  // Emit socket event
  const io = req.app.get('io');
  if (io) io.emit('machine:status', machine);

  res.json(machine);
});

// DELETE machine (Admin only)
router.delete('/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  db.prepare('DELETE FROM machines WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
