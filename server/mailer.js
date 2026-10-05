const nodemailer = require('nodemailer');
const { query } = require('./db');

const BRAND = {
  green: '#026637',
  greenDark: '#014D29',
  gold: '#FFCC07',
  ink: '#12241A',
};

const FROM = process.env.MAIL_FROM || 'Cricket ECO Solutions <no-reply@cricketeco.example>';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:4000';

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null; // dry-run mode
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

function shell(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f2f4f2;font-family:Segoe UI,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f2;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8e4;">
        <tr><td style="background:${BRAND.green};padding:22px 28px;">
          <span style="color:${BRAND.gold};font-weight:700;font-size:20px;letter-spacing:.3px;">Cricket ECO Solutions</span>
          <div style="color:#dff2e6;font-size:12px;margin-top:2px;">Integrated federation platform</div>
        </td></tr>
        <tr><td style="padding:28px 28px 8px;color:${BRAND.ink};font-size:15px;line-height:1.55;">
          <h2 style="margin:0 0 14px;color:${BRAND.greenDark};font-size:19px;">${title}</h2>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:20px 28px 26px;color:#5b6b60;font-size:12px;border-top:1px solid #eef2ef;margin-top:10px;">
          Cricket ECO Solutions. This is an automated message, please do not reply directly to this address.
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`;
}

async function sendMail({ to, subject, html, applicationId, emailType }) {
  const t = getTransporter();
  let sentOk = true;
  let errorMessage = null;
  try {
    if (t) {
      await t.sendMail({ from: FROM, to, subject, html });
    } else {
      console.log(`\n[mailer:DRY-RUN] To: ${to}\nSubject: ${subject}\n(SMTP not configured - email logged only, not sent. Set SMTP_* env vars to send for real.)\n`);
    }
  } catch (err) {
    sentOk = false;
    errorMessage = err.message;
    console.error('[mailer] send failed:', err.message);
  }
  await query(
    `INSERT INTO email_log (application_id, to_email, email_type, subject, sent_ok, error_message)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [applicationId || null, to, emailType, subject, sentOk, errorMessage]
  );
  return sentOk;
}

async function sendWelcomeEmail({ to, fullName }) {
  const html = shell('Welcome to Cricket ECO Solutions', `
    <p>Hi ${escapeHtml(fullName)},</p>
    <p>Thanks for creating an account with Cricket ECO Solutions. You can now review platform modules, upload discovery documents and track onboarding from your dashboard.</p>
    <p><a href="${PUBLIC_BASE_URL}/dashboard.html" style="color:${BRAND.greenDark};font-weight:600;">Go to your dashboard</a></p>
  `);
  return sendMail({ to, subject: 'Welcome to Cricket ECO Solutions', html, emailType: 'welcome' });
}

async function sendShortlistedEmail({ to, fullName, roleName, applicationId }) {
  const html = shell('Module ready for discovery', `
    <p>Hi ${escapeHtml(fullName)},</p>
    <p>Based on your readiness answers, <strong>${escapeHtml(roleName)}</strong> is ready for the next discovery stage.</p>
    <p>Our implementation team will be in touch shortly to arrange a discovery workshop. Please keep an eye on this inbox.</p>
  `);
  return sendMail({ to, subject: 'Cricket ECO onboarding request received', html, applicationId, emailType: 'shortlisted' });
}

async function sendRejectionEmail({ to, fullName, roleName, applicationId }) {
  const html = shell('Update on your Cricket ECO onboarding request', `
    <p>Hi ${escapeHtml(fullName)},</p>
    <p>Thank you for reviewing <strong>${escapeHtml(roleName)}</strong> and completing the readiness questions.</p>
    <p>Based on the current answers, this module needs a little more preparation before discovery can begin.</p>
    <p>You can refine the scope and submit again when the organisation is ready.</p>
  `);
  return sendMail({ to, subject: 'Your Cricket ECO onboarding request', html, applicationId, emailType: 'rejection' });
}

async function sendInterviewInviteEmail({ to, fullName, roleName, applicationId, scheduledAt, meetingLink }) {
  const when = scheduledAt ? new Date(scheduledAt).toLocaleString('en-ZA', { dateStyle: 'full', timeStyle: 'short' }) : 'a time to be confirmed';
  const html = shell('Discovery workshop invitation', `
    <p>Hi ${escapeHtml(fullName)},</p>
    <p>We would like to invite you to a discovery workshop for the <strong>${escapeHtml(roleName)}</strong> module.</p>
    <p><strong>When:</strong> ${escapeHtml(when)}<br/>
    ${meetingLink ? `<strong>Link:</strong> <a href="${escapeHtml(meetingLink)}" style="color:${BRAND.greenDark};">${escapeHtml(meetingLink)}</a>` : '<strong>Link:</strong> will be sent closer to the date.'}</p>
    <p>Please log in to your dashboard to confirm your availability.</p>
  `);
  return sendMail({ to, subject: 'Cricket ECO discovery workshop invitation', html, applicationId, emailType: 'interview_invite' });
}

async function sendOfferEmail({ to, fullName, roleName, applicationId }) {
  const html = shell('Discovery approved', `
    <p>Hi ${escapeHtml(fullName)},</p>
    <p>Good news. The <strong>${escapeHtml(roleName)}</strong> module has been approved for the next Cricket ECO discovery step. Further onboarding details will follow shortly.</p>
  `);
  return sendMail({ to, subject: 'Cricket ECO discovery approved', html, applicationId, emailType: 'offer' });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = {
  sendWelcomeEmail,
  sendShortlistedEmail,
  sendRejectionEmail,
  sendInterviewInviteEmail,
  sendOfferEmail,
};
