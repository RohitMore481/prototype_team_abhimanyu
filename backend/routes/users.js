const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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
    const users = db.prepare('SELECT id, name, email, role, status, is_on_break, profile_picture, created_at FROM users').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users: ' + err.message });
  }
});

// GET workers only
router.get('/workers', auth, (req, res) => {
  const workers = db.prepare("SELECT id, name, email, status, is_on_break, profile_picture FROM users WHERE role = 'worker'").all();
  res.json(workers);
});

// POST create user (Admin only)
router.post('/', auth, (req, res) => {
  upload.single('profile_picture')(req, res, function (err) {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message });
    }

    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { name, email, password, role } = req.body;
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
      const result = db.prepare('INSERT INTO users (name, email, password_hash, role, profile_picture) VALUES (?, ?, ?, ?, ?)').run(name, email, hash, role, profile_picture);
      res.json({ id: result.lastInsertRowid, name, email, role, profile_picture });
    } catch (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists.' });
      res.status(500).json({ error: err.message });
    }
  });
});

// PUT update user (Admin only)
router.put('/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { name, role } = req.body;
  const targetId = req.params.id;

  try {
    const userToUpdate = db.prepare('SELECT email, role FROM users WHERE id = ?').get(targetId);
    if (!userToUpdate) return res.status(404).json({ error: 'User not found' });

    // Protect the primary admin
    if (userToUpdate.email === 'admin@shopfloor.com') {
      return res.status(400).json({ error: 'The primary admin account cannot be modified via this panel.' });
    }

    if (userToUpdate.role !== 'admin' && role === 'admin') {
      return res.status(400).json({ error: 'Cannot promote user to admin.' });
    }

    db.prepare('UPDATE users SET name = ?, role = ? WHERE id = ?').run(name, role, targetId);
    res.json({ success: true });
  } catch (err) {
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

module.exports = router;
