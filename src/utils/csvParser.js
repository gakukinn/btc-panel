export const parseCSV = (text) => {
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const parseRow = (line) => {
    const values = [];
    let current = '', inQuotes = false;
    for (let char of line) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else current += char;
    }
    values.push(current.trim());
    return values;
  };
  const headers = parseRow(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = parseRow(line);
    if (values.length !== headers.length) return null;
    const row = {};
    headers.forEach((header, idx) => {
      const value = values[idx].replace(/^"|"$/g, '').trim();
      if (value === '∅' || value === '') row[header] = null;
      else if (value === 'true') row[header] = true;
      else if (value === 'false') row[header] = false;
      else {
        // 安全剥离千分位逗号（如 "1,234.56" → 1234.56），防止数据失真
        const isFormattedNum = /^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(value);
        const clean = isFormattedNum ? value.replace(/,/g, '') : value;
        row[header] = isNaN(clean) || clean === '' ? value : parseFloat(clean);
      }
    });
    return row;
  }).filter(Boolean);
};

export const formatNumber = (num) => {
  if (num == null || !isFinite(num)) return '-';
  const abs = Math.abs(num);
  if (abs >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
};

export const prepareStepNeighborMeta = (allRows) => {
  const allKeys = Object.keys(allRows[0]?.strategyParams || {});
  const numericVaryingKeys = allKeys.filter(key => {
    const vals = allRows.map(r => r.strategyParams?.[key]).filter(v => typeof v === 'number' && isFinite(v));
    if (vals.length < 2) return false;
    const firstVal = vals[0];
    return vals.some(v => v !== firstVal);
  });
  const boolVaryingKeys = allKeys.filter(key => {
    const vals = allRows.map(r => r.strategyParams?.[key]).filter(v => typeof v === 'boolean');
    if (vals.length < 2) return false;
    return vals.some(v => v !== vals[0]);
  });
  const stepSizes = {};
  numericVaryingKeys.forEach(key => {
    const vals = [...new Set(
      allRows.map(r => r.strategyParams?.[key]).filter(v => typeof v === 'number' && isFinite(v))
    )].sort((a, b) => a - b);
    if (vals.length < 2) { stepSizes[key] = Infinity; return; }
    const diffs = [];
    for (let i = 1; i < vals.length; i++) {
      const diff = vals[i] - vals[i-1];
      if (diff > 1e-9) diffs.push(diff);
    }
    if (diffs.length === 0) { stepSizes[key] = Infinity; return; }
    const counts = {};
    diffs.forEach(d => {
      const rounded = Number(d.toFixed(8));
      counts[rounded] = (counts[rounded] || 0) + 1;
    });
    stepSizes[key] = Number(Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b));
  });
  return { numericVaryingKeys, boolVaryingKeys, stepSizes };
};
