import { SHEET_TOOL_NAMES } from './sheetTools.js';

// Enable verbose logs by setting `window.__SHEET_TOOL_DEBUG__ = true`
function debugEnabled() {
  try {
    return !!globalThis.__SHEET_TOOL_DEBUG__;
  } catch {
    return false;
  }
}

function dbg(...args) {
  if (debugEnabled()) console.log('[sheet-tool]', ...args);
}

function ok(payload = {}) {
  return { ok: true, ...payload };
}

function fail(message, payload = {}) {
  return { ok: false, error: String(message || 'unknown error'), ...payload };
}

// Parse A1 like "B3" => { col: 2, row: 3 }
export function parseA1Cell(a1) {
  const m = String(a1 || '').trim().match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return null;
  const letters = m[1].toUpperCase();
  const row = Number(m[2]);
  if (!Number.isFinite(row) || row <= 0) return null;

  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return { col, row };
}

export function parseA1Range(range) {
  const s = String(range || '').trim();
  if (!s) return null;
  const parts = s.split(':');
  const a = parseA1Cell(parts[0]);
  const b = parts[1] ? parseA1Cell(parts[1]) : a;
  if (!a || !b) return null;
  const startCol = Math.min(a.col, b.col);
  const endCol = Math.max(a.col, b.col);
  const startRow = Math.min(a.row, b.row);
  const endRow = Math.max(a.row, b.row);
  return { startCol, startRow, endCol, endRow };
}

function listSheetNames(sheet) {
  const candidates = [
    sheet?.getSheets,
    sheet?.listSheets,
    sheet?.api?.getSheets,
    sheet?.api?.listSheets,
  ];

  for (const fn of candidates) {
    if (typeof fn !== 'function') continue;
    const res = fn.call(sheet?.api ?? sheet);
    if (Array.isArray(res)) return res.map((x) => x?.name ?? x).filter(Boolean);
  }

  // Known SheetNext often exposes internal store, but we avoid relying on it.
  return [];
}

function tryAddSheet(sheet, name) {
  const candidates = [
    sheet?.addSheet,
    sheet?.addWorksheet,
    sheet?.createSheet,
    sheet?.api?.addSheet,
    sheet?.api?.addWorksheet,
    sheet?.api?.createSheet,
  ];
  for (const fn of candidates) {
    if (typeof fn !== 'function') continue;
    fn.call(sheet?.api ?? sheet, name);
    return true;
  }

  const dispatch = sheet?.dispatch || sheet?.command || sheet?.api?.dispatch;
  if (typeof dispatch === 'function') {
    dispatch.call(sheet?.api ?? sheet, { type: 'addSheet', name });
    return true;
  }
  return false;
}

function trySelectSheet(sheet, name) {
  const candidates = [
    sheet?.setActiveSheet,
    sheet?.setSheet,
    sheet?.selectSheet,
    sheet?.api?.setActiveSheet,
    sheet?.api?.setSheet,
    sheet?.api?.selectSheet,
  ];

  for (const fn of candidates) {
    if (typeof fn !== 'function') continue;
    fn.call(sheet?.api ?? sheet, name);
    return true;
  }

  const dispatch = sheet?.dispatch || sheet?.command || sheet?.api?.dispatch;
  if (typeof dispatch === 'function') {
    dispatch.call(sheet?.api ?? sheet, { type: 'setActiveSheet', name });
    return true;
  }

  return false;
}

