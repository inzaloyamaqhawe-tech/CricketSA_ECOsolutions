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
        <a class="btn btn-primary" href="register.html">Start federation onboarding</a>
        <a class="btn btn-ghost" href="roles.html">Back to modules</a>
      </div>
    </div>
  `;
})();
