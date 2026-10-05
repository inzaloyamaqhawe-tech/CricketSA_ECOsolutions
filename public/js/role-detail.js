(async function () {
  const params = new URLSearchParams(window.location.search);
  const roleId = Number(params.get('id'));
  const box = document.getElementById('role-detail');

  const { roles } = await Api.roles();
  const module = roles.find((r) => r.id === roleId);

  if (!module) {
    box.innerHTML = '<div class="card"><p>That module could not be found.</p><a class="btn btn-ghost" href="roles.html">Back to all modules</a></div>';
    return;
  }

  document.title = `${module.name} - Cricket ECO Solutions`;
  const outcomesHtml = (module.minQualifications || []).map((q) => `<li>${q}</li>`).join('');
  const featuresHtml = (module.coreDuties || []).map((d) => `<li>${d}</li>`).join('');
  const applyUrl = `apply.html?role=${module.id}`;
  let startHref = `register.html?next=${encodeURIComponent(applyUrl)}`;
  let startText = 'Create account to start onboarding';
  try {
    await Api.me();
    startHref = applyUrl;
    startText = 'Start federation onboarding';
  } catch {
    // Logged-out users will create an account first, then return to this module.
  }

  box.innerHTML = `
    <div class="card module-detail">
      <p class="dept" style="color:var(--gold-dark);font-weight:700;font-size:12px;letter-spacing:.5px;text-transform:uppercase;">${module.department || 'Cricket ECO'}</p>
      <h1 class="section-title" style="margin-top:6px;">${module.name}</h1>
      <p class="section-sub mt-0">${module.description}</p>

      <h3>Federation outcomes</h3>
      <ul>${outcomesHtml}</ul>

      <h3>Core platform features</h3>
      <ul>${featuresHtml}</ul>

      <div style="margin-top:24px;">
        <a class="btn btn-primary" href="${startHref}">${startText}</a>
        <a class="btn btn-ghost" href="roles.html">Back to modules</a>
      </div>
    </div>
  `;
})();
