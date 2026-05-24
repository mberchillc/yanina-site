from pathlib import Path

path = Path('admin/alumno.html')
text = path.read_text(encoding='utf-8')
original = text

start = text.find('function measurementSortKey(item) {')
end = text.find('function metricPoints(measurements, key) {')
if start == -1 or end == -1:
    raise SystemExit('date helper block not found')

replacement = r'''function normalizeMeasurementDateValue(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  }

  const monthMap = {
    jan: '01', january: '01', ene: '01', enero: '01',
    feb: '02', february: '02', febrero: '02',
    mar: '03', march: '03', marzo: '03',
    apr: '04', april: '04', abr: '04', abril: '04',
    may: '05', mayo: '05',
    jun: '06', june: '06', junio: '06',
    jul: '07', july: '07', julio: '07',
    aug: '08', august: '08', ago: '08', agosto: '08',
    sep: '09', sept: '09', september: '09', septiembre: '09', set: '09',
    oct: '10', october: '10', octubre: '10',
    nov: '11', november: '11', noviembre: '11',
    dec: '12', december: '12', dic: '12', diciembre: '12'
  };

  const textMatch = raw.match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (textMatch) {
    const monthKey = textMatch[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const month = monthMap[monthKey.slice(0, 3)] || monthMap[monthKey];
    const day = String(textMatch[2]).padStart(2, '0');
    let year = String(textMatch[3]);
    if (year.length === 2) year = Number(year) >= 70 ? `19${year}` : `20${year}`;
    if (month) return `${year}-${month}-${day}`;
  }

  const slash = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (slash) {
    let year = String(slash[3]);
    if (year.length === 2) year = Number(year) >= 70 ? `19${year}` : `20${year}`;
    return `${year}-${String(slash[1]).padStart(2, '0')}-${String(slash[2]).padStart(2, '0')}`;
  }

  return raw;
}

function measurementDateValue(item) {
  return item?.measured_at || item?.measuredAt || item?.measurement_date || item?.date || item?.created_at || '';
}

function measurementSortKey(item) {
  return normalizeMeasurementDateValue(measurementDateValue(item));
}

function sortedMeasurementsByDate(measurements) {
  return [...(measurements || [])].sort((a, b) => measurementSortKey(a).localeCompare(measurementSortKey(b)));
}

function formatMeasurementCardDate(value) {
  const normalized = normalizeMeasurementDateValue(value);
  if (!normalized) return 'Sin fecha';
  const parts = normalized.slice(0, 10).split('-');
  if (parts.length !== 3) return normalized;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Math.max(0, Math.min(11, Number(parts[1]) - 1))] || parts[1];
  return `${month} ${parts[2]}, ${parts[0].slice(-2)}`;
}

function shortMeasurementDate(value) {
  return formatMeasurementCardDate(value);
}

'''
text = text[:start] + replacement + text[end:]

text = text.replace("date: item.measured_at || item.created_at || '',\n      label: shortMeasurementDate(item.measured_at || item.created_at || ''),", "date: measurementDateValue(item),\n      label: shortMeasurementDate(measurementDateValue(item)),")
text = text.replace('formatMeasurementCardDate(item.measured_at || item.created_at || "")', 'formatMeasurementCardDate(measurementDateValue(item))')

if text == original:
    print('already patched')
else:
    path.write_text(text, encoding='utf-8')
    print('patched date parser')
