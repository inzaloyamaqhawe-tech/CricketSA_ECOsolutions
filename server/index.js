require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const { pool, query, initSchema } = require('./db');
const authRoutes = require('./routes/auth.routes');
const roleRoutes = require('./routes/roles.routes');
const applicationRoutes = require('./routes/applications.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(cors({
  origin: process.env.CORS_ORIGIN === '*' || !process.env.CORS_ORIGIN ? true : process.env.CORS_ORIGIN.split(','),
  credentials: true,
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40 });
app.use('/api/auth', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api', roleRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Central error handler (e.g. multer file-size/type errors)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 400).json({ error: err.message || 'Something went wrong.' });
});

async function bootstrapAdmin() {
  const existing = await query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  if (existing.rows.length) return;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('[bootstrap] No admin exists yet and ADMIN_EMAIL/ADMIN_PASSWORD are not set - set them in .env and restart to create one.');
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await query(
    `INSERT INTO users (email, password_hash, role, full_name) VALUES ($1,$2,'admin','Cricket ECO Platform Admin')`,
    [email.toLowerCase(), hash]
  );
  console.log(`[bootstrap] Created initial admin account: ${email}`);
}

async function start() {
  await initSchema();
  await bootstrapAdmin();
  app.listen(PORT, () => {
    console.log(`[server] Cricket ECO Solutions listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
