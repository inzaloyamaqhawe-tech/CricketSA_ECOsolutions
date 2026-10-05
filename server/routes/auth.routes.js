const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { signToken, setAuthCookie, clearAuthCookie, requireAuth } = require('../auth');
const { sendWelcomeEmail } = require('../mailer');

const router = express.Router();

function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, phone } = req.body || {};
    if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (!full_name || !full_name.trim()) return res.status(400).json({ error: 'Full name is required.' });

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'An account with that email already exists.' });

    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (email, password_hash, role, full_name, phone)
       VALUES ($1,$2,'applicant',$3,$4) RETURNING id, email, role, full_name`,
      [email.toLowerCase(), hash, full_name.trim(), phone || null]
    );
    const user = result.rows[0];
    const token = signToken(user);
    setAuthCookie(res, token);
    sendWelcomeEmail({ to: user.email, fullName: user.full_name }).catch((e) => console.error('welcome email failed', e));
    res.status(201).json({ user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed, please try again.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!isValidEmail(email) || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed, please try again.' });
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.sub, email: req.user.email, role: req.user.role, full_name: req.user.full_name } });
});

module.exports = router;
