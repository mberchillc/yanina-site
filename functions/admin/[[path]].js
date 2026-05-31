export async function onRequest(context) {
  const response = await context.env.ASSETS.fetch(context.request);
  const url = new URL(context.request.url);
  const contentType = response.headers.get("content-type") || "";

  if (!url.pathname.endsWith("/admin/alumno.html") || !contentType.includes("text/html")) {
    return response;
  }

  let html = await response.text();

  html = html
    .replace('<div class="card-title">Calendario de clases</div>', '<div class="card-title">Próximas clases</div>')
    .replace('<section class="plan-timeline">', '<section class="plan-timeline" id="calendario-mensual">')
    .replace('<section class="selected-class-panel">', '<section class="selected-class-panel" id="clase-seleccionada">')
    .replace('<a href="#plan" class="student-tab">Plan de entrenamiento</a>', '<a href="#clase-seleccionada" class="student-tab">Entrenamiento</a>')
    .replace('<a href="#calendario" class="student-tab">Calendario de clases</a>', '<a href="#calendario-mensual" class="student-tab">Calendario de clases</a>');

  html = html.replace(
    '</style>',
    `
    .workout-card > .card-header { display: none !important; }
    #calendario-mensual,
    #clase-seleccionada { scroll-margin-top: 110px; }
    #calendario-mensual .plan-timeline-header { display: block; }
    #calendario-mensual .plan-timeline-header h3 {
      font-size: clamp(28px, 3vw, 38px);
      line-height: 1.05;
      margin-bottom: 8px;
    }
    #calendario-mensual .calendar-toolbar {
      margin-top: 16px;
      margin-bottom: 0;
    }
    </style>`
  );

  html = html.replace(
    '</body>',
    `<script>
      (function alignAdminStudentLayout(){
        function apply(){
          const toolbar = document.querySelector('#calendario .calendar-toolbar');
          const monthlyHeader = document.querySelector('#calendario-mensual .plan-timeline-header');
          const monthlyHeaderText = document.querySelector('#calendario-mensual .plan-timeline-header > div');
          const calendarTitle = document.querySelector('#calendario .card-title');
          const workoutHeader = document.querySelector('.workout-card > .card-header');

          if (calendarTitle) calendarTitle.textContent = 'Próximas clases';
          if (workoutHeader) workoutHeader.style.display = 'none';

          if (toolbar && monthlyHeader && toolbar.parentElement !== monthlyHeader) {
            if (monthlyHeaderText) monthlyHeaderText.insertAdjacentElement('afterend', toolbar);
            else monthlyHeader.appendChild(toolbar);
            toolbar.style.display = 'flex';
          }
        }

        apply();
        setTimeout(apply, 100);
        setTimeout(apply, 500);
      })();
    </script>
  </body>`
  );

  return new Response(html, {
    status: response.status,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}
