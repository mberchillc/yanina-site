from pathlib import Path


def patch_file(path, replacements):
    file_path = Path(path)
    text = file_path.read_text(encoding='utf-8')
    original = text
    for old, new in replacements:
        if old in text:
            text = text.replace(old, new, 1)
    if text != original:
        file_path.write_text(text, encoding='utf-8')
        print(f'patched {path}')
    else:
        print(f'no changes for {path}')


# Keep every public platform entry on the unified login gate.
patch_file('plataforma-demo.html', [
    ('href="/admin/login.html">Ya tengo cuenta', 'href="/login.html">Ya tengo cuenta'),
])

# Make old split login pages self-redirect even when static redirects are cached/ignored.
redirect_page = '''<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Acceso | Yanina Trainer</title>
  <meta http-equiv="refresh" content="0; url=/login.html" />
  <script>window.location.replace('/login.html');</script>
</head>
<body>
  <p>Redirigiendo al acceso de la plataforma...</p>
  <p><a href="/login.html">Ir al acceso</a></p>
</body>
</html>
'''
for login_path in ('admin/login.html', 'alumno/login.html'):
    p = Path(login_path)
    if p.exists() and 'window.location.replace(\'/login.html\')' not in p.read_text(encoding='utf-8'):
        p.write_text(redirect_page, encoding='utf-8')
        print(f'patched {login_path}')

# Add static redirect rules for all old login/demo entry points.
redirects = Path('_redirects')
redirect_text = redirects.read_text(encoding='utf-8') if redirects.exists() else ''
for line in [
    '/plataforma-demo.html /login.html 302',
    '/admin/login.html /login.html 302',
    '/alumno/login.html /login.html 302',
    '/student/login.html /login.html 302',
]:
    if line not in redirect_text:
        redirect_text = redirect_text.rstrip() + '\n' + line + '\n'
redirects.write_text(redirect_text, encoding='utf-8')

# Patch the admin student ficha page so it can call the now-protected API and show setup codes.
admin_path = Path('admin/alumno.html')
text = admin_path.read_text(encoding='utf-8')
original = text

api_line = '    const API_BASE = "https://yanina-trainer-api.mberchillc.workers.dev";'
auth_block = '''    const API_BASE = "https://yanina-trainer-api.mberchillc.workers.dev";
    const adminSessionData = JSON.parse(localStorage.getItem("yaninaAdminSession") || "{}");
    if (!adminSessionData.token) {
      localStorage.removeItem("yaninaAdminSession");
      window.location.href = "/login.html";
      throw new Error("ADMIN_AUTH_REQUIRED");
    }
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const url = typeof input === "string" ? input : input?.url || "";
      if (String(url).startsWith(API_BASE)) {
        const headers = new Headers(init.headers || {});
        headers.set("Authorization", `Bearer ${adminSessionData.token}`);
        return originalFetch(input, { ...init, headers });
      }
      return originalFetch(input, init);
    };'''
if 'adminSessionData' not in text and api_line in text:
    text = text.replace(api_line, auth_block, 1)

if 'id="studentSetupCodeBadge"' not in text:
    text = text.replace(
        '<span class="status-pill" id="studentUserBadge">Usuario: —</span>',
        '<span class="status-pill" id="studentUserBadge">Usuario: —</span>\n            <span class="status-pill pending" id="studentSetupCodeBadge">Codigo: —</span>',
        1,
    )

if 'function updateStudentAccountBadges(account)' not in text:
    marker = '''    function updateStudentUserBadge() {
      const badge = document.getElementById("studentUserBadge");
      if (!badge) return;

      const username = generateStudentUsername(studentNameInput?.value || "");
      badge.textContent = username ? `Usuario: ${username}` : "Usuario: —";
    }
'''
    insert = marker + '''
    function updateStudentAccountBadges(account) {
      const userBadge = document.getElementById("studentUserBadge");
      const codeBadge = document.getElementById("studentSetupCodeBadge");
      if (userBadge) {
        const fallback = generateStudentUsername(studentNameInput?.value || "");
        userBadge.textContent = account?.username ? `Usuario: ${account.username}` : (fallback ? `Usuario: ${fallback}` : "Usuario: —");
      }
      if (codeBadge) {
        const hasPassword = Boolean(account?.password_hash) && Number(account?.password_requires_reset || 0) !== 1 && Number(account?.password_setup_version || 0) === 1;
        codeBadge.textContent = hasPassword
          ? "Contrasena creada"
          : account?.setup_code
            ? `Codigo: ${account.setup_code}`
            : "Codigo: guardar ficha";
        codeBadge.classList.toggle("pending", !hasPassword);
        codeBadge.classList.toggle("completed", hasPassword);
      }
    }
'''
    if marker in text:
        text = text.replace(marker, insert, 1)

