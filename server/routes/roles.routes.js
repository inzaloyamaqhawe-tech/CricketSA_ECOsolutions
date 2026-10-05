const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.get('/roles', async (req, res) => {
  const result = await query(
    `SELECT id, name, department, description
     FROM volunteer_roles WHERE is_open = true ORDER BY name ASC`
  );
  res.json({ roles: result.rows });
});

router.get('/venues', async (req, res) => {
  const result = await query('SELECT id, name, city FROM venues ORDER BY city ASC');
  res.json({ venues: result.rows });
});

module.exports = router;
