(async function () {
  const board = document.getElementById('roles-board');
  const { roles } = await Api.roles();

  function renderBoard(list) {
    if (!list.length) {
      board.innerHTML = '<p class="muted">No modules match your search.</p>';
      return;
    }
    const byDept = new Map();
    for (const module of list) {
      if (!byDept.has(module.department)) byDept.set(module.department, []);
      byDept.get(module.department).push(module);
    }
    board.innerHTML = [...byDept.entries()].map(([dept, moduleList]) => `
      <h2 class="module-group">${dept || 'Platform modules'}</h2>
      <div class="grid grid-3">
        ${moduleList.map((module) => `
          <a class="card role-card" href="role.html?id=${module.id}" style="text-decoration:none;color:inherit;display:block;">
            <div class="dept">${module.department || 'Cricket ECO'}</div>
            <h3>${module.name}</h3>
            <p>${module.description}</p>
            <p class="hint" style="margin-top:12px;color:var(--green-dark);font-weight:700;">View module details</p>
          </a>
        `).join('')}
      </div>
    `).join('');
  }

  renderBoard(roles);

  const searchInput = document.getElementById('role-search');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { renderBoard(roles); return; }
    renderBoard(roles.filter((module) =>
      module.name.toLowerCase().includes(q)
      || (module.department || '').toLowerCase().includes(q)
      || (module.description || '').toLowerCase().includes(q)
      || (module.minQualifications || []).some((x) => x.toLowerCase().includes(q))
      || (module.coreDuties || []).some((x) => x.toLowerCase().includes(q))
    ));
  });
})();
