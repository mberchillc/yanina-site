(function () {
  'use strict';

  const API_BASE = 'https://yanina-trainer-api.mberchillc.workers.dev';
  const session = JSON.parse(localStorage.getItem('yaninaStudentSession') || '{}');
  if (!session.token || !session.studentId) {
    localStorage.removeItem('yaninaStudentSession');
    window.location.href = '/login.html';
    throw new Error('STUDENT_AUTH_REQUIRED');
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!String(url).startsWith(API_BASE)) return originalFetch(input, init);
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${session.token}`);
    return originalFetch(input, { ...init, headers });
  };

  const STUDENT_ID = String(session.studentId);
  const requestedClassId = new URLSearchParams(window.location.search).get('classId');
  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  const normalize = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  let classes = [];
  let selectedClass = null;
  let exercises = [];
  let exerciseLibrary = [];
  let pendingVideoFile = null;

  function dateIso(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  }

  function todayIso() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function formatClassDate(value) {
    const iso = dateIso(value);
    if (!iso) return 'Fecha sin definir';
    const [year, month, day] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('es-AR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC'
    }).format(new Date(Date.UTC(year, month - 1, day)));
  }

  function normalizeStatus(status) {
    return String(status || 'draft').toLowerCase();
  }

  function isMeaningfulClass(item) {
    if (!item) return false;
    const status = normalizeStatus(item.status);
    const routine = String(item.routine_type || '').trim().toLowerCase();
    return status !== 'draft'
      || Boolean(String(item.class_time || '').trim())
      || Boolean(routine && routine !== 'nueva clase' && routine !== 'clase')
      || Boolean(String(item.planning_criteria || '').trim())
      || Boolean(item.has_routine);
  }

  async function loadStudent() {
    const response = await fetch(`${API_BASE}/api/students/${encodeURIComponent(STUDENT_ID)}`);
    if (!response.ok) throw new Error('No se pudo cargar tu perfil.');
    return response.json();
  }

  async function loadClasses() {
    const response = await fetch(`${API_BASE}/api/students/${encodeURIComponent(STUDENT_ID)}/classes?cache=${Date.now()}`);
    if (!response.ok) throw new Error('No se pudieron cargar tus clases.');
    const data = await response.json();
    classes = (Array.isArray(data) ? data : []).filter(isMeaningfulClass).sort((a, b) =>
      String(a.class_date || '').localeCompare(String(b.class_date || ''))
      || String(a.class_time || '').localeCompare(String(b.class_time || ''))
    );
  }

  function chooseClass() {
    const requested = requestedClassId
      ? classes.find(item => String(item.id) === String(requestedClassId))
      : null;
    if (requested) return requested;
    const today = todayIso();
    return classes.find(item => dateIso(item.class_date) === today)
      || classes.find(item => dateIso(item.class_date) > today)
      || classes[classes.length - 1]
      || null;
  }

  async function loadExerciseLibrary() {
    try {
      const response = await fetch(`../exercises.json?cache=${Date.now()}`);
      exerciseLibrary = response.ok ? await response.json() : [];
    } catch (_) {
      exerciseLibrary = [];
    }
  }

  async function loadRoutine() {
    const response = await fetch(`${API_BASE}/api/classes/${encodeURIComponent(selectedClass.id)}/routine?cache=${Date.now()}`);
    if (!response.ok) throw new Error('No se pudo cargar la rutina.');
    return response.json();
  }

  function renderClassHeader() {
    const status = normalizeStatus(selectedClass?.status);
    byId('classSummary').textContent = selectedClass
      ? `${formatClassDate(selectedClass.class_date)} · ${selectedClass.class_time || 'Sin hora'} · ${selectedClass.routine_type || 'Clase'}`
      : 'No hay una clase programada para mostrar.';
    byId('classStatus').textContent = !selectedClass ? 'Sin clase' : status === 'completed' ? 'Realizada' : status === 'cancelled' ? 'Cancelada' : 'Programada';
  }

  function findLibraryExercise(name) {
    const key = normalize(name);
    return exerciseLibrary.find(item => {
      const itemName = normalize(item.name);
      const itemId = normalize(item.id);
      return itemName === key || itemId === key || itemName.includes(key) || key.includes(itemName);
    }) || null;
  }

  function assetUrl(value) {
    const raw = String(value || '');
    if (!raw) return '';
    if (/^(https?:|data:|\.\.\/)/.test(raw)) return raw;
    return `../${raw.replace(/^\//, '')}`;
  }

  function exerciseImages(item) {
    if (!item) return [];
    const direct = item.visual_image ? [assetUrl(item.visual_image)] : [];
    const libraryImage = item.id ? [`../assets/exercises/${item.id}.png?v=student-training-1`] : [];
    const stepImages = (Array.isArray(item.steps) ? item.steps : []).map(step => assetUrl(step.image)).filter(Boolean);
    return [...new Set([...direct, ...libraryImage, ...stepImages])];
  }

  function renderRoutineRow(exercise, index) {
    return `<article class="training-routine-row">
      <strong>${escapeHtml(exercise.exercise_name || 'Ejercicio')}</strong>
      <span>${escapeHtml(exercise.sets || '—')} series</span>
      <span>${escapeHtml(exercise.reps_time || '—')}</span>
      <span>${escapeHtml(exercise.load || 'sin carga')}</span>
      <button class="training-view-button" type="button" data-view-exercise="${index}" aria-expanded="false">Ver</button>
    </article>`;
  }

  function renderExerciseVisual(exercise, index) {
    const item = findLibraryExercise(exercise.exercise_name);
    const images = exerciseImages(item);
    return `<article class="training-visual-card" data-exercise-visual="${index}">
      <h3>${escapeHtml(item?.name || exercise.exercise_name || 'Ejercicio')}</h3>
      <p class="training-muted">${escapeHtml(exercise.sets || '—')} series · ${escapeHtml(exercise.reps_time || '—')} · ${escapeHtml(exercise.load || 'sin carga')}</p>
      ${images.length ? `<img src="${escapeHtml(images[0])}" data-image-options='${escapeHtml(JSON.stringify(images))}' data-image-index="1" alt="${escapeHtml(item?.name || exercise.exercise_name || 'Ejercicio')}">` : '<div class="training-empty">Este ejercicio todavía no tiene una ilustración disponible.</div>'}
    </article>`;
  }

  function handleVisualError(image) {
    const options = JSON.parse(image.dataset.imageOptions || '[]');
    const next = Number(image.dataset.imageIndex || 1);
    if (next < options.length) {
      image.dataset.imageIndex = String(next + 1);
      image.src = options[next];
      return;
    }
    image.replaceWith(Object.assign(document.createElement('div'), {
      className: 'training-empty',
      textContent: 'No se pudo cargar la ilustración de este ejercicio.'
    }));
  }

  function toggleExercise(index) {
    const panel = byId('routineVisualPanel');
    const key = String(index);
    const existing = panel.querySelector(`[data-exercise-visual="${key}"]`);
    const button = document.querySelector(`[data-view-exercise="${key}"]`);
    if (existing) {
      existing.remove();
      button.textContent = 'Ver';
      button.setAttribute('aria-expanded', 'false');
      return;
    }
    panel.insertAdjacentHTML('beforeend', renderExerciseVisual(exercises[Number(index)], Number(index)));
    const inserted = panel.querySelector(`[data-exercise-visual="${key}"]`);
    inserted?.querySelector('img')?.addEventListener('error', event => handleVisualError(event.currentTarget));
    button.textContent = 'Dejar de ver';
    button.setAttribute('aria-expanded', 'true');
    inserted?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderRoutine(data) {
    exercises = Array.isArray(data.exercises) ? data.exercises : [];
    byId('routineNotes').textContent = data.routine?.technical_notes || 'Sin observaciones cargadas por Yanina.';
    byId('routineList').innerHTML = exercises.length
      ? exercises.map(renderRoutineRow).join('')
      : '<div class="training-empty">Yanina todavía no cargó ejercicios para esta clase.</div>';
    byId('routineVisualPanel').innerHTML = '';
    document.querySelectorAll('[data-view-exercise]').forEach(button => {
      button.addEventListener('click', () => toggleExercise(button.dataset.viewExercise));
    });
  }

  function videoFileName(video) {
    return video.original_name || video.file_name || video.filename || video.name || 'Video enviado';
  }

  function videoUrl(video) {
    const raw = video.file_url || video.fileUrl || '';
    if (raw) return raw.startsWith('http') ? raw : `${API_BASE}${raw.startsWith('/') ? '' : '/'}${raw}`;
    return video.id ? `${API_BASE}/api/student-videos/${encodeURIComponent(video.id)}/file` : '';
  }

  async function loadClassVideos() {
    if (!selectedClass) return [];
    const response = await fetch(`${API_BASE}/api/students/${encodeURIComponent(STUDENT_ID)}/videos?cache=${Date.now()}`);
    if (!response.ok) return [];
    const data = await response.json();
    return (Array.isArray(data) ? data : []).filter(video => {
      const classId = video.class_id || video.classId || video.routine_class_id || video.routineClassId || '';
      return String(classId) === String(selectedClass.id);
    });
  }

  async function renderVideos() {
    const videos = await loadClassVideos();
    byId('videoCounter').textContent = `${videos.length}/3 videos enviados`;
    byId('saveVideoBtn').disabled = !pendingVideoFile || videos.length >= 3;
    byId('videoFile').disabled = videos.length >= 3;
    byId('videoList').innerHTML = videos.length
      ? videos.map((video, index) => `<article class="training-feed-card">
          <strong>Video ${index + 1}: ${escapeHtml(videoFileName(video))}</strong>
          ${videoUrl(video) ? `<video class="training-video" src="${escapeHtml(videoUrl(video))}#t=0.1" preload="metadata" controls playsinline></video>` : ''}
          <div class="training-meta"><span>${escapeHtml(video.created_at || video.uploaded_at || '')}</span><span>Estado: ${video.reviewed_at || video.is_reviewed ? 'revisado' : 'pendiente de revisión'}</span></div>
          <p>${escapeHtml(video.note || 'Sin comentario de la alumna.')}</p>
        </article>`).join('')
      : '<div class="training-empty">Todavía no hay videos enviados para esta clase.</div>';
    return videos;
  }

  function renderSelectedFile() {
    byId('selectedFileBox').innerHTML = pendingVideoFile
      ? `<div class="training-selected-file"><strong>Video seleccionado: ${escapeHtml(pendingVideoFile.name)}</strong><div class="training-meta"><span>${(pendingVideoFile.size / 1024 / 1024).toFixed(1)} MB</span><span>Listo para guardar</span></div></div>`
      : '';
  }

  async function saveVideo() {
    if (!pendingVideoFile || !selectedClass) return;
    const button = byId('saveVideoBtn');
    const originalText = button.textContent;
    button.disabled = true;
    try {
      const payload = {
        file_name: pendingVideoFile.name,
        content_type: pendingVideoFile.type || 'application/octet-stream',
        file_size: pendingVideoFile.size
      };
      button.textContent = 'Preparando...';
      const initResponse = await fetch(`${API_BASE}/api/students/${encodeURIComponent(STUDENT_ID)}/videos/direct-upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const directUpload = await initResponse.json().catch(() => ({}));
      if (!initResponse.ok) throw new Error(directUpload.error || 'No se pudo preparar la carga del video.');

      button.textContent = 'Subiendo...';
      const uploadResponse = await originalFetch(directUpload.upload_url, {
        method: 'PUT', headers: { 'Content-Type': payload.content_type }, body: pendingVideoFile
      });
      if (!uploadResponse.ok) throw new Error('No se pudo subir el video.');

      button.textContent = 'Guardando...';
      const completeResponse = await fetch(`${API_BASE}/api/students/${encodeURIComponent(STUDENT_ID)}/videos/direct-upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          file_key: directUpload.file_key,
          class_id: selectedClass.id,
          note: byId('videoNote').value || ''
        })
      });
      const complete = await completeResponse.json().catch(() => ({}));
      if (!completeResponse.ok) throw new Error(complete.error || 'No se pudo confirmar el video.');

      pendingVideoFile = null;
      byId('videoFile').value = '';
      byId('videoNote').value = '';
      renderSelectedFile();
      await renderVideos();
    } catch (error) {
      alert(error.message || 'No se pudo guardar el video.');
    } finally {
      button.textContent = originalText;
      const videos = await loadClassVideos();
      button.disabled = !pendingVideoFile || videos.length >= 3;
    }
  }

  async function loadComments() {
    if (!selectedClass) return [];
    const [classResponse, videos] = await Promise.all([
      fetch(`${API_BASE}/api/classes/${encodeURIComponent(selectedClass.id)}/comments?cache=${Date.now()}`),
      loadClassVideos()
    ]);
    const classComments = classResponse.ok ? await classResponse.json() : [];
    const videoGroups = await Promise.all(videos.filter(video => video.id).map(async video => {
      const response = await fetch(`${API_BASE}/api/student-videos/${encodeURIComponent(video.id)}/comments?cache=${Date.now()}`);
      const items = response.ok ? await response.json() : [];
      return (Array.isArray(items) ? items : []).map(item => ({
        ...item,
        message: item.body || item.message || '',
        video_name: videoFileName(video)
      }));
    }));
    return [...(Array.isArray(classComments) ? classComments : []), ...videoGroups.flat()].sort((a, b) =>
      String(a.created_at || '').localeCompare(String(b.created_at || '')) || Number(a.id || 0) - Number(b.id || 0)
    );
  }

  async function renderComments() {
    try {
      const comments = await loadComments();
      byId('classCommentsList').innerHTML = comments.length
        ? comments.map(comment => `<article class="training-feed-card">
            <strong>${comment.author_role === 'student' ? 'VOS:' : 'YANINA:'}</strong>
            ${comment.video_name ? `<div class="training-meta"><span>Sobre video: ${escapeHtml(comment.video_name)}</span></div>` : ''}
            <p>${escapeHtml(comment.message || comment.body || '')}</p>
            <div class="training-meta"><span>${escapeHtml(comment.created_at || '')}</span></div>
          </article>`).join('')
        : '<div class="training-empty">Todavía no hay comentarios en esta clase.</div>';
    } catch (_) {
      byId('classCommentsList').innerHTML = '<div class="training-empty">No se pudieron cargar los comentarios.</div>';
    }
  }

  async function saveComment() {
    const input = byId('classCommentInput');
    const button = byId('saveClassCommentBtn');
    const message = input.value.trim();
    if (!message || !selectedClass) return;
    button.disabled = true;
    try {
      const response = await fetch(`${API_BASE}/api/classes/${encodeURIComponent(selectedClass.id)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author_role: 'student', message })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'No se pudo enviar el comentario.');
      input.value = '';
      await renderComments();
    } catch (error) {
      alert(error.message || 'No se pudo enviar el comentario.');
    } finally {
      button.disabled = false;
    }
  }

  function renderNoClass() {
    renderClassHeader();
    byId('routineList').innerHTML = '<div class="training-empty">No hay clases programadas para mostrar.</div>';
    byId('routineNotes').textContent = 'Sin observaciones.';
    byId('videoList').innerHTML = '<div class="training-empty">Seleccioná una clase desde el calendario.</div>';
    byId('classCommentsList').innerHTML = '<div class="training-empty">Seleccioná una clase desde el calendario.</div>';
    ['videoFile', 'videoNote', 'saveVideoBtn', 'classCommentInput', 'saveClassCommentBtn'].forEach(id => { byId(id).disabled = true; });
  }

  async function init() {
    try {
      const [student] = await Promise.all([loadStudent(), loadClasses(), loadExerciseLibrary()]);
      const name = student.full_name || student.name || session.name || 'Alumna';
      byId('studentName').textContent = name;
      byId('studentBellLink').href = `notificaciones.html?id=${encodeURIComponent(STUDENT_ID)}`;
      selectedClass = chooseClass();
      if (!selectedClass) return renderNoClass();
      renderClassHeader();
      const routine = await loadRoutine();
      renderRoutine(routine);
      await Promise.all([renderVideos(), renderComments()]);
    } catch (error) {
      console.error(error);
      byId('routineList').innerHTML = '<div class="training-empty">No se pudo cargar el entrenamiento.</div>';
      byId('routineNotes').textContent = 'No se pudieron cargar las observaciones.';
    }
  }

  byId('videoFile').addEventListener('change', async event => {
    pendingVideoFile = event.target.files?.[0] || null;
    renderSelectedFile();
    await renderVideos();
  });
  byId('saveVideoBtn').addEventListener('click', saveVideo);
  byId('saveClassCommentBtn').addEventListener('click', saveComment);
  byId('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('yaninaStudentSession');
    window.location.href = '/login.html';
  });

  init();
})();
