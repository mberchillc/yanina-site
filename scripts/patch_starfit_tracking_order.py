from pathlib import Path

path = Path('admin/alumno.html')
text = path.read_text(encoding='utf-8')
original = text

# 1) Use stable chronological sorting by measured_at, not by created_at/upload order.
if 'function measurementSortKey(item)' not in text:
    marker = "function shortMeasurementDate(value) {"
    helper = r'''
function measurementSortKey(item) {
  return String(item?.measured_at || item?.created_at || '');
}

function sortedMeasurementsByDate(measurements) {
  return [...(measurements || [])].sort((a, b) => measurementSortKey(a).localeCompare(measurementSortKey(b)));
}

function formatMeasurementCardDate(value) {
  if (!value) return 'Sin fecha';
  const clean = String(value).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const year = parts[0].slice(-2);
  const month = months[Math.max(0, Math.min(11, Number(parts[1]) - 1))] || parts[1];
  return `${month} ${parts[2]}, ${year}`;
}

'''
    text = text.replace(marker, helper + marker)

# 2) Improve chart short date to show month/day/year with 2-digit year, not truncated labels.
old_short = """function shortMeasurementDate(value) {
  if (!value) return '—';
  const clean = String(value).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return clean;
}"""
new_short = """function shortMeasurementDate(value) {
  if (!value) return '—';
  const clean = String(value).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Math.max(0, Math.min(11, Number(parts[1]) - 1))] || parts[1];
  return `${month} ${parts[2]}, ${parts[0].slice(-2)}`;
}"""
text = text.replace(old_short, new_short)

# 3) Make metricPoints use measured_at only for ordering/labels, with created_at as fallback.
old_metric = """function metricPoints(measurements, key) {
  return (measurements || [])
    .map(item => ({
      date: item.measured_at || item.created_at || '',
      label: shortMeasurementDate(item.measured_at || item.created_at || ''),
      value: toNumber(item[key])
    }))
    .filter(item => item.value !== null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}"""
new_metric = """function metricPoints(measurements, key) {
  return sortedMeasurementsByDate(measurements)
    .map(item => ({
      date: item.measured_at || item.created_at || '',
      label: shortMeasurementDate(item.measured_at || item.created_at || ''),
      value: toNumber(item[key])
    }))
    .filter(item => item.value !== null);
}"""
text = text.replace(old_metric, new_metric)

# 4) Sort once in renderMeasurements and render both charts/cards from that order.
old_render_start = """function renderMeasurements(measurements) {
  if (!measurementList) return;
  renderMeasurementTrackingCharts(measurements);

  if (!measurements.length) {"""
new_render_start = """function renderMeasurements(measurements) {
  if (!measurementList) return;
  const orderedMeasurements = sortedMeasurementsByDate(measurements);
  renderMeasurementTrackingCharts(orderedMeasurements);

  if (!orderedMeasurements.length) {"""
text = text.replace(old_render_start, new_render_start)

text = text.replace('measurementList.innerHTML = measurements.map(item => {', 'measurementList.innerHTML = orderedMeasurements.map(item => {')

# 5) Format card date with 2-digit year.
text = text.replace('<div class="measurement-date">${escapeHtml(item.measured_at || "Sin fecha")}</div>', '<div class="measurement-date">${escapeHtml(formatMeasurementCardDate(item.measured_at || item.created_at || ""))}</div>')

# 6) Remove Objetivo metric from client-facing history cards.
text = text.replace('''          <div class="measurement-metric"><span>Objetivo</span><strong>${escapeHtml(item.starfit_goal_kg || "—")} kg</strong></div>\n''', '')

# 7) Make grid 3 columns x 2 rows instead of 4 columns when there are 7 metrics after removing goal.
text = text.replace('grid-template-columns: repeat(4, 1fr);', 'grid-template-columns: repeat(3, 1fr);')
text = text.replace('      .measurement-grid,\n      .measurement-chart-grid {\n        grid-template-columns: 1fr;\n      }', '      .measurement-grid,\n      .measurement-chart-grid {\n        grid-template-columns: 1fr;\n      }')

if text == original:
    print('already patched')
else:
    path.write_text(text, encoding='utf-8')
    print('patched')
