const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

function createNotification(userId, message, type = 'info') {
  try {
    db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(userId, message, type);
  } catch (e) { }
}

function emitNotification(req, userId, message, type = 'info') {
  const io = req.app.get('io');
  if (io) io.to(`user_${userId}`).emit('notification:new', { message, type });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Error: File upload only supports images!'));
  }
});

// GET all users (Admin only)
router.get('/', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const users = db.prepare('SELECT id, name, email, role, status, is_on_break, is_live, profile_picture, project_id, created_at FROM users').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users: ' + err.message });
  }
});

// GET workers only
router.get('/workers', auth, (req, res) => {
  let query = "SELECT id, name, email, status, is_on_break, is_live, profile_picture, project_id FROM users WHERE role = 'worker'";
  let projectId = req.user.project_id;
  if (req.user.role === 'supervisor' || req.user.role === 'worker') {
    const user = db.prepare('SELECT project_id FROM users WHERE id = ?').get(req.user.id);
    projectId = user ? user.project_id : null;
  }

  const params = [];
  if ((req.user.role === 'supervisor' || req.user.role === 'worker') && projectId !== null) {
    query += " AND project_id = ?";
    params.push(projectId);
  } else if (req.user.role === 'supervisor' || req.user.role === 'worker') {
    query += " AND project_id = -1";
  }
  const workers = db.prepare(query).all(...params);
  res.json(workers);
});

// GET supervisors only
router.get('/supervisors', auth, (req, res) => {
  let query = "SELECT id, name, email, status, is_live, profile_picture, project_id FROM users WHERE role = 'supervisor'";
  let projectId = req.user.project_id;
  if (req.user.role === 'supervisor' || req.user.role === 'worker') {
    const user = db.prepare('SELECT project_id FROM users WHERE id = ?').get(req.user.id);
    projectId = user ? user.project_id : null;
  }

  const params = [];
  if ((req.user.role === 'supervisor' || req.user.role === 'worker') && projectId !== null) {
    query += " AND project_id = ?";
    params.push(projectId);
  } else if (req.user.role === 'supervisor' || req.user.role === 'worker') {
    query += " AND project_id = -1";
  }
  const supervisors = db.prepare(query).all(...params);
  res.json(supervisors);
});

// POST create user (Admin only)
router.post('/', auth, (req, res) => {
  upload.single('profile_picture')(req, res, function (err) {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message });
    }

    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { name, email, password, role, project_id } = req.body;
    const profile_picture = req.file ? `/uploads/${req.file.filename}` : null;

    const missing = [];
    if (!name) missing.push('name');
    if (!email) missing.push('email');
    if (!password) missing.push('password');
    if (!role) missing.push('role');

    if (missing.length > 0) {
      console.warn('POST /users - Missing fields:', missing);
      return res.status(400).json({ error: `Required fields missing: ${missing.join(', ')}` });
    }

    if (role === 'admin') return res.status(400).json({ error: 'Creating additional admins is not permitted.' });

    const valid_roles = ['supervisor', 'worker', 'monitor'];
    if (!valid_roles.includes(role)) return res.status(400).json({ error: 'Invalid role.' });

    const hash = bcrypt.hashSync(password, 10);
    try {
      const result = db.prepare('INSERT INTO users (name, email, password_hash, role, profile_picture, project_id) VALUES (?, ?, ?, ?, ?, ?)').run(name, email, hash, role, profile_picture, project_id || null);
      const newUserId = result.lastInsertRowid;

      if (project_id) {
        const proj = db.prepare('SELECT name FROM projects WHERE id = ?').get(project_id);
        if (proj) {
          const msg = `Welcome! You have been assigned to project: ${proj.name}`;
          createNotification(newUserId, msg, 'success');
        }
      }

      res.json({ id: newUserId, name, email, role, profile_picture });
    } catch (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists.' });
      res.status(500).json({ error: err.message });
    }
  });
});

// PUT update user (Admin only)
router.put('/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { name, email, password, role, project_id } = req.body;
  const targetId = req.params.id;

  try {
    const userToUpdate = db.prepare('SELECT email, role FROM users WHERE id = ?').get(targetId);
    if (!userToUpdate) return res.status(404).json({ error: 'User not found' });

    // Protect the primary admin
    if (userToUpdate.email === 'admin@shopfloor.com') {
      return res.status(400).json({ error: 'The primary admin account cannot be modified via this panel.' });
    }

    if (role && userToUpdate.role !== 'admin' && role === 'admin') {
      return res.status(400).json({ error: 'Cannot promote user to admin.' });
    }

    if (role && !['supervisor', 'worker', 'monitor'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }

    let query = 'UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), role = COALESCE(?, role), project_id = ?';
    let params = [name, email, role, project_id || null];

    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      query += ', password_hash = ?';
      params.push(hash);
    }

    query += ' WHERE id = ?';
    params.push(targetId);

    db.prepare(query).run(...params);

    if (project_id) {
      const proj = db.prepare('SELECT name FROM projects WHERE id = ?').get(project_id);
      if (proj) {
        const msg = `You have been assigned to project: ${proj.name}`;
        createNotification(targetId, msg, 'success');
        emitNotification(req, targetId, msg, 'success');
      }
    }

    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists.' });
    res.status(500).json({ error: 'Failed to update user: ' + err.message });
  }
});

