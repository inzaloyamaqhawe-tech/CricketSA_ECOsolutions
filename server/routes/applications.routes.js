const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../auth');
const { upload } = require('../upload');
const { sendShortlistedEmail, sendRejectionEmail } = require('../mailer');

const router = express.Router();
router.use(requireAuth);

const REQUIRED_DOC_TYPES = ['cv', 'police_clearance'];

async function loadOwnApplication(applicationId, userId) {
  const result = await query(
    `SELECT a.*, r.name AS role_name, r.pass_threshold, v.name AS venue_name, v.city AS venue_city
     FROM applications a
     JOIN volunteer_roles r ON r.id = a.role_id
     LEFT JOIN venues v ON v.id = a.venue_id
     WHERE a.id = $1 AND a.user_id = $2`,
    [applicationId, userId]
  );
  return result.rows[0] || null;
}

// Create (or resume) the applicant's single active application.
router.post('/', async (req, res) => {
  try {
    const userId = req.user.sub;
    const { role_id, venue_id, country_of_residence, city_of_residence, date_of_birth, motivation, availability_notes } = req.body || {};

    if (!role_id) return res.status(400).json({ error: 'Please choose a platform module.' });
    if (!country_of_residence || !country_of_residence.trim()) return res.status(400).json({ error: 'Country of residence is required.' });

    const existing = await query(
      `SELECT id, status FROM applications WHERE user_id = $1 AND status NOT IN ('withdrawn','rejected_auto','rejected_manual') ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: 'You already have an active onboarding request in progress.', application_id: existing.rows[0].id });
    }

    const roleCheck = await query('SELECT id FROM volunteer_roles WHERE id = $1 AND is_open = true', [role_id]);
    if (!roleCheck.rows.length) return res.status(400).json({ error: 'That module is not currently open.' });

    const result = await query(
      `INSERT INTO applications
         (user_id, role_id, venue_id, country_of_residence, city_of_residence, date_of_birth, motivation, availability_notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft')
       RETURNING id`,
      [userId, role_id, venue_id || null, country_of_residence.trim(), city_of_residence || null, date_of_birth || null, motivation || null, availability_notes || null]
    );
    res.status(201).json({ application_id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create application.' });
  }
});

// The applicant's own application, with documents + interview info.
router.get('/mine', async (req, res) => {
  const result = await query(
    `SELECT a.*, r.name AS role_name, r.department, v.name AS venue_name, v.city AS venue_city
     FROM applications a
     JOIN volunteer_roles r ON r.id = a.role_id
     LEFT JOIN venues v ON v.id = a.venue_id
     WHERE a.user_id = $1 ORDER BY a.id DESC LIMIT 1`,
    [req.user.sub]
  );
  const application = result.rows[0];
  if (!application) return res.json({ application: null });

  const docs = await query(
    `SELECT id, doc_type, original_name, mime_type, size_bytes, uploaded_at FROM application_documents WHERE application_id = $1`,
    [application.id]
  );
  const interview = await query(`SELECT * FROM interviews WHERE application_id = $1 ORDER BY id DESC LIMIT 1`, [application.id]);
  res.json({ application, documents: docs.rows, interview: interview.rows[0] || null });
});

// Upload a document (cv | police_clearance | id_document).
router.post('/:id/documents', upload.single('file'), async (req, res) => {
  try {
    const app_ = await loadOwnApplication(req.params.id, req.user.sub);
    if (!app_) return res.status(404).json({ error: 'Application not found.' });
    if (!['draft', 'submitted'].includes(app_.status)) {
      return res.status(400).json({ error: 'Documents can no longer be changed for this application.' });
    }
    const docType = req.body.doc_type;
    if (!['cv', 'police_clearance', 'id_document'].includes(docType)) {
      return res.status(400).json({ error: 'Unknown document type.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file received.' });

    await query(
      `INSERT INTO application_documents (application_id, doc_type, original_name, stored_path, mime_type, size_bytes)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [app_.id, docType, req.file.originalname, req.file.path, req.file.mimetype, req.file.size]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Upload failed.' });
  }
});

// Screening questions for the applicant's chosen role (answers not exposed).
router.get('/:id/screening-questions', async (req, res) => {
  const app_ = await loadOwnApplication(req.params.id, req.user.sub);
  if (!app_) return res.status(404).json({ error: 'Application not found.' });
  const result = await query(
    `SELECT id, question, option_a, option_b, option_c, option_d
     FROM screening_questions WHERE role_id = $1 ORDER BY sort_order ASC`,
    [app_.role_id]
  );
  res.json({ questions: result.rows });
});

// Submit screening answers -> auto-score -> auto shortlist or auto reject (+ email).
router.post('/:id/submit-screening', async (req, res) => {
  try {
    const app_ = await loadOwnApplication(req.params.id, req.user.sub);
    if (!app_) return res.status(404).json({ error: 'Application not found.' });
    if (app_.status !== 'draft') return res.status(400).json({ error: 'This application has already been submitted.' });

    const docs = await query('SELECT doc_type FROM application_documents WHERE application_id = $1', [app_.id]);
    const uploadedTypes = new Set(docs.rows.map((d) => d.doc_type));
    const missing = REQUIRED_DOC_TYPES.filter((t) => !uploadedTypes.has(t));
    if (missing.length) {
      return res.status(400).json({ error: `Please upload the following before submitting: ${missing.join(', ')}.` });
    }

    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const questions = await query(
      'SELECT id, is_knockout, pass_option, points_a, points_b, points_c, points_d FROM screening_questions WHERE role_id = $1',
      [app_.role_id]
    );
    if (!questions.rows.length) return res.status(400).json({ error: 'No screening questions configured for this role yet.' });
    if (answers.length !== questions.rows.length) {
      return res.status(400).json({ error: 'Please answer every screening question before submitting.' });
    }

    const questionMap = new Map(questions.rows.map((q) => [q.id, q]));
    const pointsFor = (q, letter) => ({ A: q.points_a, B: q.points_b, C: q.points_c, D: q.points_d }[letter]);

    let knockoutFailed = false;
    let earnedPoints = 0;
    let maxPoints = 0;
    const rows = [];

    for (const a of answers) {
      const q = questionMap.get(Number(a.question_id)); // client may send the ID as a string
      if (!q) return res.status(400).json({ error: 'Invalid question in submission.' });
      const selected = String(a.selected_option || '').toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(selected)) return res.status(400).json({ error: 'Invalid answer option.' });

      let pointsAwarded = null;
      let thisKnockoutFailed = false;
      if (q.is_knockout) {
        thisKnockoutFailed = selected !== q.pass_option;
        if (thisKnockoutFailed) knockoutFailed = true;
      } else {
        const awarded = pointsFor(q, selected);
        if (awarded == null) return res.status(400).json({ error: 'Invalid answer option for a scored question.' });
        pointsAwarded = awarded;
        earnedPoints += awarded;
        maxPoints += Math.max(q.points_a || 0, q.points_b || 0, q.points_c || 0, q.points_d || 0);
      }
      rows.push([app_.id, q.id, selected, pointsAwarded, thisKnockoutFailed]);
    }

    const score = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : 100;
    const threshold = app_.pass_threshold ?? Number(process.env.DEFAULT_PASS_THRESHOLD || 70);
    const newStatus = !knockoutFailed && score >= threshold ? 'shortlisted' : 'rejected_auto';

    for (const [applicationId, questionId, selected, pointsAwarded, thisKnockoutFailed] of rows) {
      await query(
        `INSERT INTO screening_answers (application_id, question_id, selected_option, points_awarded, knockout_failed)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (application_id, question_id) DO UPDATE SET
           selected_option = EXCLUDED.selected_option, points_awarded = EXCLUDED.points_awarded, knockout_failed = EXCLUDED.knockout_failed`,
        [applicationId, questionId, selected, pointsAwarded, thisKnockoutFailed]
      );
    }

    await query(
      `UPDATE applications
       SET status = $1, screening_score = $2, knockout_failed = $3, screening_submitted_at = now(), updated_at = now()
       WHERE id = $4`,
      [newStatus, score, knockoutFailed, app_.id]
    );

    const userRes = await query('SELECT email, full_name FROM users WHERE id = $1', [req.user.sub]);
    const { email, full_name } = userRes.rows[0];

    if (newStatus === 'shortlisted') {
      await sendShortlistedEmail({ to: email, fullName: full_name, roleName: app_.role_name, applicationId: app_.id });
    } else {
      await sendRejectionEmail({ to: email, fullName: full_name, roleName: app_.role_name, applicationId: app_.id });
    }

    res.json({ status: newStatus, score, threshold, knockoutFailed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit screening answers.' });
  }
});

router.post('/:id/withdraw', async (req, res) => {
  const app_ = await loadOwnApplication(req.params.id, req.user.sub);
  if (!app_) return res.status(404).json({ error: 'Application not found.' });
  await query(`UPDATE applications SET status = 'withdrawn', updated_at = now() WHERE id = $1`, [app_.id]);
  res.json({ ok: true });
});

module.exports = router;
