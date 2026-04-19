const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const auth = require('../middleware/auth');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// GET /api/auth/captcha
router.get('/captcha', (req, res) => {
  const n1 = Math.floor(Math.random() * 10);
  const n2 = Math.floor(Math.random() * 10);
  const token = jwt.sign({ sum: n1 + n2 }, process.env.JWT_SECRET, { expiresIn: '5m' });
  res.json({ n1, n2, token });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password, captcha_answer, captcha_token } = req.body;

  if (!email || !password || captcha_answer === undefined || !captcha_token) {
    return res.status(400).json({ error: 'All fields including captcha are required.' });
  }

  // Verify Captcha
  try {
    const decoded = jwt.verify(captcha_token, process.env.JWT_SECRET);
    if (parseInt(captcha_answer) !== decoded.sum) {
      return res.status(400).json({ error: 'Incorrect captcha answer.' });
    }
  } catch (err) {
    return res.status(400).json({ error: 'Captcha expired or invalid.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  console.log('Login attempt for:', email, 'User found:', !!user);
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  console.log('Password valid:', valid);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, profile_picture: user.profile_picture },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, profile_picture: user.profile_picture } });
});

// POST /api/auth/register (Admin only in production, open for seeding)
router.post('/register', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'All fields required.' });
  const valid_roles = ['admin', 'supervisor', 'worker'];
  if (!valid_roles.includes(role)) return res.status(400).json({ error: 'Invalid role.' });

  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, hash, role);
    res.json({ id: result.lastInsertRowid, name, email, role });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists.' });
    res.status(500).json({ error: err.message });
  }
});

// GET current user profile
router.get('/me', auth, (req, res) => {
  console.log('GET /me: Loading profile for id:', req.user.id);
  try {
    const user = db.prepare('SELECT id, name, email, role, status, is_on_break, profile_picture FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      console.warn('GET /me: User not found in DB:', req.user.id);
      return res.status(404).json({ error: 'User not found' });
    }
    console.log('GET /me: Success');
    res.json(user);
  } catch (err) {
    console.error('GET /me: Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE personal profile
router.put('/profile', auth, (req, res) => {
  const { name, password } = req.body;
  const userId = req.user.id;
  console.log('PUT /profile: Updating user:', userId, 'with name:', name, 'password provided:', !!password);

  try {
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    if (!user) {
      console.warn('PUT /profile: User not found in DB:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.email === 'admin@shopfloor.com') {
      console.warn('PUT /profile: Blocked change for primary admin');
      return res.status(400).json({ error: 'The primary admin account details are hardcoded and cannot be changed.' });
    }

    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET name = ?, password_hash = ? WHERE id = ?').run(name, hash, userId);
    } else {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, userId);
    }

    console.log('PUT /profile: Success');
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    console.error('PUT /profile: Error:', err.message);
    res.status(500).json({ error: 'Failed to update profile: ' + err.message });
  }
});

module.exports = router;