// DELETE user (Admin only)
router.delete('/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const userId = req.params.id;

  try {
    const userToDelete = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    if (!userToDelete) return res.status(404).json({ error: 'User not found' });

    // Protect primary admin
    if (userToDelete.email === 'admin@shopfloor.com') {
      return res.status(400).json({ error: 'The primary admin account cannot be deleted.' });
    }

    // Delete associated records first to satisfy foreign key constraints
    db.prepare('DELETE FROM break_logs WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM requests WHERE user_id = ?').run(userId);
    // Task logs where performed_by is this user
    db.prepare('UPDATE task_logs SET performed_by = NULL WHERE performed_by = ?').run(userId);
    // Tasks where created_by or assigned_worker_id is our user - handled by ON DELETE SET NULL in tasks table,
    // but ensure tasks that ARE in_progress are handled.
    db.prepare("UPDATE tasks SET status = 'not_started', assigned_worker_id = NULL WHERE assigned_worker_id = ? AND status IN ('in_progress','paused','delayed')").run(userId);

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    const io = req.app.get('io');
    if (io) {
      io.emit('user:deleted', { id: parseInt(userId) });
      const autoAssign = req.app.get('autoAssign');
      if (autoAssign) autoAssign.attemptAutoAssign(io);
    }

    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('FOREIGN KEY')) {
      return res.status(400).json({ error: 'Cannot delete user: This user has associated tasks or logs. Please reassign or delete their tasks first.' });
    }
    res.status(500).json({ error: 'Failed to delete user: ' + err.message });
  }
});

// POST go-live
router.post('/go-live', auth, (req, res) => {
  const { userId, startTime } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required.' });

  try {
    db.prepare(`UPDATE users SET is_live = 1, shift_start_time = ? WHERE id = ?`).run(startTime || new Date().toISOString(), userId);

    const io = req.app.get('io');
    if (io) io.emit('user:status', { userId: userId, is_live: 1 });

    res.json({ success: true, message: 'Shift started' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to go live: ' + err.message });
  }
});

// POST go-offline
router.post('/go-offline', auth, (req, res) => {
  const { userId, pendingTasks, delayedTasks, reason, note, endTime } = req.body;
  const role = req.user.role;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required.' });
  }

  try {
    const user = db.prepare('SELECT shift_start_time, name FROM users WHERE id = ?').get(userId);
    const start = user?.shift_start_time || null;
    const end = endTime || new Date().toISOString();

    db.prepare(`
      INSERT INTO shift_logs (user_id, start_time, end_time, pending_tasks, delayed_tasks, reason, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, start, end, pendingTasks || 0, delayedTasks || 0, reason || null, note || null);

    db.prepare(`UPDATE users SET is_live = 0, shift_start_time = NULL WHERE id = ?`).run(userId);

    const io = req.app.get('io');
    if (io) io.emit('user:status', { userId: userId, is_live: 0 });

    const activeTasks = db.prepare(`SELECT id, machine_id FROM tasks WHERE assigned_worker_id = ? AND status = 'in_progress'`).all(userId);
    for (const t of activeTasks) {
      db.prepare(`UPDATE tasks SET status = 'paused' WHERE id = ?`).run(t.id);
      db.prepare(`UPDATE machines SET status = 'idle', idle_since = ? WHERE id = ?`).run(end, t.machine_id);
      db.prepare(`INSERT INTO task_logs (task_id, action, note, performed_by, timestamp) VALUES (?, 'paused', 'Auto-paused due to shift termination', ?, ?)`).run(t.id, userId, end);
      if (io) {
        io.emit('task:updated', { id: t.id, status: 'paused', machine_id: t.machine_id, assigned_worker_id: userId });
        const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(t.machine_id);
        if (machine) io.emit('machine:status', machine);
      }
    }

    if (role === 'worker' && (pendingTasks > 0 || delayedTasks > 0)) {
      db.prepare(`
        INSERT INTO alerts (worker_id, worker_name, pending_tasks, delayed_tasks, reason, note, timestamp, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'unread')
      `).run(userId, req.user.name, pendingTasks || 0, delayedTasks || 0, reason || 'Unknown', note || null, end);

      const io = req.app.get('io');
      if (io) {
        io.emit('worker_offline_alert', {
          workerId: userId,
          workerName: req.user.name,
          pendingTasks,
          delayedTasks,
          reason,
          note,
          timestamp: end
        });
      }
    }

    res.json({ success: true, message: 'Shift ended' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to go offline: ' + err.message });
  }
});

// GET logout summary for a specific user (legacy, kept for compat if needed, simplified)
router.get('/:id/logout-summary', auth, (req, res) => {
  try {
    const summary = db.prepare(`
      SELECT * FROM shift_logs 
      WHERE user_id = ? 
      ORDER BY end_time DESC 
      LIMIT 1
    `).get(req.params.id);

    if (!summary) return res.json(null);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch summary: ' + err.message });
  }
});

module.exports = router;
