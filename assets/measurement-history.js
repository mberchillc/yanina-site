(function (global) {
  'use strict';

  const WINDOW_SIZE = 6;
  let activeHistory = null;
  let modal = null;
  let pointerStartX = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function pointDate(point) {
    const raw = String(point?.date || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  }

  function monthLabel(value) {
    const iso = pointDate({ date: value });
    if (!iso) return '';
    const [year, month] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, 1)));
  }

  function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
  }

  function visibleRangeLabel(points, start) {
    if (!points.length) return 'Sin mediciones disponibles';
    const end = Math.min(points.length, start + WINDOW_SIZE);
    const firstPeriod = monthLabel(points[start]?.date);
    const lastPeriod = monthLabel(points[end - 1]?.date);
    const period = firstPeriod && lastPeriod
      ? (firstPeriod === lastPeriod ? firstPeriod : `${firstPeriod} – ${lastPeriod}`)
      : '';
    return `Mediciones ${start + 1}–${end} de ${points.length}${period ? ` · ${capitalize(period)}` : ''}`;
  }

  function ensureModal() {
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'measurement-history-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="measurement-history-backdrop" data-history-close></div>
      <section class="measurement-history-dialog" role="dialog" aria-modal="true" aria-labelledby="measurementHistoryTitle">
        <header class="measurement-history-header">
          <div>
            <span class="measurement-history-kicker">Histórico completo</span>
            <h3 id="measurementHistoryTitle">Evolución</h3>
          </div>
          <button type="button" class="measurement-history-close" data-history-close aria-label="Cerrar histórico">×</button>
        </header>
        <div class="measurement-history-chart" data-history-chart></div>
        <div class="measurement-history-controls" aria-label="Navegación del histórico de mediciones">
          <button type="button" class="measurement-history-arrow" data-history-previous aria-label="Ver una medición anterior">‹</button>
          <input type="range" class="measurement-history-range" data-history-range min="0" max="0" value="0" step="1" aria-label="Mover ventana de mediciones">
          <button type="button" class="measurement-history-arrow" data-history-next aria-label="Ver una medición siguiente">›</button>
        </div>
        <p class="measurement-history-status" data-history-status aria-live="polite"></p>
      </section>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-history-close]').forEach(element => {
      element.addEventListener('click', closeHistory);
    });
    modal.querySelector('[data-history-previous]').addEventListener('click', () => moveWindow(-1));
    modal.querySelector('[data-history-next]').addEventListener('click', () => moveWindow(1));
    modal.querySelector('[data-history-range]').addEventListener('input', event => {
      if (!activeHistory) return;
      activeHistory.start = Number(event.target.value);
      renderActiveHistory();
    });

    const chart = modal.querySelector('[data-history-chart]');
    chart.addEventListener('pointerdown', event => {
      pointerStartX = event.clientX;
    });
    chart.addEventListener('pointerup', event => {
      if (pointerStartX === null) return;
      const delta = event.clientX - pointerStartX;
      pointerStartX = null;
      if (Math.abs(delta) < 42) return;
      moveWindow(delta > 0 ? -1 : 1);
    });
    chart.addEventListener('pointercancel', () => {
      pointerStartX = null;
    });

    document.addEventListener('keydown', event => {
      if (!activeHistory) return;
      if (event.key === 'Escape') closeHistory();
      if (event.key === 'ArrowLeft') moveWindow(-1);
      if (event.key === 'ArrowRight') moveWindow(1);
    });

    return modal;
  }

  function renderActiveHistory() {
    if (!activeHistory) return;
    const root = ensureModal();
    const points = activeHistory.points;
    const maxStart = Math.max(0, points.length - WINDOW_SIZE);
    activeHistory.start = clamp(activeHistory.start, 0, maxStart);
    const visible = points.slice(activeHistory.start, activeHistory.start + WINDOW_SIZE);
    const previous = root.querySelector('[data-history-previous]');
    const next = root.querySelector('[data-history-next]');
    const range = root.querySelector('[data-history-range]');

    root.querySelector('#measurementHistoryTitle').textContent = activeHistory.config.title;
    root.querySelector('[data-history-chart]').innerHTML = activeHistory.renderChart(activeHistory.config, visible);
    root.querySelector('[data-history-status]').textContent = visibleRangeLabel(points, activeHistory.start);

    previous.disabled = activeHistory.start === 0;
    next.disabled = activeHistory.start === maxStart;
    range.min = '0';
    range.max = String(maxStart);
    range.value = String(activeHistory.start);
    range.disabled = maxStart === 0;
    range.setAttribute('aria-valuetext', visibleRangeLabel(points, activeHistory.start));
  }

  function moveWindow(delta) {
    if (!activeHistory) return;
    const maxStart = Math.max(0, activeHistory.points.length - WINDOW_SIZE);
    const nextStart = clamp(activeHistory.start + delta, 0, maxStart);
    if (nextStart === activeHistory.start) return;
    activeHistory.start = nextStart;
    renderActiveHistory();
  }

  function openHistory(config, points, renderChart, trigger) {
    const root = ensureModal();
    activeHistory = {
      config,
      points: Array.isArray(points) ? points : [],
      renderChart,
      trigger,
      start: Math.max(0, (points?.length || 0) - WINDOW_SIZE)
    };
    renderActiveHistory();
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('measurement-history-open');
    root.querySelector('[data-history-close]').focus();
  }

  function closeHistory() {
    if (!activeHistory || !modal) return;
    const trigger = activeHistory.trigger;
    activeHistory = null;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('measurement-history-open');
    trigger?.focus();
  }

  function bind(options) {
    const { container, configs, datasets, renderChart } = options || {};
    if (!container || !Array.isArray(configs) || typeof renderChart !== 'function') return;

    const cards = [...container.querySelectorAll('.measurement-chart-card, .tracking-chart')];
    cards.forEach((card, index) => {
      const config = configs[index];
      if (!config) return;
      const points = Array.isArray(datasets?.[config.key]) ? datasets[config.key] : [];
      card.classList.add('measurement-history-trigger');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Ver histórico completo de ${config.title}`);
      const open = () => openHistory(config, points, renderChart, card);
      card.addEventListener('click', open);
      card.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        open();
      });
    });
  }

  global.YaninaMeasurementHistory = Object.freeze({ bind, windowSize: WINDOW_SIZE });
})(window);
