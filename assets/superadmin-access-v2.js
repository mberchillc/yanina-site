(() => {
  'use strict';
  const API = 'https://yanina-trainer-api.mberchillc.workers.dev';
  const REVISION = '20261103-3';
  const previewHref = path => {
    const url = new URL(path, location.href);
    if (url.origin === location.origin && /^\/(admin|alumno|student|superadmin)(\/|$)/.test(url.pathname)) url.searchParams.set('sa', REVISION);
    return url.href;
  };
  const OWNER_KEY = 'yaninaSuperadmin';
  const VIEW_KEY = 'yaninaSuperadminView';
  const SESSION_KEYS = ['yaninaAdminSession', 'yaninaStudentSession'];
  // Capture transport before legacy screens wrap window.fetch with their preview token.
  const ownerFetch = window.fetch.bind(window);
  const read = key => { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } };
  const owner = () => read(OWNER_KEY);
  const view = () => read(VIEW_KEY);
  const active = () => Boolean(owner()?.token);
  const storage = {
    getItem(key) { return (active() && SESSION_KEYS.includes(key) ? sessionStorage : localStorage).getItem(key); },
    setItem(key, value) { (active() && SESSION_KEYS.includes(key) ? sessionStorage : localStorage).setItem(key, value); },
    removeItem(key) { (active() && SESSION_KEYS.includes(key) ? sessionStorage : localStorage).removeItem(key); }
  };
  function logout() {
    [OWNER_KEY, VIEW_KEY, ...SESSION_KEYS].forEach(key => sessionStorage.removeItem(key));
    location.assign(previewHref('/superadmin/'));
  }
  async function api(path, data) {
    const response = await ownerFetch(API + '/api/superadmin/' + path, {
      method: data ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(owner()?.token ? { Authorization: 'Bearer ' + owner().token } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && !['login', 'setup'].includes(path)) logout();
      throw new Error(result.error || 'No se pudo completar la operación.');
    }
    return result;
  }
  async function switchView(value) {
    const result = await api('view', value === 'admin' ? { view: 'admin' } : { view: 'student', student_id: Number(value) });
    SESSION_KEYS.forEach(key => sessionStorage.removeItem(key));
    sessionStorage.setItem(VIEW_KEY, JSON.stringify(result));
    sessionStorage.setItem(result.view === 'admin' ? SESSION_KEYS[0] : SESSION_KEYS[1], JSON.stringify({
      role: result.view === 'admin' ? 'admin' : 'student', user: owner().username,
      username: owner().username, studentId: result.student_id, name: result.name,
      token: result.token, loggedIn: true, superadminPreview: true
    }));
    location.assign(previewHref(result.view === 'admin' ? '/admin/index.html' : '/alumno/index.html?id=' + encodeURIComponent(result.student_id)));
  }
  window.YaninaAccess = { REVISION, previewHref, API, OWNER_KEY, VIEW_KEY, storage, owner, view, active, api, logout, switchView };
  if (!active()) return;
  const protectedPage = /^\/(admin|alumno|student)\//.test(location.pathname) || location.pathname === '/nutricion.html';
  if (!protectedPage) return;
  if (Number(owner().exp) < Date.now() || !view() || Number(view().exp) < Date.now()) {
    sessionStorage.removeItem(VIEW_KEY);
    location.replace(previewHref('/superadmin/'));
    return;
  }
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    if (url.origin === API && !['GET', 'HEAD', 'OPTIONS'].includes(method) && !url.pathname.startsWith('/api/superadmin/')) {
      // Give existing forms a useful error without treating a preview restriction as an expired login.
      return Promise.resolve(new Response(JSON.stringify({ error: 'Esta es una vista de muestra de solo lectura. Los cambios no se guardaron.' }), { status: 409, headers: { 'Content-Type': 'application/json' } }));
    }
    return originalFetch(input, init);
  };
  document.addEventListener('DOMContentLoaded', async () => {
    const style = document.createElement('style');
    style.textContent = '.sa-bar{position:sticky;top:0;z-index:10000;display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:12px 20px;background:#183f35;color:white;font:14px Arial,sans-serif;box-shadow:0 3px 16px #0002}.sa-bar strong{color:#d9f2cb}.sa-bar select{max-width:100%;flex:1;min-width:160px;border-radius:10px;padding:9px;background:white;color:#183f35;border:0;font:inherit}.sa-bar a,.sa-bar button{color:white;background:none;border:1px solid #ffffff60;padding:9px 12px;border-radius:10px;text-decoration:none;cursor:pointer;font:inherit}.sa-bar small{opacity:.8}.sa-error{color:#ffdfb4}body:has(.sa-bar){display:block!important}.sa-bar:has(.sa-error){position:relative}@media print{.sa-bar{display:none}}';
    document.head.append(style);
    const bar = document.createElement('nav');
    bar.className = 'sa-bar';
    bar.setAttribute('aria-label', 'Cambiar vista Superadmin');
    const title = document.createElement('strong'); title.textContent = 'Superadmin';
    const label = document.createElement('label'); label.htmlFor = 'sa-view'; label.textContent = 'Ver como';
    const select = document.createElement('select'); select.id = 'sa-view'; select.disabled = true;
    const current = view();
    select.add(new Option(current.name || 'Cargando vistas…', current.view === 'admin' ? 'admin' : String(current.student_id)));
    const note = document.createElement('small'); note.textContent = 'Muestra · Solo lectura';
    const home = document.createElement('a'); home.href = previewHref('/superadmin/'); home.textContent = 'Todas las vistas';
    const exit = document.createElement('button'); exit.type = 'button'; exit.textContent = 'Salir'; exit.addEventListener('click', logout);
    const error = document.createElement('span'); error.className = 'sa-error'; error.setAttribute('role', 'status');
    bar.append(title, label, select, note, home, exit, error);
    document.body.prepend(bar);
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (link) link.href = previewHref(link.href);
    }, true);
    // Existing "Salir" buttons must also end the owner session and its preview credentials.
    document.addEventListener('click', event => {
      if (event.target.closest('#logoutBtn')) { event.preventDefault(); event.stopImmediatePropagation(); logout(); }
    }, true);
    select.addEventListener('change', async () => {
      select.disabled = true; error.textContent = '';
      try { await switchView(select.value); }
      catch (failure) { error.textContent = failure.message; select.disabled = false; }
    });
    try {
      const students = await api('students');
      select.replaceChildren(new Option('Yanina · Panel de administración', 'admin'));
      students.forEach(student => select.add(new Option(student.full_name + ' · ' + student.classes_count + ' clases', String(student.id))));
      select.value = current.view === 'admin' ? 'admin' : String(current.student_id);
      select.disabled = false;
    } catch (failure) { error.textContent = failure.message; }
  });
})();
