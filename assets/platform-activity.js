(() => {
  'use strict';
  // Owner previews are never real trainer/student usage.
  if (sessionStorage.getItem('yaninaSuperadmin')) return;
  const query = new URLSearchParams(location.search);
  const admin = location.pathname.startsWith('/admin/') || query.get('adminPreview') === '1';
  const key = admin ? 'yaninaAdminSession' : 'yaninaStudentSession';
  let session;
  try { session = JSON.parse(localStorage.getItem(key) || 'null'); } catch { return; }
  if (!session?.token || session.superadminPreview) return;
  const transport = window.fetch.bind(window);
  const send = action => transport('https://yanina-trainer-api.mberchillc.workers.dev/api/activity/session', {
    method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+session.token},
    body:JSON.stringify({action}), keepalive:true
  }).catch(() => {});
  const heartbeat = () => { if(document.visibilityState === 'visible') send('heartbeat'); };
  heartbeat();
  setInterval(heartbeat, 120000);
  document.addEventListener('visibilitychange', heartbeat);
  document.addEventListener('click', event => {
    if(event.target.closest('#logoutBtn')) send('close');
  }, true);
})();
