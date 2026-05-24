from pathlib import Path

path = Path('admin/alumno.html')
text = path.read_text(encoding='utf-8')
original = text

css = r'''

/* starfit-tracking-charts */
.measurement-tracking {
  background: linear-gradient(135deg, rgba(217, 242, 203, 0.46), rgba(255,255,255,0.82));
  border: 1px solid rgba(126, 200, 69, 0.24);
  border-radius: 22px;
  padding: 18px;
  margin-bottom: 18px;
}
.measurement-tracking-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.measurement-tracking-header h3 { color: var(--green-dark); font-size: 20px; margin: 0 0 6px; }
.measurement-tracking-header p { color: var(--muted); font-size: 14px; line-height: 1.45; margin: 0; }
.measurement-chart-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.measurement-chart-card {
  background: rgba(255,255,255,0.92);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 14px;
  box-shadow: 0 12px 28px rgba(24, 63, 53, 0.08);
}
.measurement-chart-title { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.measurement-chart-title strong { color: var(--green-dark); font-size: 16px; }
.measurement-chart-title span { color: var(--muted); font-size: 12px; font-weight: 800; }
.measurement-chart-svg { width: 100%; height: 190px; display: block; overflow: visible; }
.measurement-chart-area { fill: rgba(126, 200, 69, 0.18); }
.measurement-chart-line { fill: none; stroke: var(--green-dark); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
.measurement-chart-point { fill: var(--green-main); stroke: var(--white); stroke-width: 3; }
.measurement-chart-label, .measurement-chart-date { fill: var(--green-dark); font-size: 11px; font-weight: 800; }
.measurement-chart-date { fill: var(--muted); font-size: 10px; }
.measurement-chart-empty {
  background: rgba(255,255,255,0.72);
  border: 1px dashed rgba(24, 63, 53, 0.18);
  border-radius: 18px;
  padding: 18px;
  color: var(--muted);
  line-height: 1.45;
}
'''

if '/* starfit-tracking-charts */' not in text:
    text = text.replace('\n    @media (max-width: 840px) {', css + '\n    @media (max-width: 840px) {')
    text = text.replace('      .measurement-grid {\n        grid-template-columns: 1fr 1fr;\n      }', '      .measurement-grid,\n      .measurement-chart-grid {\n        grid-template-columns: 1fr;\n      }')

if 'id="measurementTrackingCharts"' not in text:
    old = '''  <div class="measurements-list" id="measurementList">
    <div class="empty-state">Cargando mediciones Starfit...</div>
  </div>'''
    new = '''  <section class="measurement-tracking" id="measurementTrackingSection">
    <div class="measurement-tracking-header">
      <div>
        <h3>Evolución</h3>
        <p>Peso, grasa corporal y músculo esquelético según las mediciones guardadas.</p>
      </div>
      <span class="status-pill">Tracking Starfit</span>
    </div>
    <div class="measurement-chart-grid" id="measurementTrackingCharts">
      <div class="measurement-chart-empty">Cargando gráficos de evolución...</div>
    </div>
  </section>

  <div class="measurements-list" id="measurementList">
    <div class="empty-state">Cargando mediciones Starfit...</div>
  </div>'''
    if old not in text:
        raise SystemExit('measurementList block not found')
    text = text.replace(old, new)

text = text.replace('<span>Músculo esquelético</span><strong>${escapeHtml(item.skeletal_muscle_kg || "—")}%</strong>', '<span>Músculo esquelético %</span><strong>${escapeHtml(item.skeletal_muscle_kg || "—")}%</strong>')

if 'const measurementTrackingCharts = document.getElementById("measurementTrackingCharts");' not in text:
    text = text.replace('const measurementList = document.getElementById("measurementList");', 'const measurementList = document.getElementById("measurementList");\nconst measurementTrackingCharts = document.getElementById("measurementTrackingCharts");')