if 'updateStudentAccountBadges(student.student_account);' not in text:
    text = text.replace('      updateStudentIdentity();\n    }\n\n    function resetForNewStudent()', '      updateStudentIdentity();\n      updateStudentAccountBadges(student.student_account);\n    }\n\n    function resetForNewStudent()', 1)

if 'updateStudentAccountBadges(null);' not in text:
    text = text.replace('      updateStudentIdentity();\n      renderCalendarAndClasses();', '      updateStudentIdentity();\n      updateStudentAccountBadges(null);\n      renderCalendarAndClasses();', 1)

if 'updateStudentAccountBadges(saved?.student_account || saved?.student?.student_account || null);' not in text:
    text = text.replace(
        '          if (saved?.id || saved?.student?.id) {\n            studentId = saved.id || saved.student.id;\n          }\n          updateStarfitLinks();',
        '          if (saved?.id || saved?.student?.id) {\n            studentId = saved.id || saved.student.id;\n          }\n          updateStudentAccountBadges(saved?.student_account || saved?.student?.student_account || null);\n          updateStarfitLinks();',
        1,
    )

# Surface actual backend errors instead of always saying the alumno could not be created.
text = text.replace(
    '''      if (!response.ok) {
        throw new Error(isCreatingStudent ? "No se pudo crear el alumno" : "No se pudieron guardar los datos");
      }

      const savedStudent = await response.json();''',
    '''      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.error === "ADMIN_AUTH_REQUIRED") {
          localStorage.removeItem("yaninaAdminSession");
          window.location.href = "/login.html";
          throw new Error("Sesion admin vencida. Volve a entrar y guarda la ficha otra vez.");
        }
        throw new Error(errorData.error || (isCreatingStudent ? "No se pudo crear el alumno" : "No se pudieron guardar los datos"));
      }

      const savedStudent = await response.json();''',
    1,
)

if text != original:
    admin_path.write_text(text, encoding='utf-8')
    print('patched admin/alumno.html')
else:
    print('admin/alumno.html already patched')

# Patch student dashboard API calls so Mi ficha loads the real saved profile.
student_path = Path('alumno/index.html')
student_text = student_path.read_text(encoding='utf-8')
student_original = student_text
student_marker = "const API_BASE='https://yanina-trainer-api.mberchillc.workers.dev';const params=new URLSearchParams(window.location.search);const sessionData=JSON.parse(localStorage.getItem('yaninaStudentSession')||'{}');const STUDENT_ID=String(params.get('id')||params.get('studentId')||sessionData.studentId||'6');"
student_replacement = "const API_BASE='https://yanina-trainer-api.mberchillc.workers.dev';const params=new URLSearchParams(window.location.search);const sessionData=JSON.parse(localStorage.getItem('yaninaStudentSession')||'{}');if(!sessionData.token||!sessionData.studentId){localStorage.removeItem('yaninaStudentSession');window.location.href='/login.html';throw new Error('STUDENT_AUTH_REQUIRED')}const originalFetch=window.fetch.bind(window);window.fetch=(input,init={})=>{const url=typeof input==='string'?input:input?.url||'';if(String(url).startsWith(API_BASE)){const headers=new Headers(init.headers||{});headers.set('Authorization',`Bearer ${sessionData.token}`);return originalFetch(input,{...init,headers})}return originalFetch(input,init)};const STUDENT_ID=String(params.get('id')||params.get('studentId')||sessionData.studentId);"
if 'STUDENT_AUTH_REQUIRED' not in student_text and student_marker in student_text:
    student_text = student_text.replace(student_marker, student_replacement, 1)

# Keep the session display synchronized with the loaded ficha in case the login payload had a fallback name.
if "localStorage.setItem('yaninaStudentSession',JSON.stringify({...sessionData,name,studentId:STUDENT_ID}))" not in student_text:
    student_text = student_text.replace(
        "function renderStudent(student){const name=student.full_name||student.name||'Alumna';$('sideName').textContent=name;",
        "function renderStudent(student){const name=student.full_name||student.name||'Alumna';localStorage.setItem('yaninaStudentSession',JSON.stringify({...sessionData,name,studentId:STUDENT_ID}));$('sideName').textContent=name;",
        1,
    )

if student_text != student_original:
    student_path.write_text(student_text, encoding='utf-8')
    print('patched alumno/index.html')
else:
    print('alumno/index.html already patched')

# Triggered 2026-06-26: publish student dashboard auth patch.