function tryCall(fn, thisArg, args) {
  try {
    fn.apply(thisArg, args);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

function getDispatch(sheet) {
  const dispatch = sheet?.dispatch || sheet?.command || sheet?.api?.dispatch || sheet?.api?.command;
  return typeof dispatch === 'function' ? dispatch : null;
}

function trySetCell(sheet, addr, value) {
  const candidates = [
    { name: 'setCellValue', fn: sheet?.setCellValue },
    { name: 'setValue', fn: sheet?.setValue },
    { name: 'setCell', fn: sheet?.setCell },
    { name: 'set', fn: sheet?.set },
    { name: 'api.setCellValue', fn: sheet?.api?.setCellValue, thisArg: sheet.api },
    { name: 'api.setValue', fn: sheet?.api?.setValue, thisArg: sheet.api },
    { name: 'api.setCell', fn: sheet?.api?.setCell, thisArg: sheet.api },
  ];

  for (const c of candidates) {
    if (typeof c.fn !== 'function') continue;

    // Try (addr, value)
    let r = tryCall(c.fn, c.thisArg ?? sheet, [addr, value]);
    if (r.ok) {
      dbg('set ok via', c.name, addr, value);
      return { ok: true, via: c.name };
    }

    // Try (row, col, value)
    const cell = parseA1Cell(addr);
    if (cell) {
      r = tryCall(c.fn, c.thisArg ?? sheet, [cell.row, cell.col, value]);
      if (r.ok) {
        dbg('set ok via', c.name, '(row,col,value)', cell, value);
        return { ok: true, via: c.name + '(row,col,value)' };
      }

      // Try ({row,col}, value)
      r = tryCall(c.fn, c.thisArg ?? sheet, [{ row: cell.row, col: cell.col }, value]);
      if (r.ok) {
        dbg('set ok via', c.name, '({row,col},value)', cell, value);
        return { ok: true, via: c.name + '({row,col},value)' };
      }
    }

    dbg('set failed via', c.name, r.error);
  }

  const dispatch = getDispatch(sheet);
  if (dispatch) {
    // Common action shapes across sheet libs
    const payloads = [
      { type: 'setCell', addr, value },
      { type: 'setCellValue', addr, value },
      { type: 'cell:set', addr, value },
      { type: 'sheet:setCell', addr, value },
    ];

    for (const p of payloads) {
      const r = tryCall(dispatch, sheet?.api ?? sheet, [p]);
      if (r.ok) {
        dbg('set ok via dispatch', p);
        return { ok: true, via: 'dispatch', payloadType: p.type };
      }
      dbg('dispatch set failed', p.type, r.error);
    }
  }

  return { ok: false, via: null };
}

function tryGetCell(sheet, addr) {
  const candidates = [
    { name: 'getCellValue', fn: sheet?.getCellValue },
    { name: 'getValue', fn: sheet?.getValue },
    { name: 'getCell', fn: sheet?.getCell },
    { name: 'get', fn: sheet?.get },
    { name: 'api.getCellValue', fn: sheet?.api?.getCellValue, thisArg: sheet.api },
    { name: 'api.getValue', fn: sheet?.api?.getValue, thisArg: sheet.api },
    { name: 'api.getCell', fn: sheet?.api?.getCell, thisArg: sheet.api },
  ];

  for (const c of candidates) {
    if (typeof c.fn !== 'function') continue;

    // Try (addr)
    try {
      const v = c.fn.call(c.thisArg ?? sheet, addr);
      dbg('get ok via', c.name, addr, v);
      return { found: true, value: v, via: c.name };
    } catch (e1) {
      // Try (row,col)
      const cell = parseA1Cell(addr);
      if (cell) {
        try {
          const v = c.fn.call(c.thisArg ?? sheet, cell.row, cell.col);
          dbg('get ok via', c.name, '(row,col)', cell, v);
          return { found: true, value: v, via: c.name + '(row,col)' };
        } catch (e2) {
          dbg('get failed via', c.name, e2?.message ?? String(e2));
        }
      } else {
        dbg('get failed via', c.name, e1?.message ?? String(e1));
      }
    }
  }

  return { found: false, value: undefined };
}

function tryFormatRange(sheet, range, style) {
  // Best-effort: many sheet libs expose setStyle(range, style)
  const candidates = [
    sheet?.setRangeStyle,
    sheet?.formatRange,
    sheet?.setStyle,
    sheet?.api?.setRangeStyle,
    sheet?.api?.formatRange,
    sheet?.api?.setStyle,
  ];

  for (const fn of candidates) {
    if (typeof fn !== 'function') continue;
    fn.call(sheet?.api ?? sheet, range, style);
    return true;
  }

  const dispatch = sheet?.dispatch || sheet?.command || sheet?.api?.dispatch;
  if (typeof dispatch === 'function') {
    dispatch.call(sheet?.api ?? sheet, { type: 'formatRange', range, style });
    return true;
  }

  return false;
}

function getActiveSheet(sn) {
  return sn?.activeSheet || sn?.api?.activeSheet || sn?.sheet || sn?.api?.sheet || null;
}

function getSheetByName(sn, name) {
  if (!name) return null;
  // Common candidates
  const candidates = [
    sn?.getSheetByName,
    sn?.getSheet,
    sn?.api?.getSheetByName,
    sn?.api?.getSheet,
  ];
  for (const fn of candidates) {
    if (typeof fn !== 'function') continue;
    try {
      const s = fn.call(sn?.api ?? sn, name);
      if (s) return s;
    } catch {
      // ignore
    }
  }

  // Fallback: search in sheets array/map if exposed
  const sheets = sn?.sheets || sn?.api?.sheets;
  if (Array.isArray(sheets)) {
    const found = sheets.find((x) => x?.name === name);
    if (found) return found;
  }
  return null;
}

function resolveTargetSheet(sn, sheetName) {
  if (sheetName) {
    const s = getSheetByName(sn, sheetName);
    if (s) return s;
  }
  return getActiveSheet(sn);
}

function ensureSheetExistsAndActive(sn, sheetName) {
  if (!sheetName) return true;

  // If it already exists, try activate it.
  const existing = getSheetByName(sn, sheetName);
  if (existing) {
    trySelectSheet(sn, sheetName);
    return true;
  }

  // Try add
  const created = tryAddSheet(sn, sheetName);
  if (!created) return false;
  trySelectSheet(sn, sheetName);
  return true;
}

// Replace trySetCell/tryGetCell with Sheet API (getCellByStr / getCell) when possible.
function trySetCellOnSheet(sheet, addr, value) {
  if (!sheet) return { ok: false, via: null };

  // Best path: A1 string
  if (typeof sheet.getCellByStr === 'function') {
    try {
      const cell = sheet.getCellByStr(addr);
      if (cell) {
        // common fields
        if ('v' in cell) cell.v = value;
        else if ('value' in cell) cell.value = value;
        else cell.v = value;
        dbg('set ok via sheet.getCellByStr', addr, value);
        return { ok: true, via: 'sheet.getCellByStr' };
      }
    } catch (e) {
      dbg('set failed via sheet.getCellByStr', e?.message ?? String(e));
    }
  }

  // Numeric path
  if (typeof sheet.getCell === 'function') {
    const cellRef = parseA1Cell(addr);
    if (cellRef) {
      try {
        // SheetNext docs use 0-based for getCell(r,c)
        const r0 = cellRef.row - 1;
        const c0 = cellRef.col - 1;
        const cell = sheet.getCell(r0, c0);
        if (cell) {
          if ('v' in cell) cell.v = value;
          else if ('value' in cell) cell.value = value;
          else cell.v = value;
          dbg('set ok via sheet.getCell', { r0, c0 }, value);
          return { ok: true, via: 'sheet.getCell' };
        }
      } catch (e) {
        dbg('set failed via sheet.getCell', e?.message ?? String(e));
      }
    }
  }

  return { ok: false, via: null };
}

function tryGetCellOnSheet(sheet, addr) {
  if (!sheet) return { found: false, value: undefined };

  if (typeof sheet.getCellByStr === 'function') {
    try {
      const cell = sheet.getCellByStr(addr);
      const v = cell?.showVal ?? cell?.v ?? cell?.value ?? null;
      return { found: true, value: v, via: 'sheet.getCellByStr' };
    } catch {
      // ignore
    }
  }

  if (typeof sheet.getCell === 'function') {
    const cellRef = parseA1Cell(addr);
    if (cellRef) {
      try {
        const r0 = cellRef.row - 1;
        const c0 = cellRef.col - 1;
        const cell = sheet.getCell(r0, c0);
        const v = cell?.showVal ?? cell?.v ?? cell?.value ?? null;
        return { found: true, value: v, via: 'sheet.getCell' };
      } catch {
        // ignore
      }
    }
  }

  return { found: false, value: undefined };
}

export async function executeSheetToolCall(sheetInstance, toolCall) {
  try {
    if (!sheetInstance) return fail('SheetNext instance not ready');

    const name = toolCall?.function?.name || toolCall?.name;
    const rawArgs = toolCall?.function?.arguments ?? toolCall?.arguments ?? {};
    const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs || {});

    dbg('execute', name, args);

    if (name === SHEET_TOOL_NAMES.ADD_SHEET) {
      const sheetName = String(args?.name || '').trim();
      if (!sheetName) return fail('name required');

      const okEnsure = ensureSheetExistsAndActive(sheetInstance, sheetName);
      if (!okEnsure) return fail('Failed to create/select sheet (SheetNext API not found)', { tool: name, sheet: sheetName });

      return ok({ tool: name, sheet: sheetName });
    }

    if (name === SHEET_TOOL_NAMES.SET_RANGE_VALUES) {
      const targetSheetName = args?.sheet ? String(args.sheet) : '';
      if (targetSheetName) {
        const okEnsure = ensureSheetExistsAndActive(sheetInstance, targetSheetName);
        if (!okEnsure) return fail('Failed to create/select target sheet', { tool: name, sheet: targetSheetName });
      }

      const values = args?.values;
      if (!Array.isArray(values)) return fail('values must be a 2D array', { tool: name });

      let range = String(args?.range || '').trim();
      const startCell = String(args?.startCell || '').trim();
      if (!range && startCell) {
        const start = parseA1Cell(startCell);
        if (!start) return fail('Invalid startCell', { tool: name, startCell });
        const rowCount = values.length;
        const colCount = Math.max(0, ...values.map((r) => (Array.isArray(r) ? r.length : 0)));
        const endCol = start.col + Math.max(0, colCount - 1);
        const endRow = start.row + Math.max(0, rowCount - 1);
        range = `${colToLetters(start.col)}${start.row}:${colToLetters(endCol)}${endRow}`;
      }

      range = String(range || '').trim();
      if (!range) return fail('range or startCell required', { tool: name });

      const sheet = resolveTargetSheet(sheetInstance, targetSheetName);
      if (!sheet) return fail('No active sheet found on SheetNext instance', { tool: name });

      // Fast path: insertTable (SheetNext documented)
      if (typeof sheet.insertTable === 'function') {
        try {
          sheet.insertTable(values, range);
          // refresh best-effort
          try {
            sheetInstance?.render?.();
            sheetInstance?.refresh?.();
          } catch {}
          return ok({ tool: name, sheet: sheet.name, changedRange: `${sheet.name}!${range}`, via: 'sheet.insertTable' });
        } catch (e) {
          dbg('insertTable failed, fallback to cell loop:', e?.message ?? String(e));
        }
      }

      // Fallback: loop cells
      const parsed = parseA1Range(range);
      if (!parsed) return fail('Invalid range', { tool: name, range });
      const rowCount = parsed.endRow - parsed.startRow + 1;
      const colCount = parsed.endCol - parsed.startCol + 1;

      let lastVia = null;
      for (let r = 0; r < rowCount; r++) {
        const row = Array.isArray(values[r]) ? values[r] : [];
        for (let c = 0; c < colCount; c++) {
          const addr = `${colToLetters(parsed.startCol + c)}${parsed.startRow + r}`;
          const v = row[c] ?? null;
          const res = trySetCellOnSheet(sheet, addr, v);
          if (!res.ok) return fail('No supported SheetNext cell write API found', { tool: name, addr });
          lastVia = res.via || lastVia;
        }
      }

      try {
        sheetInstance?.render?.();
        sheetInstance?.refresh?.();
      } catch {}

      return ok({ tool: name, sheet: sheet.name, changedRange: `${sheet.name}!${range}`, via: lastVia });
    }

    if (name === SHEET_TOOL_NAMES.GET_RANGE_VALUES) {
      const targetSheetName = args?.sheet ? String(args.sheet) : '';
      if (targetSheetName) trySelectSheet(sheetInstance, targetSheetName);

      const range = String(args?.range || '').trim();
      const sheet = resolveTargetSheet(sheetInstance, targetSheetName);
      if (!sheet) return fail('No active sheet found', { tool: name });

      // Use eachArea if present (SheetNext documented)
      if (typeof sheet.eachArea === 'function') {
        try {
          const parsed = typeof sheet.rangeStrToNum === 'function' ? sheet.rangeStrToNum(range) : null;
          if (parsed?.s && parsed?.e) {
            const rowCount = parsed.e.r - parsed.s.r + 1;
            const colCount = parsed.e.c - parsed.s.c + 1;
            const out = Array.from({ length: rowCount }, () => Array.from({ length: colCount }, () => null));
            sheet.eachArea(range, (r, c) => {
              const cell = sheet.getCell(r, c);
              const v = cell?.showVal ?? cell?.v ?? cell?.value ?? null;
              out[r - parsed.s.r][c - parsed.s.c] = v;
            });
            return ok({ tool: name, sheet: sheet.name, range, values: out, via: 'sheet.eachArea' });
          }
        } catch (e) {
          dbg('eachArea read failed, fallback:', e?.message ?? String(e));
        }
      }

      // Fallback: loop
      const parsed = parseA1Range(range);
      if (!parsed) return fail('Invalid range', { tool: name, range });
      const rowCount = parsed.endRow - parsed.startRow + 1;
      const colCount = parsed.endCol - parsed.startCol + 1;
      const out = [];
      for (let r = 0; r < rowCount; r++) {
        const row = [];
        for (let c = 0; c < colCount; c++) {
          const addr = `${colToLetters(parsed.startCol + c)}${parsed.startRow + r}`;
          const res = tryGetCellOnSheet(sheet, addr);
          row.push(res.found ? res.value : null);
        }
        out.push(row);
      }

      return ok({ tool: name, sheet: sheet.name, range, values: out });
    }

    if (name === SHEET_TOOL_NAMES.FORMAT_RANGE) {
      const targetSheetName = args?.sheet ? String(args.sheet) : '';
      if (targetSheetName) ensureSheetExistsAndActive(sheetInstance, targetSheetName);

      const range = String(args?.range || '').trim();
      const style = args?.style || {};
      const sheet = resolveTargetSheet(sheetInstance, targetSheetName);
      if (!sheet) return fail('No active sheet found', { tool: name });
      if (!range) return fail('range required', { tool: name });

      // Prefer insertTable config in data generation; for formatting use best-effort.
      const formatted = tryFormatRange(sheetInstance, range, style);
      if (!formatted) {
        return fail('No format/style API found on SheetNext instance (MVP limitation)', { tool: name, range });
      }

      try {
        sheetInstance?.render?.();
        sheetInstance?.refresh?.();
      } catch {}

      return ok({ tool: name, sheet: sheet.name, changedRange: `${sheet.name}!${range}` });
    }

    return fail(`Unknown tool: ${name}`);
  } catch (e) {
    return fail(e?.message ?? String(e));
  }
}

export function colToLetters(col) {
  let n = Number(col);
  if (!Number.isFinite(n) || n <= 0) return 'A';
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