helper = r'''

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(',', '.').replace(/[^0-9.-]/g, '');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}
function shortMeasurementDate(value) {
  if (!value) return '—';
  const clean = String(value).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return clean;
}
function metricPoints(measurements, key) {
  return (measurements || [])
    .map(item => ({ date: item.measured_at || item.created_at || '', label: shortMeasurementDate(item.measured_at || item.created_at || ''), value: toNumber(item[key]) }))
    .filter(item => item.value !== null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
function renderMetricChart(config, points) {
  if (!points.length) {
    return `<article class="measurement-chart-card"><div class="measurement-chart-title"><strong>${escapeHtml(config.title)}</strong><span>${escapeHtml(config.unit)}</span></div><div class="measurement-chart-empty">Todavía no hay datos suficientes para este indicador.</div></article>`;
  }
  const width = 360, height = 190, paddingX = 34, top = 26, bottom = 40;
  const usableW = width - paddingX * 2, usableH = height - top - bottom;
  const values = points.map(p => p.value);
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min = min - 1; max = max + 1; }
  const range = max - min;
  min = min - range * 0.12;
  max = max + range * 0.12;
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : paddingX + (index * usableW / (points.length - 1));
    const y = top + ((max - point.value) / (max - min)) * usableH;
    return { ...point, x, y };
  });
  const line = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `M ${coords[0].x.toFixed(1)} ${(height - bottom).toFixed(1)} L ` + coords.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ') + ` L ${coords[coords.length - 1].x.toFixed(1)} ${(height - bottom).toFixed(1)} Z`;
  const latest = coords[coords.length - 1];
  return `<article class="measurement-chart-card"><div class="measurement-chart-title"><strong>${escapeHtml(config.title)}</strong><span>${escapeHtml(latest.value.toFixed(config.decimals).replace('.', ','))} ${escapeHtml(config.unit)}</span></div><svg class="measurement-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución de ${escapeHtml(config.title)}"><path class="measurement-chart-area" d="${area}"></path><path class="measurement-chart-line" d="${line}"></path>${coords.map(point => `<circle class="measurement-chart-point" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="5"></circle><text class="measurement-chart-label" x="${point.x.toFixed(1)}" y="${(point.y - 10).toFixed(1)}" text-anchor="middle">${escapeHtml(point.value.toFixed(config.decimals).replace('.', ','))}</text><text class="measurement-chart-date" x="${point.x.toFixed(1)}" y="${height - 14}" text-anchor="middle">${escapeHtml(point.label)}</text>`).join('')}</svg></article>`;
}
function renderMeasurementTrackingCharts(measurements) {
  if (!measurementTrackingCharts) return;
  if (!measurements.length) {
    measurementTrackingCharts.innerHTML = `<div class="measurement-chart-empty">Todavía no hay mediciones suficientes para graficar evolución.</div>`;
    return;
  }
  const configs = [
    { key: 'weight_kg', title: 'Peso', unit: 'kg', decimals: 1 },
    { key: 'body_fat_percent', title: 'Grasa corporal', unit: '%', decimals: 1 },
    { key: 'skeletal_muscle_kg', title: 'Músculo esquelético', unit: '%', decimals: 1 }
  ];
  measurementTrackingCharts.innerHTML = configs.map(config => renderMetricChart(config, metricPoints(measurements, config.key))).join('');
}
'''

if 'function renderMeasurementTrackingCharts(measurements)' not in text:
    text = text.replace('\nfunction renderMeasurements(measurements) {', helper + '\nfunction renderMeasurements(measurements) {')

if 'renderMeasurementTrackingCharts(measurements);' not in text:
    text = text.replace('  if (!measurementList) return;\n\n  if (!measurements.length) {', '  if (!measurementList) return;\n  renderMeasurementTrackingCharts(measurements);\n\n  if (!measurements.length) {')

if 'renderMeasurementTrackingCharts([]);\n    measurementList.innerHTML' not in text:
    text = text.replace('    console.error(error);\n    measurementList.innerHTML = `', '    console.error(error);\n    renderMeasurementTrackingCharts([]);\n    measurementList.innerHTML = `')

path.write_text(text, encoding='utf-8')
print('patched' if text != original else 'already patched')
