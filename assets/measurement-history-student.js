(function (global) {
  'use strict';

  global.renderMeasurementCharts = function renderMeasurementCharts(items) {
    const box = document.getElementById('studentMeasurementCharts');
    if (!box) return;

    const sorted = [...(items || [])]
      .sort((a, b) => measurementSortKey(a).localeCompare(measurementSortKey(b)));
    const point = (item, keys) => ({
      date: measurementDate(item),
      label: shortDate(measurementDate(item)),
      value: numberValue(item, keys)
    });
    const configs = [
      { key: 'weight', title: 'Peso', suffix: ' kg' },
      { key: 'fat', title: 'Grasa corporal', suffix: '%' },
      { key: 'muscle', title: 'Músculo esquelético', suffix: '%' }
    ];
    const datasets = {
      weight: sorted.map(item => point(item, ['weight_kg', 'weight', 'peso'])).filter(item => item.value !== null),
      fat: sorted.map(item => point(item, ['body_fat_percent', 'body_fat', 'grasa_corporal'])).filter(item => item.value !== null),
      muscle: sorted.map(item => point(item, ['skeletal_muscle_kg', 'skeletal_muscle', 'musculo_esqueletico'])).filter(item => item.value !== null)
    };

    box.innerHTML = `
      <h3>Evolución</h3>
      <div class="tracking-chart-grid">
        ${configs.map(config => chartCard(config.title, datasets[config.key].slice(-6), config.suffix)).join('')}
      </div>
    `;

    global.YaninaMeasurementHistory?.bind({
      container: box,
      configs,
      datasets,
      renderChart: (config, points) => chartCard(config.title, points, config.suffix)
    });
  };
})(window);
