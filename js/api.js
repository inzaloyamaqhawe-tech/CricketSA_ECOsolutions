// Cricket ECO Solutions API layer.
//
// This is the ONLY file that needs to change to go from the local demo
// (no backend, no database - everything lives in this browser's
// localStorage) to the real Node/Express + PostgreSQL backend in
// `server/`. Every calling page (apply.js, admin.js, dashboard.html, ...)
// only ever talks to the `Api` object below - flip USE_REMOTE_API to
// `true` once the real backend is deployed and reachable, and nothing
// else in the frontend needs to change.
const USE_REMOTE_API = false;

const Api = USE_REMOTE_API ? (() => {
  // Real backend, talks to /api/* (server/routes/*.js).
  async function request(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  return {
    register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),
    updateProfile: (body) => request('/auth/profile', { method: 'PATCH', body: JSON.stringify(body) }),
    mode: 'remote',
    exportLocalData() { throw new Error('Export is only available in local demo mode.'); },
    importLocalData() { throw new Error('Import is only available in local demo mode.'); },
    recordCvScan() { throw new Error('CV keyword scan is not wired up on the real backend yet.'); },
    roles: () => request('/roles'),
    venues: () => request('/venues'),
    createApplication: (body) => request('/applications', { method: 'POST', body: JSON.stringify(body) }),
    myApplication: () => request('/applications/mine'),
    uploadDocument: (appId, docType, file) => {
      const fd = new FormData();
      fd.append('doc_type', docType);
      fd.append('file', file);
      return request(`/applications/${appId}/documents`, { method: 'POST', body: fd });
    },
    screeningQuestions: (appId) => request(`/applications/${appId}/screening-questions`),
    submitScreening: (appId, answers) => request(`/applications/${appId}/submit-screening`, { method: 'POST', body: JSON.stringify({ answers }) }),
    withdraw: (appId) => request(`/applications/${appId}/withdraw`, { method: 'POST' }),
    admin: {
      stats: () => request('/admin/stats'),
      applications: (params) => request(`/admin/applications?${new URLSearchParams(params).toString()}`),
      application: (id) => request(`/admin/applications/${id}`),
      scheduleInterview: (id, body) => request(`/admin/applications/${id}/interview`, { method: 'POST', body: JSON.stringify(body) }),
      decide: (id, decision) => request(`/admin/applications/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) }),
      roles: () => request('/admin/roles'),
      updateRole: (id, body) => request(`/admin/roles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    },
  };
})() : (() => {
  // Local demo mode: everything lives in this browser's localStorage.
  const DB_KEY = 'cricket_eco_local_db_v1';
  const SESSION_KEY = 'cricket_eco_local_session_v1';
  const err = (msg, payload) => { const e = new Error(msg); if (payload) e.payload = payload; return e; };

  function load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* fall through to fresh db */ }
    const db = {
      nextUserId: 2,
      nextAppId: 1,
      nextDocId: 1,
      users: [
        { id: 1, email: 'admin@cricketeco.demo', password: 'Admin@12345', role: 'admin', full_name: 'Cricket ECO Platform Admin', phone: '' },
      ],
      applications: [],
      emailLog: [],
    };
    save(db);
    return db;
  }
  function save(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { console.warn('[local-db] could not save (quota?)', e); }
  }
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }
  function setSession(userId) { localStorage.setItem(SESSION_KEY, JSON.stringify({ userId })); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  function currentUser(db) {
    const s = getSession();
    if (!s) return null;
    return db.users.find((u) => u.id === s.userId) || null;
  }
  function publicUser(u) {
    return {
      id: u.id, email: u.email, role: u.role, full_name: u.full_name, phone: u.phone,
      country_of_residence: u.country_of_residence || '', city_of_residence: u.city_of_residence || '',
    };
  }

  function roleById(id) { return ROLES.find((r) => r.id === Number(id)); }
  function venueById(id) { return id ? VENUES.find((v) => v.id === Number(id)) : null; }

  function fileToDataUrl(file) {
    return new Promise((resolve) => {
      const MAX_BYTES = 3 * 1024 * 1024; // keep localStorage happy
      if (file.size > MAX_BYTES) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  function decorateApplication(db, app) {
    const role = roleById(app.role_id);
    const venue = venueById(app.venue_id);
    const user = db.users.find((u) => u.id === app.user_id);
    return {
      ...app,
      role_name: role ? role.name : 'Unknown role',
      department: role ? role.department : null,
      pass_threshold: role ? role.pass_threshold : 70,
      venue_name: venue ? venue.name : null,
      venue_city: venue ? venue.city : null,
      full_name: user ? user.full_name : '',
      email: user ? user.email : '',
      phone: user ? user.phone : '',
    };
  }

  function logEmail(db, { to, type, subject }) {
    db.emailLog.push({ to, type, subject, sentAt: new Date().toISOString() });
    console.log(`%c[demo email] ${type} -> ${to}: ${subject}`, 'color:#0B4F2E;font-weight:bold;');
  }

  return {
    async register({ email, password, full_name, phone, country_of_residence, city_of_residence }) {
      const db = load();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err('A valid email is required.');
      if (!password || password.length < 8) throw err('Password must be at least 8 characters.');
      if (!full_name || !full_name.trim()) throw err('Full name is required.');
      if (!country_of_residence || !country_of_residence.trim()) throw err('Country of residence is required.');
      if (db.users.some((u) => u.email === email.toLowerCase())) throw err('An account with that email already exists.');
      const user = {
        id: db.nextUserId++, email: email.toLowerCase(), password, role: 'applicant', full_name: full_name.trim(), phone: phone || '',
        country_of_residence: country_of_residence.trim(), city_of_residence: city_of_residence || '',
      };
      db.users.push(user);
      save(db);
      setSession(user.id);
      logEmail(db, { to: user.email, type: 'welcome', subject: 'Welcome to Cricket ECO Solutions' });
      save(db);
      return { user: publicUser(user) };
    },

    async updateProfile({ full_name, phone, country_of_residence, city_of_residence }) {
      const db = load();
      const user = currentUser(db);
      if (!user) throw err('Not signed in.');
      if (!country_of_residence || !country_of_residence.trim()) throw err('Country of residence is required.');
      if (full_name && full_name.trim()) user.full_name = full_name.trim();
      user.phone = phone || '';
      user.country_of_residence = country_of_residence.trim();
      user.city_of_residence = city_of_residence || '';
      save(db);
      return { user: publicUser(user) };
    },

    async login({ email, password }) {
      const db = load();
      const user = db.users.find((u) => u.email === (email || '').toLowerCase());
      if (!user || user.password !== password) throw err('Invalid email or password.');
      setSession(user.id);
      return { user: publicUser(user) };
    },

    async logout() { clearSession(); return { ok: true }; },

    mode: 'local',
    // Everything lives in this browser's localStorage: a plain JSON blob
    // scoped to this PC only (nothing syncs to anyone else yet). These two
    // let an admin back it up to a file, or move it to another machine.
    exportLocalData() { return load(); },
    importLocalData(data) {
      if (!data || typeof data !== 'object' || !Array.isArray(data.users) || !Array.isArray(data.applications)) {
        throw err('That file does not look like a Cricket ECO Solutions export.');
      }
      save(data);
      return { ok: true };
    },

    async me() {
      const db = load();
      const user = currentUser(db);
      if (!user) throw err('Not signed in.');
      return { user: publicUser(user) };
    },

    async roles() {
      return {
        roles: ROLES.filter((r) => r.is_open !== false).map(
          ({ id, name, department, description, minQualifications, coreDuties, requiresCertification, certificationLabel }) =>
            ({ id, name, department, description, minQualifications, coreDuties, requiresCertification, certificationLabel })
        ),
      };
    },
    async venues() { return { venues: VENUES }; },

    async createApplication(body) {
      const db = load();
      const user = currentUser(db);
      if (!user) throw err('Not signed in.');
      if (!body.role_id) throw err('Please choose a platform module first.');
      const existing = db.applications.find((a) => a.user_id === user.id && !['withdrawn', 'rejected_auto', 'rejected_manual'].includes(a.status));
      if (existing) throw err('You already have an active onboarding request in progress.', { application_id: existing.id });

      const app = {
        id: db.nextAppId++,
        user_id: user.id,
        role_id: Number(body.role_id),
        venue_id: body.venue_id ? Number(body.venue_id) : null,
        // Snapshot from the account profile at the time of application, rather than asking again.
        country_of_residence: user.country_of_residence,
        city_of_residence: user.city_of_residence || '',
        date_of_birth: body.date_of_birth || null,
        motivation: body.motivation || '',
        availability_notes: body.availability_notes || '',
        status: 'draft',
        screening_score: null,
        knockout_failed: false,
        screening_submitted_at: null,
        decided_at: null,
        documents: [],
        answers: [],
        interview: null,
        created_at: new Date().toISOString(),
      };
      db.applications.push(app);
      save(db);
      return { application_id: app.id };
    },

    async myApplication() {
      const db = load();
      const user = currentUser(db);
      if (!user) throw err('Not signed in.');
      const mine = db.applications.filter((a) => a.user_id === user.id).sort((a, b) => b.id - a.id);
      const app = mine[0];
      if (!app) return { application: null };
      return { application: decorateApplication(db, app), documents: app.documents, interview: app.interview };
    },

    async uploadDocument(appId, docType, file) {
      const db = load();
      const app = db.applications.find((a) => a.id === Number(appId));
      if (!app) throw err('Application not found.');
      if (!['draft', 'submitted'].includes(app.status)) throw err('Documents can no longer be changed for this application.');
      const dataUrl = await fileToDataUrl(file);
      app.documents = app.documents.filter((d) => d.doc_type !== docType);
      app.documents.push({
        id: db.nextDocId++,
        doc_type: docType,
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        url: dataUrl, // data: URL for local preview/download; null if the file was too big to keep in localStorage
        uploaded_at: new Date().toISOString(),
      });
      save(db);
      return { ok: true };
    },

    async screeningQuestions(appId) {
      const db = load();
      const app = db.applications.find((a) => a.id === Number(appId));
      if (!app) throw err('Application not found.');
      const role = roleById(app.role_id);
      const questions = questionsForRole(role).map(({ id, question, option_a, option_b, option_c, option_d }) => ({ id, question, option_a, option_b, option_c, option_d }));
      return { questions };
    },

    async submitScreening(appId, answers) {
      const db = load();
      const app = db.applications.find((a) => a.id === Number(appId));
      if (!app) throw err('Application not found.');
      if (app.status !== 'draft') throw err('This application has already been submitted.');

      const uploadedTypes = new Set(app.documents.map((d) => d.doc_type));
      const missing = ['cv', 'police_clearance'].filter((t) => !uploadedTypes.has(t));
      if (missing.length) throw err(`Please upload the following before submitting: ${missing.join(', ')}.`);

      const role = roleById(app.role_id);
      const questions = questionsForRole(role);
      if (answers.length !== questions.length) throw err('Please answer every screening question before submitting.');

      let knockoutFailed = false;
      let earnedPoints = 0;
      let maxPoints = 0;
      const answerRows = [];
      for (const a of answers) {
        const q = questions.find((qq) => qq.id === a.question_id);
        if (!q) throw err('Invalid question in submission.');
        const selected = String(a.selected_option || '').toUpperCase();
        let pointsAwarded = null;
        let thisFailed = false;
        if (q.is_knockout) {
          thisFailed = selected !== q.pass_option;
          if (thisFailed) knockoutFailed = true;
        } else {
          const pointsMap = { A: q.points_a, B: q.points_b, C: q.points_c, D: q.points_d };
          const awarded = pointsMap[selected];
          if (awarded == null) throw err('Invalid answer option for a scored question.');
          pointsAwarded = awarded;
          earnedPoints += awarded;
          maxPoints += Math.max(q.points_a || 0, q.points_b || 0, q.points_c || 0, q.points_d || 0);
        }
        answerRows.push({ question_id: q.id, question: q.question, is_knockout: q.is_knockout, selected_option: selected, points_awarded: pointsAwarded, knockout_failed: thisFailed });
      }

      const score = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : 100;
      const threshold = role.pass_threshold || 70;
      const newStatus = !knockoutFailed && score >= threshold ? 'shortlisted' : 'rejected_auto';

      app.answers = answerRows;
      app.status = newStatus;
      app.screening_score = score;
      app.knockout_failed = knockoutFailed;
      app.screening_submitted_at = new Date().toISOString();

      const user = db.users.find((u) => u.id === app.user_id);
      logEmail(db, {
        to: user.email,
        type: newStatus === 'shortlisted' ? 'shortlisted' : 'rejection',
        subject: newStatus === 'shortlisted' ? 'Cricket ECO onboarding request received' : 'Your Cricket ECO onboarding request',
      });
      save(db);
      return { status: newStatus, score, threshold, knockoutFailed };
    },

    async recordCvScan(appId, scan) {
      const db = load();
      const app = db.applications.find((a) => a.id === Number(appId));
      if (!app) throw err('Application not found.');
      app.cv_scan = scan;
      save(db);
      return { ok: true };
    },

    async withdraw(appId) {
      const db = load();
      const app = db.applications.find((a) => a.id === Number(appId));
      if (!app) throw err('Application not found.');
      app.status = 'withdrawn';
      save(db);
      return { ok: true };
    },

    admin: {
      async stats() {
        const db = load();
        const counts = {};
        for (const a of db.applications) counts[a.status] = (counts[a.status] || 0) + 1;
        return { byStatus: Object.entries(counts).map(([status, count]) => ({ status, count })) };
      },

      async applications(params = {}) {
        const db = load();
        let rows = db.applications.map((a) => decorateApplication(db, a));
        if (params.status) rows = rows.filter((a) => a.status === params.status);
        if (params.role_id) rows = rows.filter((a) => a.role_id === Number(params.role_id));
        if (params.country) rows = rows.filter((a) => a.country_of_residence.toLowerCase().includes(String(params.country).toLowerCase()));
        if (params.q) {
          const q = String(params.q).toLowerCase();
          rows = rows.filter((a) => a.full_name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
        }
        rows.sort((a, b) => b.id - a.id);
        const pageSize = 25;
        const page = Number(params.page) || 1;
        const total = rows.length;
        const paged = rows.slice((page - 1) * pageSize, page * pageSize);
        return { applications: paged, total, page, pageSize };
      },

      async application(id) {
        const db = load();
        const app = db.applications.find((a) => a.id === Number(id));
        if (!app) throw err('Not found.');
        return { application: decorateApplication(db, app), documents: app.documents, answers: app.answers, interview: app.interview };
      },

      async scheduleInterview(id, body) {
        const db = load();
        const app = db.applications.find((a) => a.id === Number(id));
        if (!app) throw err('Not found.');
        const status = body.scheduled_at ? 'interview_scheduled' : 'interview_invited';
        app.interview = { scheduled_at: body.scheduled_at || null, meeting_link: body.meeting_link || null, notes: body.notes || null, status };
        app.status = status;
        const user = db.users.find((u) => u.id === app.user_id);
        logEmail(db, { to: user.email, type: 'interview_invite', subject: 'Cricket ECO discovery workshop invitation' });
        save(db);
        return { ok: true, status };
      },

      async decide(id, decision) {
        const db = load();
        const app = db.applications.find((a) => a.id === Number(id));
        if (!app) throw err('Not found.');
        const statusMap = { offer: 'offered', reject: 'rejected_manual', shortlist: 'shortlisted' };
        const newStatus = statusMap[decision];
        if (!newStatus) throw err('Invalid decision.');
        app.status = newStatus;
        app.decided_at = new Date().toISOString();
        const user = db.users.find((u) => u.id === app.user_id);
        if (decision === 'offer') logEmail(db, { to: user.email, type: 'offer', subject: 'Cricket ECO discovery approved' });
        if (decision === 'reject') logEmail(db, { to: user.email, type: 'rejection', subject: 'Your Cricket ECO onboarding request' });
        save(db);
        return { ok: true, status: newStatus };
      },

      async roles() { return { roles: ROLES }; },
      async updateRole(id, body) {
        const role = roleById(id);
        if (role && typeof body.is_open === 'boolean') role.is_open = body.is_open;
        return { ok: true };
      },
    },
  };
})();
