(async function () {
  const alertBox = document.getElementById('alert-box');
  const state = { appId: null, roleId: null, role: null, uploaded: new Set() };

  function showAlert(message, type = 'error') {
    alertBox.innerHTML = `<div class="alert alert-${type === 'ok' ? 'ok' : 'error'}">${message}</div>`;
  }

  function showStep(n) {
    [1, 2, 3].forEach((i) => {
      document.getElementById(`step-${i}`).classList.toggle('hidden', i !== n);
      const el = document.querySelector(`.step[data-step="${i}"]`);
      el.classList.toggle('active', i === n);
      el.classList.toggle('done', i < n);
    });
    document.getElementById('step-result').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function fillVenues() {
    const { venues } = await Api.venues();
    const venueSel = document.getElementById('venue_id');
    venueSel.innerHTML = '<option value="">No preference</option>' + venues.map((v) => `<option value="${v.id}">${v.name} (${v.city})</option>`).join('');
  }

  function markUploaded(docType) {
    state.uploaded.add(docType);
    document.getElementById(`box-${docType}`).classList.add('has-file');
      document.getElementById(`status-${docType}`).textContent = 'Uploaded';
  }

  // Plain keyword search against the chosen module's keyword list; see
  // scoreCvText() / pdf-extract.js. No AI, no upload to any third party;
  // the PDF is parsed entirely in this browser.
  async function scanCv(file) {
    const resultBox = document.getElementById('cv-scan-result');
    if (!resultBox) return;
    const role = state.role;
    if (!role || !role.keywords || file.type !== 'application/pdf') {
      resultBox.innerHTML = file.type !== 'application/pdf'
        ? '<p class="hint">Keyword scan only works on PDF files right now. This file will still be reviewed during discovery.</p>'
        : '';
      return;
    }
    resultBox.innerHTML = '<p class="hint">Scanning document for relevant keywords...</p>';
    try {
      if (!window.extractPdfText) throw new Error('PDF scanner did not load');
      const text = await window.extractPdfText(file);
      if (!text) {
        resultBox.innerHTML = '<p class="hint">Could not extract text from this PDF, likely a scanned image. It will still be reviewed during discovery.</p>';
        return;
      }
      const { score, matched, missing } = scoreCvText(text, role.keywords);
      if (state.appId) Api.recordCvScan(state.appId, { score, matched, missing, textLength: text.length }).catch(() => {});
      resultBox.innerHTML = `
        <p class="hint">Keyword match for <strong>${role.name}</strong>: <strong>${score}%</strong> (${matched.length}/${role.keywords.length} relevant terms found)</p>
        ${matched.length ? `<p class="hint">Found: ${matched.join(', ')}</p>` : ''}
      `;
    } catch (err) {
      resultBox.innerHTML = `<p class="hint">Keyword scan skipped (${err.message}). This file will still be reviewed during discovery.</p>`;
    }
  }

  function wireUpload(docType) {
    document.getElementById(`file-${docType}`).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !state.appId) return;
      document.getElementById(`status-${docType}`).textContent = 'Uploading...';
      try {
        await Api.uploadDocument(state.appId, docType, file);
        markUploaded(docType);
        if (docType === 'cv') scanCv(file);
      } catch (err) {
        document.getElementById(`status-${docType}`).textContent = `Failed: ${err.message}`;
      }
    });
  }

  async function renderQuestions() {
    const { questions } = await Api.screeningQuestions(state.appId);
    const box = document.getElementById('questions');
    box.innerHTML = questions.map((q, idx) => `
      <div class="question" data-qid="${q.id}">
        <p class="q-text">${idx + 1}. ${q.question}</p>
        ${['A', 'B', 'C', 'D'].filter((opt) => q['option_' + opt.toLowerCase()]).map((opt) => `
          <label class="option-row">
            <input type="radio" name="q-${q.id}" value="${opt}">
            <span>${q['option_' + opt.toLowerCase()]}</span>
          </label>
        `).join('')}
      </div>
    `).join('');
  }

  document.getElementById('to-step-2').addEventListener('click', async () => {
    try {
      const body = {
        role_id: state.roleId,
        venue_id: document.getElementById('venue_id').value ? Number(document.getElementById('venue_id').value) : null,
        date_of_birth: document.getElementById('date_of_birth').value || null,
        motivation: document.getElementById('motivation').value.trim(),
        availability_notes: document.getElementById('availability_notes').value.trim(),
      };
      const result = await Api.createApplication(body);
      state.appId = result.application_id;
      alertBox.innerHTML = '';
      showStep(2);
    } catch (err) {
      if (err.payload && err.payload.application_id) {
        state.appId = err.payload.application_id;
        showStep(2);
      } else {
        showAlert(err.message);
      }
    }
  });

  document.getElementById('to-step-3').addEventListener('click', async () => {
    if (!state.uploaded.has('cv') || !state.uploaded.has('police_clearance')) {
      return showAlert('Please upload the records sample and governance or policy document before continuing.');
    }
    alertBox.innerHTML = '';
    await renderQuestions();
    showStep(3);
  });

  document.getElementById('submit-screening').addEventListener('click', async () => {
    const questionEls = document.querySelectorAll('#questions .question');
    const answers = [];
    for (const qEl of questionEls) {
      const qid = qEl.dataset.qid; // string for local demo IDs; the real backend coerces numeric IDs
      const checked = qEl.querySelector('input[type=radio]:checked');
      if (!checked) return showAlert('Please answer every question before submitting.');
      answers.push({ question_id: qid, selected_option: checked.value });
    }
    try {
      const result = await Api.submitScreening(state.appId, answers);
      const resultBox = document.getElementById('step-result');
      [1, 2, 3].forEach((i) => document.getElementById(`step-${i}`).classList.add('hidden'));
      resultBox.classList.remove('hidden');
      if (result.status === 'shortlisted') {
        resultBox.innerHTML = `
          <div class="alert alert-ok">You scored ${result.score}% and this module is <strong>ready for discovery</strong>.</div>
          <p>Our implementation team will be in touch to schedule a discovery workshop. You can track your status any time from your dashboard.</p>
          <a class="btn btn-solid" href="dashboard.html">Go to my dashboard</a>`;
      } else {
        const reason = result.knockoutFailed
          ? "Based on your answers, one or more discovery requirements still need attention."
          : `Your readiness score of ${result.score}% did not meet the threshold for this module.`;
        resultBox.innerHTML = `
          <div class="alert alert-error">Thank you for completing the onboarding request. ${reason}</div>
          <p>A confirmation email has been logged. You can refine the scope and submit again when ready.</p>
          <a class="btn btn-ghost" href="dashboard.html">View my request</a>`;
      }
    } catch (err) {
      showAlert(err.message);
    }
  });

  // --- init ---
  let user;
  try { ({ user } = await Api.me()); } catch {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `login.html?next=${next}`;
    return;
  }

  const { roles } = await Api.roles();
  await fillVenues();
  ['cv', 'police_clearance', 'id_document'].forEach(wireUpload);

  // Resuming an in-progress request from the dashboard takes priority over
  // the query param. The module was locked in when the request was created.
  let mine = null;
  try { mine = await Api.myApplication(); } catch { /* none yet */ }

  if (mine && mine.application) {
    const existing = mine.application;
    if (existing.status !== 'draft') {
      window.location.href = 'dashboard.html';
      return;
    }
    state.appId = existing.id;
    state.roleId = existing.role_id;
    state.role = roles.find((r) => r.id === existing.role_id);
    document.getElementById('role-banner').textContent = `Selected module: ${existing.role_name || (state.role && state.role.name) || 'your selected module'}`;
    (mine.documents || []).forEach((d) => markUploaded(d.doc_type));
    showStep(2);
    return;
  }

  // Fresh start: a module must already be chosen from the module board.
  state.roleId = Number(new URLSearchParams(window.location.search).get('role'));
  state.role = roles.find((r) => r.id === state.roleId);
  if (!state.role) {
    window.location.href = 'roles.html';
    return;
  }
  document.getElementById('role-banner').textContent = `Selected module: ${state.role.name}`;
  showStep(1);
})();
