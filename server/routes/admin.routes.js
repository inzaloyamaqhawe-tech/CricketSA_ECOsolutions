const express = require('express');
const path = require('path');
const { query } = require('../db');
const { requireAdmin } = require('../auth');
const { sendInterviewInviteEmail, sendOfferEmail, sendRejectionEmail } = require('../mailer');

const router = express.Router();
router.use(requireAdmin);

router.get('/stats', async (req, res) => {
  const byStatus = await query(`SELECT status, COUNT(*)::int AS count FROM applications GROUP BY status`);
  const byRole = await query(
    `SELECT r.name AS role_name, COUNT(a.*)::int AS count
     FROM volunteer_roles r LEFT JOIN applications a ON a.role_id = r.id
     GROUP BY r.name ORDER BY r.name`
  );
  res.json({ byStatus: byStatus.rows, byRole: byRole.rows });
});

router.get('/applications', async (req, res) => {
  const { status, role_id, country, q, page = 1 } = req.query;
  const conditions = [];
  const params = [];
  let i = 1;

  if (status) { conditions.push(`a.status = $${i++}`); params.push(status); }
  if (role_id) { conditions.push(`a.role_id = $${i++}`); params.push(role_id); }
  if (country) { conditions.push(`a.country_of_residence ILIKE $${i++}`); params.push(`%${country}%`); }
  if (q) { conditions.push(`(u.full_name ILIKE $${i++} OR u.email ILIKE $${i - 1})`); params.push(`%${q}%`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = 25;
  const offset = (Math.max(1, Number(page)) - 1) * limit;

  const listSql = `
    SELECT a.id, a.status, a.screening_score, a.country_of_residence, a.city_of_residence, a.created_at,
           u.full_name, u.email, r.name AS role_name, v.name AS venue_name
    FROM applications a
    JOIN users u ON u.id = a.user_id
    JOIN volunteer_roles r ON r.id = a.role_id
    LEFT JOIN venues v ON v.id = a.venue_id
    ${where}
    ORDER BY a.id DESC
    LIMIT ${limit} OFFSET ${offset}`;
  const countSql = `SELECT COUNT(*)::int AS total FROM applications a JOIN users u ON u.id = a.user_id ${where}`;

  const [list, count] = await Promise.all([query(listSql, params), query(countSql, params)]);
  res.json({ applications: list.rows, total: count.rows[0].total, page: Number(page), pageSize: limit });
});

router.get('/applications/:id', async (req, res) => {
  const appRes = await query(
    `SELECT a.*, u.full_name, u.email, u.phone, r.name AS role_name, v.name AS venue_name, v.city AS venue_city
     FROM applications a
     JOIN users u ON u.id = a.user_id
     JOIN volunteer_roles r ON r.id = a.role_id
     LEFT JOIN venues v ON v.id = a.venue_id
     WHERE a.id = $1`,
    [req.params.id]
  );
  const application = appRes.rows[0];
  if (!application) return res.status(404).json({ error: 'Not found.' });

  const [docs, answers, interview] = await Promise.all([
    query('SELECT id, doc_type, original_name, mime_type, size_bytes, uploaded_at FROM application_documents WHERE application_id = $1', [application.id]),
    query(
      `SELECT sa.question_id, sq.question, sq.is_knockout, sa.selected_option, sa.points_awarded, sa.knockout_failed
       FROM screening_answers sa JOIN screening_questions sq ON sq.id = sa.question_id
       WHERE sa.application_id = $1 ORDER BY sq.sort_order`,
      [application.id]
    ),
    query('SELECT * FROM interviews WHERE application_id = $1 ORDER BY id DESC LIMIT 1', [application.id]),
  ]);

  res.json({ application, documents: docs.rows, answers: answers.rows, interview: interview.rows[0] || null });
});

router.get('/applications/:id/documents/:docId/download', async (req, res) => {
  const docRes = await query(
    'SELECT * FROM application_documents WHERE id = $1 AND application_id = $2',
    [req.params.docId, req.params.id]
  );
  const doc = docRes.rows[0];
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  res.download(path.resolve(doc.stored_path), doc.original_name);
});

router.post('/applications/:id/interview', async (req, res) => {
  const { scheduled_at, meeting_link, notes } = req.body || {};
  const appRes = await query(
    `SELECT a.*, u.full_name, u.email, r.name AS role_name FROM applications a
     JOIN users u ON u.id = a.user_id JOIN volunteer_roles r ON r.id = a.role_id WHERE a.id = $1`,
    [req.params.id]
  );
  const application = appRes.rows[0];
  if (!application) return res.status(404).json({ error: 'Not found.' });

  const status = scheduled_at ? 'interview_scheduled' : 'interview_invited';
  await query(
    `INSERT INTO interviews (application_id, scheduled_at, meeting_link, notes, status)
     VALUES ($1,$2,$3,$4,$5)`,
    [application.id, scheduled_at || null, meeting_link || null, notes || null, status]
  );
  await query(`UPDATE applications SET status = $1, updated_at = now() WHERE id = $2`, [status, application.id]);

  await sendInterviewInviteEmail({
    to: application.email,
    fullName: application.full_name,
    roleName: application.role_name,
    applicationId: application.id,
    scheduledAt: scheduled_at,
    meetingLink: meeting_link,
  });

  res.json({ ok: true, status });
});

router.post('/applications/:id/decision', async (req, res) => {
  const { decision } = req.body || {}; // 'offer' | 'reject' | 'shortlist'
  if (!['offer', 'reject', 'shortlist'].includes(decision)) return res.status(400).json({ error: 'Invalid decision.' });

  const appRes = await query(
    `SELECT a.*, u.full_name, u.email, r.name AS role_name FROM applications a
     JOIN users u ON u.id = a.user_id JOIN volunteer_roles r ON r.id = a.role_id WHERE a.id = $1`,
    [req.params.id]
  );
  const application = appRes.rows[0];
  if (!application) return res.status(404).json({ error: 'Not found.' });

  const statusMap = { offer: 'offered', reject: 'rejected_manual', shortlist: 'shortlisted' };
  const newStatus = statusMap[decision];
  await query(
    `UPDATE applications SET status = $1, decided_at = now(), decided_by = $2, updated_at = now() WHERE id = $3`,
    [newStatus, req.user.sub, application.id]
  );

  if (decision === 'offer') {
    await sendOfferEmail({ to: application.email, fullName: application.full_name, roleName: application.role_name, applicationId: application.id });
  } else if (decision === 'reject') {
    await sendRejectionEmail({ to: application.email, fullName: application.full_name, roleName: application.role_name, applicationId: application.id });
  }

  res.json({ ok: true, status: newStatus });
});

// --- Role / question management ---

router.get('/roles', async (req, res) => {
  const roles = await query(`SELECT * FROM volunteer_roles ORDER BY name ASC`);
  res.json({ roles: roles.rows });
});

router.post('/roles', async (req, res) => {
  const { name, department, description, pass_threshold } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Role name is required.' });
  const result = await query(
    `INSERT INTO volunteer_roles (name, department, description, pass_threshold) VALUES ($1,$2,$3,$4) RETURNING id`,
    [name.trim(), department || null, description || null, pass_threshold || 70]
  );
  res.status(201).json({ role_id: result.rows[0].id });
});

router.patch('/roles/:id', async (req, res) => {
  const { is_open, pass_threshold, description } = req.body || {};
  await query(
    `UPDATE volunteer_roles SET
       is_open = COALESCE($1, is_open),
       pass_threshold = COALESCE($2, pass_threshold),
       description = COALESCE($3, description)
     WHERE id = $4`,
    [is_open, pass_threshold, description, req.params.id]
  );
  res.json({ ok: true });
});

// Add a screening question to a role. Two shapes, chosen by `is_knockout`:
//  - knockout:  { question, option_a, option_b, [option_c], [option_d], is_knockout: true, pass_option }
//  - weighted:  { question, option_a, option_b, [option_c], [option_d], is_knockout: false, points_a, points_b, [points_c], [points_d] }
router.post('/roles/:id/questions', async (req, res) => {
  const { question, option_a, option_b, option_c, option_d, is_knockout, pass_option, points_a, points_b, points_c, points_d, sort_order } = req.body || {};
  if (!question || !option_a || !option_b) {
    return res.status(400).json({ error: 'question, option_a and option_b are required.' });
  }
  if (is_knockout) {
    if (!['A', 'B', 'C', 'D'].includes(pass_option)) {
      return res.status(400).json({ error: 'A knockout question needs a valid pass_option (A-D).' });
    }
  } else if (points_a == null || points_b == null) {
    return res.status(400).json({ error: 'A weighted question needs at least points_a and points_b.' });
  }
  const result = await query(
    `INSERT INTO screening_questions
       (role_id, question, option_a, option_b, option_c, option_d, is_knockout, pass_option, points_a, points_b, points_c, points_d, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,0),COALESCE($10,0),$11,$12,COALESCE($13,0)) RETURNING id`,
    [req.params.id, question, option_a, option_b, option_c || null, option_d || null,
     !!is_knockout, is_knockout ? pass_option : null, points_a, points_b, points_c, points_d, sort_order]
  );
  res.status(201).json({ question_id: result.rows[0].id });
});

module.exports = router;
