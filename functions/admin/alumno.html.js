export async function onRequest(context) {
  const response = await context.env.ASSETS.fetch(context.request);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("text/html")) {
    return response;
  }

  let html = await response.text();

  html = html.replace(
    '<span class="status-pill" id="plannedCounter">0 clases previstas</span>',
    ''
  );

  html = html.replace(
    '<button type="button" class="btn btn-form-primary" id="saveClassBtn">Guardar calendario</button>',
    '<button type="button" class="btn btn-form-primary" id="saveClassBtn">Guardar calendario</button>\n            <span class="status-pill" id="plannedCounter">0 clases guardadas</span>'
  );

  html = html.replace(
    `        const draftInMonth = Array.from(pendingCalendarDrafts.values()).filter(item => {
          if (!isCalendarDraftMeaningful(item)) return false;
          const d = parseISODate(item.class_date);
          return d && d >= monthStart && d <= monthEnd;
        });

        plannedCounter.textContent = \`${savedInMonth.length + draftInMonth.length} clases previstas\`;`,
    '        plannedCounter.textContent = `${savedInMonth.length} clases guardadas`;'
  );

  html = html.replace(
    '</style>',
    `
    .calendar-save-actions,
    #calendario-mensual .bottom-actions {
      align-items: center;
      margin-top: 18px;
    }
    #calendario-mensual .plan-timeline-header #plannedCounter {
      display: none !important;
    }
    </style>`
  );

  return new Response(html, {
    status: response.status,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}
