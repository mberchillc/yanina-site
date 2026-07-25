(function (global) {
  'use strict';

  let firstCalendarRender = true;

  global.openStudentTraining = function openStudentTraining(classId) {
    const query = classId ? `?classId=${encodeURIComponent(classId)}` : '';
    global.location.href = `entrenamiento.html${query}`;
  };

  const tabList = document.querySelector('.tab-list');
  const calendarButton = tabList?.querySelector('[data-tab="clases"]');
  if (tabList && calendarButton && !document.getElementById('trainingNavBtn')) {
    const button = document.createElement('button');
    button.className = 'tab-btn';
    button.id = 'trainingNavBtn';
    button.type = 'button';
    button.textContent = 'Entrenamiento';
    button.addEventListener('click', () => global.openStudentTraining());
    calendarButton.insertAdjacentElement('afterend', button);
  }

  if (tabList && !document.getElementById('nutritionNavLink')) {
    const params = new URLSearchParams(global.location.search);
    const studentId = params.get('id');
    const nutritionLink = document.createElement('a');
    nutritionLink.className = 'tab-btn';
    nutritionLink.id = 'nutritionNavLink';
    nutritionLink.href = `../nutricion.html?origen=alumno${studentId ? `&id=${encodeURIComponent(studentId)}` : ''}`;
    nutritionLink.textContent = 'Nutrición';
    const trainingButton = document.getElementById('trainingNavBtn');
    (trainingButton || calendarButton)?.insertAdjacentElement('afterend', nutritionLink);
  }

  const calendarIntro = document.querySelector('#clases .panel-head p');
  if (calendarIntro) calendarIntro.textContent = 'Tocá una fecha verde para abrir el entrenamiento de esa clase.';

  ['selectedClassTitle', 'routineList', 'routineNotes', 'classVideosCard', 'classCommentsCard'].forEach(id => {
    const element = document.getElementById(id);
    const card = element?.classList.contains('card') ? element : element?.closest('.card');
    if (card) card.hidden = true;
  });

  global.renderCalendar = function renderStudentCalendarNavigation() {
    if (firstCalendarRender) {
      viewDate = new Date();
      firstCalendarRender = false;
    }

    const grid = $('calendarGrid');
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    buildMonthSelect();
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    let html = days.map(day => `<div class="weekday">${day}</div>`).join('');

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const iso = isoDate(date);
      const scheduled = classes.filter(item => String(item.class_date || '').slice(0, 10) === iso);
      const selected = scheduled[0];
      html += `<button type="button" class="day ${date.getMonth() !== month ? 'is-outside' : ''} ${selected ? 'has-class' : ''}" ${selected ? `data-training-class-id="${esc(selected.id)}"` : ''}><span>${esc(days[date.getDay()])}</span><strong>${date.getDate()}</strong>${selected ? `<em>${esc(selected.class_time || 'Sin hora')}</em><small>${esc(selected.routine_type || 'Nueva clase')}</small>` : '<small>Sin clase</small>'}</button>`;
    }

    grid.innerHTML = html;
    grid.querySelectorAll('[data-training-class-id]').forEach(button => {
      button.addEventListener('click', () => global.openStudentTraining(button.dataset.trainingClassId));
    });
  };
})(window);

