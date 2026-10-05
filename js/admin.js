(async function () {
  let user;
  try { ({ user } = await Api.me()); } catch { window.location.href = '../login.html'; return; }
  if (user.role !== 'admin') { window.location.href = '../dashboard.html'; return; }
  document.getElementById('who').textContent = `${user.full_name} (admin)`;
  document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault(); await Api.logout(); window.location.href = '../index.html';
  });

  let page = 1;

  if (Api.mode === 'local') {
    document.getElementById('mode-note').textContent =
      'Running in local demo mode: all data below lives only in this browser on this PC (a JSON store), and won\'t appear on any other device yet. Use Export/Import to back it up or move it.';
  } else {
    document.getElementById('data-toolbar').classList.add('hidden');
  }

  document.getElementById('export-data-btn').addEventListener('click', () => {
    const data = Api.exportLocalData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cricket-eco-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById('import-data-btn').addEventListener('click', () => {
    document.getElementById('import-data-input').click();
  });
  document.getElementById('import-data-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      Api.importLocalData(JSON.parse(text));
      alert('Data imported. Reloading...');
      window.location.reload();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    } finally {
      e.target.value = '';
    }
  });

  async function loadStats() {
    const { byStatus } = await Api.admin.stats();
    const map = Object.fromEntries(byStatus.map((s) => [s.status, s.count]));
    const total = byStatus.reduce((s, r) => s + r.count, 0);
    const tiles = [
      ['Total requests', total],
      ['Submitted', map.submitted || 0],
      ['Shortlisted', map.shortlisted || 0],
      ['Interview stage', (map.interview_invited || 0) + (map.interview_scheduled || 0)],
      ['Offered', map.offered || 0],
      ['Rejected', (map.rejected_auto || 0) + (map.rejected_manual || 0)],
    ];
    document.getElementById('stats').innerHTML = tiles.map(([label, num]) => `
      <div class="stat-tile"><div class="num">${num}</div><div class="label">${label}</div></div>
    `).join('');
  }

  async function loadRoleFilter() {
    const { roles } = await Api.admin.roles();
    document.getElementById('f-role').innerHTML = '<option value="">All modules</option>' +
      roles.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
  }

  function currentFilters() {
    const f = {};
    const status = document.getElementById('f-status').value;
    const role_id = document.getElementById('f-role').value;
    const country = document.getElementById('f-country').value.trim();
    const q = document.getElementById('f-q').value.trim();
    if (status) f.status = status;
    if (role_id) f.role_id = role_id;
    if (country) f.country = country;
    if (q) f.q = q;
    f.page = page;
    return f;
  }

  async function loadRows() {
    const tbody = document.getElementById('rows');
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Loading...</td></tr>';
    const { applications, total, pageSize } = await Api.admin.applications(currentFilters());
    if (!applications.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No onboarding requests match these filters.</td></tr>';
    } else {
      tbody.innerHTML = applications.map((a) => `
        <tr data-id="${a.id}">
          <td>${a.full_name}<br><span class="muted" style="font-size:12px;">${a.email}</span></td>
          <td>${a.role_name}</td>
          <td>${a.country_of_residence}</td>
          <td>${a.venue_name || '-'}</td>
          <td>${a.screening_score != null ? a.screening_score + '%' : '-'}</td>
          <td><span class="badge badge-${a.status}">${a.status.replace('_',' ')}</span></td>
          <td>${new Date(a.created_at).toLocaleDateString()}</td>
        </tr>
      `).join('');
    }
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    document.getElementById('pager').innerHTML = `
      <button class="btn btn-ghost btn-sm" id="prev-page" ${page <= 1 ? 'disabled' : ''}>Prev</button>
      <span class="muted" style="margin:0 10px;">Page ${page} of ${totalPages} (${total} total)</span>
      <button class="btn btn-ghost btn-sm" id="next-page" ${page >= totalPages ? 'disabled' : ''}>Next</button>
    `;
    document.getElementById('prev-page').addEventListener('click', () => { page = Math.max(1, page - 1); loadRows(); });
    document.getElementById('next-page').addEventListener('click', () => { page += 1; loadRows(); });
    tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.addEventListener('click', () => openDetail(tr.dataset.id));
    });
  }

  document.getElementById('f-apply').addEventListener('click', () => { page = 1; loadRows(); });

  const backdrop = document.getElementById('modal-backdrop');
  const modalBody = document.getElementById('modal-body');

  function closeModal() { backdrop.classList.add('hidden'); modalBody.innerHTML = ''; }
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

  async function openDetail(id) {
    const { application: a, documents, answers, interview } = await Api.admin.application(id);
    const docsHtml = documents.map((d) => {
      const label = `${d.doc_type.replace('_',' ')} - ${d.original_name}`;
      const href = d.url || `/api/admin/applications/${a.id}/documents/${d.id}/download`;
      return d.url === null
        ? `<li>${label} <span class="muted">(file too large for this demo store - not kept)</span></li>`
        : `<li><a href="${href}" target="_blank" rel="noopener">${label}</a></li>`;
    }).join('') || '<li class="muted">No documents uploaded</li>';

    const answersHtml = answers.map((ans) => {
      if (ans.is_knockout) {
        return `<li>${ans.question} - chose <strong>${ans.selected_option}</strong> ${ans.knockout_failed ? 'knockout failed' : 'passed'}</li>`;
      }
      return `<li>${ans.question} - chose <strong>${ans.selected_option}</strong> (${ans.points_awarded} pts)</li>`;
    }).join('') || '<li class="muted">No screening answers yet</li>';

    const interviewHtml = interview ? `
      <p class="muted">Existing interview: ${interview.status}${interview.scheduled_at ? ' at ' + new Date(interview.scheduled_at).toLocaleString() : ''}</p>
    ` : '';

    const cvScanHtml = a.cv_scan ? `
      <h3>CV keyword scan</h3>
      <p><strong>${a.cv_scan.score}%</strong> match (${a.cv_scan.matched.length}/${a.cv_scan.matched.length + a.cv_scan.missing.length} relevant terms)</p>
      ${a.cv_scan.matched.length ? `<p class="muted">Found: ${a.cv_scan.matched.join(', ')}</p>` : ''}
      ${a.cv_scan.missing.length ? `<p class="muted">Not found: ${a.cv_scan.missing.join(', ')}</p>` : ''}
    ` : '';

    modalBody.innerHTML = `
      <button class="modal-close" id="modal-close">x</button>
      <h2 class="mt-0" style="color:var(--green-dark);">${a.full_name}</h2>
      <p class="muted">${a.email} ${a.phone ? ' - ' + a.phone : ''}</p>
      <p><span class="badge badge-${a.status}">${a.status.replace('_',' ')}</span></p>
      <p><strong>Module:</strong> ${a.role_name} &nbsp; <strong>Pilot hub:</strong> ${a.venue_name || '-'}</p>
      <p><strong>Country:</strong> ${a.country_of_residence} ${a.city_of_residence ? '(' + a.city_of_residence + ')' : ''}</p>
      ${a.motivation ? `<p><strong>Motivation:</strong> ${a.motivation}</p>` : ''}
      ${a.screening_score != null ? `<p><strong>Screening score:</strong> ${a.screening_score}%${a.knockout_failed ? ' <span style="color:var(--danger);">(failed a mandatory knockout question)</span>' : ''}</p>` : ''}

      <h3>Documents</h3>
      <ul>${docsHtml}</ul>
      ${cvScanHtml}

      <h3>Screening answers</h3>
      <ul>${answersHtml}</ul>

      ${interviewHtml}
      <h3>Schedule / invite to online interview</h3>
      <div class="row-2">
        <div class="field"><label>Date &amp; time</label><input type="datetime-local" id="int-time"></div>
        <div class="field"><label>Meeting link</label><input type="text" id="int-link" placeholder="https://..."></div>
      </div>
      <div class="field"><label>Notes</label><textarea id="int-notes"></textarea></div>
      <button class="btn btn-solid btn-sm" id="btn-invite">Send interview invite</button>

      <h3>Decision</h3>
      <button class="btn btn-solid btn-sm" id="btn-shortlist">Shortlist</button>
      <button class="btn btn-primary btn-sm" id="btn-offer">Offer</button>
      <button class="btn btn-danger btn-sm" id="btn-reject">Reject (send email)</button>
    `;
    backdrop.classList.remove('hidden');
    document.getElementById('modal-close').addEventListener('click', closeModal);

    document.getElementById('btn-invite').addEventListener('click', async () => {
      const scheduled_at = document.getElementById('int-time').value || null;
      const meeting_link = document.getElementById('int-link').value.trim() || null;
      const notes = document.getElementById('int-notes').value.trim() || null;
      await Api.admin.scheduleInterview(a.id, { scheduled_at, meeting_link, notes });
      closeModal(); loadRows(); loadStats();
    });
    document.getElementById('btn-shortlist').addEventListener('click', () => decide(a.id, 'shortlist'));
    document.getElementById('btn-offer').addEventListener('click', () => decide(a.id, 'offer'));
    document.getElementById('btn-reject').addEventListener('click', () => decide(a.id, 'reject'));
  }

  async function decide(id, decision) {
    if (decision === 'reject' && !confirm('Send an automatic rejection email to this applicant?')) return;
    await Api.admin.decide(id, decision);
    closeModal(); loadRows(); loadStats();
  }

  await Promise.all([loadStats(), loadRoleFilter()]);
  await loadRows();
})();
