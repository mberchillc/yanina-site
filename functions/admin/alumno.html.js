export async function onRequest(context) {
  const response = await context.env.ASSETS.fetch(context.request);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("text/html")) {
    return response;
  }

  let html = await response.text();

  const oldBlock = `function normalizeMeasurementDateValue(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  const iso = raw.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})/);
  if (iso) {
    return \`${iso[1]}-\${String(iso[2]).padStart(2, '0')}-\${String(iso[3]).padStart(2, '0')}\`;
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

  const textMatch = raw.match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\\s+(\\d{1,2}),?\\s+(\\d{2,4})$/);
  if (textMatch) {
    const monthKey = textMatch[1].toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
    const month = monthMap[monthKey.slice(0, 3)] || monthMap[monthKey];
    const day = String(textMatch[2]).padStart(2, '0');
    let year = String(textMatch[3]);
    if (year.length === 2) year = Number(year) >= 70 ? \`19\${year}\` : \`20\${year}\`;
    if (month) return \`${year}-\${month}-\${day}\`;
  }

  const slash = raw.match(/^(\\d{1,2})[\\/.-](\\d{1,2})[\\/.-](\\d{2,4})$/);
  if (slash) {
    let year = String(slash[3]);
    if (year.length === 2) year = Number(year) >= 70 ? \`19\${year}\` : \`20\${year}\`;
    return \`${year}-\${String(slash[1]).padStart(2, '0')}-\${String(slash[2]).padStart(2, '0')}\`;
  }

  return raw;
}

function measurementDateValue(item) {
  return item?.measured_date_iso || item?.measured_at || item?.measuredAt || item?.measurement_date || item?.date || item?.created_at || '';
}

function measurementSortKey(item) {
  return normalizeMeasurementDateValue(
    item?.measured_date_iso || item?.measured_at || item?.measuredAt || item?.measurement_date || item?.date || item?.created_at || ''
  );
}

function sortedMeasurementsByDate(measurements) {
  return [...(measurements || [])].sort((a, b) => measurementSortKey(a).localeCompare(measurementSortKey(b)));
}`;

  const newBlock = `function normalizeMeasurementDateValue(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';

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

  const iso = raw.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})/);
  if (iso) return \`${iso[1]}-\${String(iso[2]).padStart(2, '0')}-\${String(iso[3]).padStart(2, '0')}\`;

  const textMatch = raw.match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\\s+(\\d{1,2}),?\\s+(\\d{2,4})$/);
  if (textMatch) {
    const monthKey = textMatch[1].toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
    const month = monthMap[monthKey] || monthMap[monthKey.slice(0, 3)];
    const day = String(textMatch[2]).padStart(2, '0');
    let year = String(textMatch[3]);
    if (year.length === 2) year = Number(year) >= 70 ? \`19\${year}\` : \`20\${year}\`;
    if (month) return \`${year}-\${month}-\${day}\`;
  }

  const slash = raw.match(/^(\\d{1,2})[\\/.-](\\d{1,2})[\\/.-](\\d{2,4})$/);
  if (slash) {
    let year = String(slash[3]);
    if (year.length === 2) year = Number(year) >= 70 ? \`19\${year}\` : \`20\${year}\`;
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    return \`${year}-\${String(month).padStart(2, '0')}-\${String(day).padStart(2, '0')}\`;
  }

  return '';
}

function measurementDateValue(item) {
  return item?.measured_date_iso || item?.measured_at || item?.measuredAt || item?.measurement_date || item?.date || item?.created_at || '';
}

function measurementSortKey(item) {
  const normalized = normalizeMeasurementDateValue(
    item?.measured_date_iso || item?.measured_at || item?.measuredAt || item?.measurement_date || item?.date || item?.created_at || ''
  );
  const timestamp = Date.parse(\`${normalized}T00:00:00\`);
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function sortedMeasurementsByDate(measurements) {
  return [...(measurements || [])].sort((a, b) => {
    const primary = measurementSortKey(a) - measurementSortKey(b);
    if (primary !== 0) return primary;
    return String(a?.created_at || '').localeCompare(String(b?.created_at || ''));
  });
}`;

  if (html.includes(oldBlock)) {
    html = html.replace(oldBlock, newBlock);
  } else {
    html = html.replace(
      "function formatMeasurementCardDate(value) {",
      `${newBlock}\n\nfunction formatMeasurementCardDate(value) {`
    );
  }

  return new Response(html, {
    status: response.status,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}
