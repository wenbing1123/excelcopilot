import { SHEET_TOOL_NAMES } from './sheetTools.js';

// --- workbook sheet helpers ---
function getAllSheets(wb) {
  return Array.isArray(wb?.sheets) ? wb.sheets : Array.isArray(wb?.workbook?.sheets) ? wb.workbook.sheets : [];
}

function visibleSheets(wb) {
  return getAllSheets(wb).filter((s) => !s?.hidden);
}

function tryActivateNeighborSheetBeforeDelete(wb, deleteName) {
  const activeName = wb?.activeSheet?.name;
  if (!activeName || activeName !== deleteName) return;

  const vis = visibleSheets(wb);
  const idx = vis.findIndex((s) => s?.name === deleteName);
  const next = idx >= 0 ? (vis[idx + 1] || vis[idx - 1]) : vis[0];
  if (!next?.name) return;

  try {
    if (typeof wb?.setActiveSheet === 'function') wb.setActiveSheet(next.name);
    else if (typeof wb?.selectSheet === 'function') wb.selectSheet(next.name);
    else if (typeof wb?.setSheet === 'function') wb.setSheet(next.name);
  } catch {
    // ignore
  }
}

function getUtils(wb) {
  return wb?.Utils || wb?.utils || wb?.api?.Utils || wb?.api?.utils || null;
}

function getUndoRedo(wb) {
  return wb?.UndoRedo || wb?.undoRedo || wb?.api?.UndoRedo || wb?.api?.undoRedo || null;
}

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

function getWorkbookByNamespace(namespace) {
  const ns = String(namespace || '').trim();
  if (!ns) return null;
  try {
    const wb = globalThis?.[ns];
    return wb || null;
  } catch {
    return null;
  }
}

function resolveWorkbookInstance(defaultInstance, namespace) {
  return getWorkbookByNamespace(namespace) || defaultInstance || null;
}

function safeStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => String(x)).filter(Boolean);
}

function workbookInfoSnapshot(wb) {
  const sheetNames =
    Array.isArray(wb?.sheetNames) && wb.sheetNames.length
      ? safeStringArray(wb.sheetNames)
      : Array.isArray(wb?.sheets)
        ? wb.sheets.map((s) => s?.name).filter(Boolean)
        : [];

  return {
    workbookName: typeof wb?.workbookName === 'string' ? wb.workbookName : null,
    namespace: typeof wb?.namespace === 'string' ? wb.namespace : null,
    locked: typeof wb?.locked === 'boolean' ? wb.locked : null,
    activeSheetName: wb?.activeSheet?.name ?? wb?.api?.activeSheet?.name ?? null,
    sheetNames,
    sheetCount: sheetNames.length || (Array.isArray(wb?.sheets) ? wb.sheets.length : null),
  };
}

function sheetSnapshot(wb, sheet) {
  if (!sheet) return null;
  const name = sheet?.name ?? null;
  let index = null;
  try {
    if (Array.isArray(wb?.sheets) && name) {
      index = wb.sheets.findIndex((s) => s?.name === name);
      if (index < 0) index = null;
    }
  } catch {
    // ignore
  }

  return {
    name,
    index,
    active: !!(wb?.activeSheet && name && wb.activeSheet.name === name),
  };
}

function toA1RangeNumOrString(sheet, rangeOrObj) {
  if (!rangeOrObj) return null;
  if (typeof rangeOrObj === 'string') return String(rangeOrObj);
  // If already a RangeNum-like object, pass through
  if (typeof rangeOrObj === 'object' && rangeOrObj.s && rangeOrObj.e) return rangeOrObj;
  // If given A1 under different key
  if (typeof rangeOrObj === 'object' && typeof rangeOrObj.range === 'string') return String(rangeOrObj.range);
  return null;
}

function safeCloneJson(x) {
  try {
    return JSON.parse(JSON.stringify(x));
  } catch {
    return null;
  }
}

function sheetInfoSnapshot(sheet) {
  if (!sheet) return null;
  return {
    name: sheet?.name ?? null,
    hidden: typeof sheet?.hidden === 'boolean' ? sheet.hidden : null,
    defaultColWidth: typeof sheet?.defaultColWidth === 'number' ? sheet.defaultColWidth : null,
    defaultRowHeight: typeof sheet?.defaultRowHeight === 'number' ? sheet.defaultRowHeight : null,
    showGridLines: typeof sheet?.showGridLines === 'boolean' ? sheet.showGridLines : null,
    showRowColHeaders: typeof sheet?.showRowColHeaders === 'boolean' ? sheet.showRowColHeaders : null,
    rowCount: typeof sheet?.rowCount === 'number' ? sheet.rowCount : null,
    colCount: typeof sheet?.colCount === 'number' ? sheet.colCount : null,
    xSplit: typeof sheet?.xSplit === 'number' ? sheet.xSplit : null,
    ySplit: typeof sheet?.ySplit === 'number' ? sheet.ySplit : null,
    activeCell: sheet?.activeCell ? safeCloneJson(sheet.activeCell) : null,
    activeAreas: Array.isArray(sheet?.activeAreas) ? safeCloneJson(sheet.activeAreas) : [],
    merges: Array.isArray(sheet?.merges) ? safeCloneJson(sheet.merges) : [],
    drawingsCount: Array.isArray(sheet?.drawings) ? sheet.drawings.length : null,
  };
}

function cellSnapshot(cell) {
  if (!cell) return null;
  return {
    editVal: cell?.editVal ?? null,
    calcVal: cell?.calcVal ?? null,
    showVal: cell?.showVal ?? null,
    type: cell?.type ?? null,
    isFormula: typeof cell?.isFormula === 'boolean' ? cell.isFormula : null,
    isMerged: typeof cell?.isMerged === 'boolean' ? cell.isMerged : null,
    master: cell?.master ? safeCloneJson(cell.master) : null,

    // styles
    font: cell?.font ? safeCloneJson(cell.font) : null,
    alignment: cell?.alignment ? safeCloneJson(cell.alignment) : null,
    border: cell?.border ? safeCloneJson(cell.border) : null,
    fill: cell?.fill ? safeCloneJson(cell.fill) : null,
    numFmt: cell?.numFmt ?? null,

    // features
    hyperlink: cell?.hyperlink ? safeCloneJson(cell.hyperlink) : null,
    dataValidation: cell?.dataValidation ? safeCloneJson(cell.dataValidation) : null,
    validData: typeof cell?.validData === 'boolean' ? cell.validData : null,
  };
}

function rowSnapshot(row) {
  if (!row) return null;
  return {
    rIndex: typeof row?.rIndex === 'number' ? row.rIndex : null,
    height: typeof row?.height === 'number' ? row.height : null,
    hidden: typeof row?.hidden === 'boolean' ? row.hidden : null,
    numFmt: row?.numFmt ?? null,
    font: row?.font ? safeCloneJson(row.font) : null,
    alignment: row?.alignment ? safeCloneJson(row.alignment) : null,
    border: row?.border ? safeCloneJson(row.border) : null,
    fill: row?.fill ? safeCloneJson(row.fill) : null,
  };
}

function getRowByIndex(sheet, r) {
  if (!sheet) return null;
  const idx = Number(r);
  if (!Number.isFinite(idx) || idx < 0) return null;
  if (typeof sheet.getRow === 'function') {
    try {
      return sheet.getRow(idx);
    } catch {
      return null;
    }
  }
  // fallback from rows[] if exposed
  if (Array.isArray(sheet?.rows)) {
    return sheet.rows[idx] || null;
  }
  return null;
}

function getCellByA1(sheet, a1) {
  const addr = String(a1 || '').trim();
  if (!addr) return null;
  if (typeof sheet?.getCellByStr === 'function') {
    try {
      return sheet.getCellByStr(addr);
    } catch {
      return null;
    }
  }
  // fallback to numeric getCell using A1 parser (0-based)
  if (typeof sheet?.getCell === 'function') {
    const ref = parseA1Cell(addr);
    if (!ref) return null;
    try {
      return sheet.getCell(ref.row - 1, ref.col - 1);
    } catch {
      return null;
    }
  }
  return null;
}

function drawingSnapshot(d) {
  if (!d) return null;
  return {
    id: d?.id ?? null,
    type: d?.type ?? null,
    shapeType: d?.shapeType ?? null,
    isConnector: typeof d?.isConnector === 'boolean' ? d.isConnector : null,
    shapeStyle: d?.shapeStyle ? safeCloneJson(d.shapeStyle) : null,
    shapeText: d?.shapeText ?? null,
    startCell: d?.startCell ? safeCloneJson(d.startCell) : null,
    offsetX: typeof d?.offsetX === 'number' ? d.offsetX : null,
    offsetY: typeof d?.offsetY === 'number' ? d.offsetY : null,
    width: typeof d?.width === 'number' ? d.width : null,
    height: typeof d?.height === 'number' ? d.height : null,
    option: d?.option ? safeCloneJson(d.option) : null,
    imageBase64: d?.imageBase64 ?? null,
    area: d?.area ? safeCloneJson(d.area) : null,
    anchorType: d?.anchorType ?? null,
    updRender: typeof d?.updRender === 'boolean' ? d.updRender : null,
  };
}

function findDrawingById(sheet, id) {
  const needle = String(id || '').trim();
  if (!needle) return null;
  const list = Array.isArray(sheet?.drawings) ? sheet.drawings : null;
  if (list) {
    const hit = list.find((x) => String(x?.id || '') === needle);
    if (hit) return hit;
  }
  return null;
}

function applyDrawingPatch(d, patch) {
  const allowed = [
    'startCell',
    'offsetX',
    'offsetY',
    'width',
    'height',
    'option',
    'anchorType',
    'updRender',
    'shapeText',
    'shapeStyle',
    'imageBase64',
  ];

  for (const k of allowed) {
    if (!(k in patch)) continue;
    try {
      d[k] = patch[k];
    } catch {
      // ignore read-only
    }
  }
}

function layoutSnapshot(layout) {
  if (!layout) return null;
  return {
    showMenuBar: typeof layout?.showMenuBar === 'boolean' ? layout.showMenuBar : null,
    showToolbar: typeof layout?.showToolbar === 'boolean' ? layout.showToolbar : null,
    showFormulaBar: typeof layout?.showFormulaBar === 'boolean' ? layout.showFormulaBar : null,
    showSheetTabBar: typeof layout?.showSheetTabBar === 'boolean' ? layout.showSheetTabBar : null,
    showAIChat: typeof layout?.showAIChat === 'boolean' ? layout.showAIChat : null,
    showAIChatWindow: typeof layout?.showAIChatWindow === 'boolean' ? layout.showAIChatWindow : null,
    isSmallWindow: typeof layout?.isSmallWindow === 'boolean' ? layout.isSmallWindow : null,
    menuConfig: layout?.menuConfig ? safeCloneJson(layout.menuConfig) : null,
  };
}

function applyLayoutPatch(layout, args) {
  const keys = [
    'showMenuBar',
    'showToolbar',
    'showFormulaBar',
    'showSheetTabBar',
    'showAIChat',
    'showAIChatWindow',
  ];
  for (const k of keys) {
    if (!(k in (args || {}))) continue;
    try {
      layout[k] = !!args[k];
    } catch {
      // ignore
    }
  }
}

export async function executeSheetToolCall(sheetInstance, toolCall) {
  try {
    if (!sheetInstance) return fail('SheetNext instance not ready');

    const name = toolCall?.function?.name || toolCall?.name;
    const rawArgs = toolCall?.function?.arguments ?? toolCall?.arguments ?? {};
    const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs || {});

    // Resolve target SheetNext workbook instance (support multi-instance by namespace)
    const wb = resolveWorkbookInstance(sheetInstance, args?.namespace);
    if (!wb) return fail('SheetNext instance not ready', { tool: name });

    dbg('execute', name, args);

    // Resolve target sheet for sheet-level tools (if needed)
    const targetSheetName = args?.sheet ? String(args.sheet) : '';
    const targetSheet = resolveTargetSheet(wb, targetSheetName);

    // --- Sheet context export (for LLM) ---
    if (name === SHEET_TOOL_NAMES.SHEET_EXPORT_SHEET_CONTEXT) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });

      const maxRows = Number.isFinite(Number(args?.maxRows)) ? Math.max(1, Math.floor(Number(args.maxRows))) : 50;
      const maxCols = Number.isFinite(Number(args?.maxCols)) ? Math.max(1, Math.floor(Number(args.maxCols))) : 26;
      const withStyles = args?.withStyles !== false;

      const rowCount = typeof targetSheet?.rowCount === 'number' ? targetSheet.rowCount : maxRows;
      const colCount = typeof targetSheet?.colCount === 'number' ? targetSheet.colCount : maxCols;

      const outRows = Math.min(rowCount, maxRows);
      const outCols = Math.min(colCount, maxCols);

      const grid = [];
      for (let r = 0; r < outRows; r++) {
        const row = [];
        for (let c = 0; c < outCols; c++) {
          let cell = null;
          try {
            cell = typeof targetSheet.getCell === 'function' ? targetSheet.getCell(r, c) : null;
          } catch {
            cell = null;
          }

          if (!cell) {
            row.push(null);
            continue;
          }

          const snap = cellSnapshot(cell);
          if (!withStyles) {
            // keep only core value-ish fields
            row.push({
              editVal: snap?.editVal ?? null,
              showVal: snap?.showVal ?? null,
              calcVal: snap?.calcVal ?? null,
              type: snap?.type ?? null,
              isFormula: snap?.isFormula ?? null,
              isMerged: snap?.isMerged ?? null,
              master: snap?.master ?? null,
            });
          } else {
            // keep a compact subset of styles to limit prompt size
            row.push({
              editVal: snap?.editVal ?? null,
              showVal: snap?.showVal ?? null,
              calcVal: snap?.calcVal ?? null,
              type: snap?.type ?? null,
              isFormula: snap?.isFormula ?? null,
              isMerged: snap?.isMerged ?? null,
              master: snap?.master ?? null,
              font: snap?.font ?? null,
              alignment: snap?.alignment ?? null,
              border: snap?.border ?? null,
              fill: snap?.fill ?? null,
              numFmt: snap?.numFmt ?? null,
            });
          }
        }
        grid.push(row);
      }

      const meta = {
        sheet: targetSheet?.name ?? null,
        rowCount: typeof targetSheet?.rowCount === 'number' ? targetSheet.rowCount : null,
        colCount: typeof targetSheet?.colCount === 'number' ? targetSheet.colCount : null,
        activeCell: targetSheet?.activeCell ? safeCloneJson(targetSheet.activeCell) : null,
        activeAreas: Array.isArray(targetSheet?.activeAreas) ? safeCloneJson(targetSheet.activeAreas) : [],
        defaultRowHeight: typeof targetSheet?.defaultRowHeight === 'number' ? targetSheet.defaultRowHeight : null,
        defaultColWidth: typeof targetSheet?.defaultColWidth === 'number' ? targetSheet.defaultColWidth : null,
      };

      return ok({
        tool: name,
        meta,
        exported: {
          maxRows,
          maxCols,
          withStyles,
          // Future RAG extension point: embed an index over (sheet, r, c, showVal, style)
          ragHint: 'future: chunk cells/ranges and build embeddings index',
        },
        grid,
      });
    }

    // --- Sheet-level tools ---
    if (name === SHEET_TOOL_NAMES.SHEET_GET_INFO) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      return ok({ tool: name, sheet: targetSheet?.name ?? null, info: sheetInfoSnapshot(targetSheet) });
    }

    if (name === SHEET_TOOL_NAMES.SHEET_SHOW_ALL_HID_ROWS) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      if (typeof targetSheet?.showAllHidRows !== 'function') return fail('Sheet.showAllHidRows not supported', { tool: name });
      targetSheet.showAllHidRows();
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name });
    }

    if (name === SHEET_TOOL_NAMES.SHEET_SHOW_ALL_HID_COLS) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      if (typeof targetSheet?.showAllHidCols !== 'function') return fail('Sheet.showAllHidCols not supported', { tool: name });
      targetSheet.showAllHidCols();
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name });
    }

    if (name === SHEET_TOOL_NAMES.SHEET_ADD_ROWS) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      if (typeof targetSheet?.addRows !== 'function') return fail('Sheet.addRows not supported', { tool: name });
      const startR = Number(args?.startR);
      const num = Number(args?.num);
      if (!Number.isFinite(startR) || startR < 0) return fail('startR must be a non-negative number (0-based)', { tool: name });
      if (!Number.isFinite(num) || num <= 0) return fail('num must be a positive number', { tool: name });
      targetSheet.addRows(startR, num);
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, startR, num });
    }

    if (name === SHEET_TOOL_NAMES.SHEET_ADD_COLS) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      if (typeof targetSheet?.addCols !== 'function') return fail('Sheet.addCols not supported', { tool: name });
      const startC = Number(args?.startC);
      const num = Number(args?.num);
      if (!Number.isFinite(startC) || startC < 0) return fail('startC must be a non-negative number (0-based)', { tool: name });
      if (!Number.isFinite(num) || num <= 0) return fail('num must be a positive number', { tool: name });
      targetSheet.addCols(startC, num);
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, startC, num });
    }

    if (name === SHEET_TOOL_NAMES.SHEET_DEL_ROWS) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      if (typeof targetSheet?.delRows !== 'function') return fail('Sheet.delRows not supported', { tool: name });
      const startR = Number(args?.startR);
      const num = Number(args?.num);
      if (!Number.isFinite(startR) || startR < 0) return fail('startR must be a non-negative number (0-based)', { tool: name });
      if (!Number.isFinite(num) || num <= 0) return fail('num must be a positive number', { tool: name });
      targetSheet.delRows(startR, num);
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, startR, num });
    }

    if (name === SHEET_TOOL_NAMES.SHEET_DEL_COLS) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      if (typeof targetSheet?.delCols !== 'function') return fail('Sheet.delCols not supported', { tool: name });
      const startC = Number(args?.startC);
      const num = Number(args?.num);
      if (!Number.isFinite(startC) || startC < 0) return fail('startC must be a non-negative number (0-based)', { tool: name });
      if (!Number.isFinite(num) || num <= 0) return fail('num must be a positive number', { tool: name });
      targetSheet.delCols(startC, num);
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, startC, num });
    }

    if (name === SHEET_TOOL_NAMES.SHEET_MERGE_CELLS) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      if (typeof targetSheet?.mergeCells !== 'function') return fail('Sheet.mergeCells not supported', { tool: name });
      const range = String(args?.range || '').trim();
      if (!range) return fail('range required', { tool: name });
      targetSheet.mergeCells(range);
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, range });
    }

    if (name === SHEET_TOOL_NAMES.SHEET_UNMERGE_CELLS) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      if (typeof targetSheet?.unMergeCells !== 'function') return fail('Sheet.unMergeCells not supported', { tool: name });
      const cell = String(args?.cell || '').trim();
      if (!cell) return fail('cell required', { tool: name });
      targetSheet.unMergeCells(cell);
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, cell });
    }

    if (name === SHEET_TOOL_NAMES.SHEET_RANGE_SORT) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      if (typeof targetSheet?.rangeSort !== 'function') return fail('Sheet.rangeSort not supported', { tool: name });
      const sortItems = args?.sortItems;
      if (!Array.isArray(sortItems) || sortItems.length === 0) return fail('sortItems must be a non-empty array', { tool: name });
      const range = args?.range != null ? String(args.range).trim() : undefined;
      targetSheet.rangeSort(sortItems, range || undefined);
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, range: range || null, sortItemsCount: sortItems.length });
    }

    if (name === SHEET_TOOL_NAMES.SHEET_INSERT_TABLE) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      if (typeof targetSheet?.insertTable !== 'function') return fail('Sheet.insertTable not supported', { tool: name });
      const startCell = String(args?.startCell || '').trim();
      if (!startCell) return fail('startCell required', { tool: name });
      const data = args?.data;
      if (!Array.isArray(data)) return fail('data must be a 2D array', { tool: name });
      const globalConfig = args?.globalConfig && typeof args.globalConfig === 'object' ? args.globalConfig : undefined;
      const changed = targetSheet.insertTable(data, startCell, globalConfig);
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, startCell, changedRange: safeCloneJson(changed) });
    }

    if (name === SHEET_TOOL_NAMES.SHEET_ADD_DRAWING) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      if (typeof targetSheet?.addDrawing !== 'function') return fail('Sheet.addDrawing not supported', { tool: name });
      const config = args?.config;
      if (!config || typeof config !== 'object') return fail('config must be an object', { tool: name });

      // Chart safeguard: SheetNext requires option for charts.
      if (config?.type === 'chart') {
        if (!config.option || typeof config.option !== 'object') {
          config.option = defaultChartOption();
        }
        config.option = normalizeChartOption(config.option, targetSheet, config.startCell);
      }

      const drawing = targetSheet.addDrawing(config);
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, drawing: safeCloneJson(drawing) });
    }

    if (name === SHEET_TOOL_NAMES.SHEET_GET_DRAWINGS_BY_CELL) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      if (typeof targetSheet?.getDrawingsByCell !== 'function') return fail('Sheet.getDrawingsByCell not supported', { tool: name });
      const cell = String(args?.cell || '').trim();
      if (!cell) return fail('cell required', { tool: name });
      const drawings = targetSheet.getDrawingsByCell(cell);
      return ok({ tool: name, sheet: targetSheet.name, cell, drawings: safeCloneJson(drawings) || [] });
    }

    if (name === SHEET_TOOL_NAMES.SHEET_REMOVE_DRAWING) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      if (typeof targetSheet?.removeDrawing !== 'function') return fail('Sheet.removeDrawing not supported', { tool: name });
      const id = String(args?.id || '').trim();
      if (!id) return fail('id required', { tool: name });
      targetSheet.removeDrawing(id);
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, id, removed: true });
    }

    // --- Workbook-level tools ---
    if (name === SHEET_TOOL_NAMES.WORKBOOK_GET_INFO) {
      return ok({ tool: name, info: workbookInfoSnapshot(wb) });
    }

    if (name === SHEET_TOOL_NAMES.WORKBOOK_ADD_SHEET) {
      if (typeof wb?.addSheet !== 'function') return fail('SheetNext.addSheet not supported on this instance', { tool: name });
      const sheetName = args?.name != null ? String(args.name).trim() : '';
      const created = sheetName ? wb.addSheet(sheetName) : wb.addSheet();
      const createdName = created?.name ?? (typeof wb?.activeSheet?.name === 'string' ? wb.activeSheet.name : null);
      return ok({ tool: name, sheet: createdName, info: workbookInfoSnapshot(wb) });
    }

    if (name === SHEET_TOOL_NAMES.WORKBOOK_DEL_SHEET) {
      if (typeof wb?.delSheet !== 'function') return fail('SheetNext.delSheet not supported on this instance', { tool: name });
      const sheetName = String(args?.name || '').trim();
      if (!sheetName) return fail('name required', { tool: name });
      wb.delSheet(sheetName);
      return ok({ tool: name, deleted: true, name: sheetName, info: workbookInfoSnapshot(wb) });
    }

    if (name === SHEET_TOOL_NAMES.WORKBOOK_GET_SHEET_BY_NAME) {
      const sheetName = String(args?.name || '').trim();
      if (!sheetName) return fail('name required', { tool: name });
      const s = typeof wb?.getSheetByName === 'function' ? wb.getSheetByName(sheetName) : getSheetByName(wb, sheetName);
      return ok({ tool: name, sheet: sheetSnapshot(wb, s) });
    }

    if (name === SHEET_TOOL_NAMES.WORKBOOK_GET_VISIBLE_SHEET_BY_INDEX) {
      const idx = Number(args?.index);
      if (!Number.isFinite(idx) || idx < 0) return fail('index must be a non-negative number (0-based)', { tool: name });
      if (typeof wb?.getVisibleSheetByIndex !== 'function') {
        // best-effort fallback: treat wb.sheets as visible list
        const s = Array.isArray(wb?.sheets) ? wb.sheets[idx] : null;
        return ok({ tool: name, sheet: sheetSnapshot(wb, s) });
      }
      const s = wb.getVisibleSheetByIndex(idx);
      return ok({ tool: name, sheet: sheetSnapshot(wb, s) });
    }

    if (name === SHEET_TOOL_NAMES.WORKBOOK_RERENDER) {
      if (typeof wb?.r === 'function') {
        wb.r();
        return ok({ tool: name });
      }
      // fallback to known refresh methods
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, via: 'render/refresh' });
    }

    if (name === SHEET_TOOL_NAMES.WORKBOOK_GET_DATA) {
      if (typeof wb?.getData !== 'function') return fail('SheetNext.getData not supported on this instance', { tool: name });
      const data = wb.getData();
      return ok({ tool: name, data });
    }

    if (name === SHEET_TOOL_NAMES.WORKBOOK_SET_DATA) {
      if (typeof wb?.setData !== 'function') return fail('SheetNext.setData not supported on this instance', { tool: name });
      const data = args?.data;
      if (data == null || typeof data !== 'object') return fail('data must be an object', { tool: name });
      const res = wb.setData(data);
      return ok({ tool: name, result: res === undefined ? true : res, info: workbookInfoSnapshot(wb) });
    }

    if (name === SHEET_TOOL_NAMES.WORKBOOK_IMPORT_FROM_URL) {
      if (typeof wb?.importFromUrl !== 'function') return fail('SheetNext.importFromUrl not supported on this instance', { tool: name });
      const url = String(args?.url || '').trim();
      if (!url) return fail('url required', { tool: name });
      await wb.importFromUrl(url);
      return ok({ tool: name, imported: true, url, info: workbookInfoSnapshot(wb) });
    }

    if (name === SHEET_TOOL_NAMES.WORKBOOK_EXPORT) {
      if (typeof wb?.export !== 'function') return fail('SheetNext.export not supported on this instance', { tool: name });
      const type = String(args?.type || '').trim().toUpperCase();
      if (!type) return fail('type required', { tool: name });
      wb.export(type);
      return ok({ tool: name, exported: true, type });
    }

    // --- Existing sheet-range tools keep using the passed instance ---
    if (name === SHEET_TOOL_NAMES.ADD_SHEET) {
      const sheetName = String(args?.name || '').trim();
      if (!sheetName) return fail('name required');

      const okEnsure = ensureSheetExistsAndActive(wb, sheetName);
      if (!okEnsure) return fail('Failed to create/select sheet (SheetNext API not found)', { tool: name, sheet: sheetName });

      return ok({ tool: name, sheet: sheetName });
    }

    if (name === SHEET_TOOL_NAMES.SET_RANGE_VALUES) {
      const targetSheetName = args?.sheet ? String(args.sheet) : '';
      if (targetSheetName) {
        const okEnsure = ensureSheetExistsAndActive(wb, targetSheetName);
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

      const sheet = resolveTargetSheet(wb, targetSheetName);
      if (!sheet) return fail('No active sheet found on SheetNext instance', { tool: name });

      // Fast path: insertTable (SheetNext documented)
      if (typeof sheet.insertTable === 'function') {
        try {
          sheet.insertTable(values, range);
          // refresh best-effort
          try {
            wb?.render?.();
            wb?.refresh?.();
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
        wb?.render?.();
        wb?.refresh?.();
      } catch {}

      return ok({ tool: name, sheet: sheet.name, changedRange: `${sheet.name}!${range}`, via: lastVia });
    }

    if (name === SHEET_TOOL_NAMES.GET_RANGE_VALUES) {
      const targetSheetName = args?.sheet ? String(args.sheet) : '';
      if (targetSheetName) trySelectSheet(wb, targetSheetName);

      const range = String(args?.range || '').trim();
      const sheet = resolveTargetSheet(wb, targetSheetName);
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
      if (targetSheetName) ensureSheetExistsAndActive(wb, targetSheetName);

      const range = String(args?.range || '').trim();
      const style = args?.style || {};
      const sheet = resolveTargetSheet(wb, targetSheetName);
      if (!sheet) return fail('No active sheet found', { tool: name });
      if (!range) return fail('range required', { tool: name });

      // Prefer insertTable config in data generation; for formatting use best-effort.
      const formatted = tryFormatRange(wb, range, style);
      if (!formatted) {
        return fail('No format/style API found on SheetNext instance (MVP limitation)', { tool: name, range });
      }

      try {
        wb?.render?.();
        wb?.refresh?.();
      } catch {}

      return ok({ tool: name, sheet: sheet.name, changedRange: `${sheet.name}!${range}` });
    }

    // --- Cell-level tools ---
    if (name === SHEET_TOOL_NAMES.CELL_GET) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const cellAddr = String(args?.cell || '').trim();
      if (!cellAddr) return fail('cell required', { tool: name });
      const cell = getCellByA1(targetSheet, cellAddr);
      if (!cell) return fail('Cell not found or unsupported API', { tool: name, cell: cellAddr });
      return ok({ tool: name, sheet: targetSheet.name, cell: cellAddr, data: cellSnapshot(cell) });
    }

    if (name === SHEET_TOOL_NAMES.CELL_SET_EDIT_VAL) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const cellAddr = String(args?.cell || '').trim();
      if (!cellAddr) return fail('cell required', { tool: name });
      const cell = getCellByA1(targetSheet, cellAddr);
      if (!cell) return fail('Cell not found or unsupported API', { tool: name, cell: cellAddr });
      cell.editVal = args?.editVal;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, cell: cellAddr, data: cellSnapshot(cell) });
    }

    if (name === SHEET_TOOL_NAMES.CELL_SET_FONT) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const cellAddr = String(args?.cell || '').trim();
      const font = args?.font;
      if (!cellAddr) return fail('cell required', { tool: name });
      if (!font || typeof font !== 'object') return fail('font must be an object', { tool: name });
      const cell = getCellByA1(targetSheet, cellAddr);
      if (!cell) return fail('Cell not found or unsupported API', { tool: name, cell: cellAddr });
      cell.font = font;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, cell: cellAddr, data: cellSnapshot(cell) });
    }

    if (name === SHEET_TOOL_NAMES.CELL_SET_ALIGNMENT) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const cellAddr = String(args?.cell || '').trim();
      const alignment = args?.alignment;
      if (!cellAddr) return fail('cell required', { tool: name });
      if (!alignment || typeof alignment !== 'object') return fail('alignment must be an object', { tool: name });
      const cell = getCellByA1(targetSheet, cellAddr);
      if (!cell) return fail('Cell not found or unsupported API', { tool: name, cell: cellAddr });
      cell.alignment = alignment;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, cell: cellAddr, data: cellSnapshot(cell) });
    }

    if (name === SHEET_TOOL_NAMES.CELL_SET_BORDER) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const cellAddr = String(args?.cell || '').trim();
      const border = args?.border;
      if (!cellAddr) return fail('cell required', { tool: name });
      if (border == null || typeof border !== 'object') return fail('border must be an object', { tool: name });
      const cell = getCellByA1(targetSheet, cellAddr);
      if (!cell) return fail('Cell not found or unsupported API', { tool: name, cell: cellAddr });
      cell.border = border;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, cell: cellAddr, data: cellSnapshot(cell) });
    }

    if (name === SHEET_TOOL_NAMES.CELL_SET_FILL) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const cellAddr = String(args?.cell || '').trim();
      const fill = args?.fill;
      if (!cellAddr) return fail('cell required', { tool: name });
      if (fill == null || typeof fill !== 'object') return fail('fill must be an object', { tool: name });
      const cell = getCellByA1(targetSheet, cellAddr);
      if (!cell) return fail('Cell not found or unsupported API', { tool: name, cell: cellAddr });
      cell.fill = fill;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, cell: cellAddr, data: cellSnapshot(cell) });
    }

    if (name === SHEET_TOOL_NAMES.CELL_SET_NUM_FMT) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const cellAddr = String(args?.cell || '').trim();
      if (!cellAddr) return fail('cell required', { tool: name });
      const cell = getCellByA1(targetSheet, cellAddr);
      if (!cell) return fail('Cell not found or unsupported API', { tool: name, cell: cellAddr });
      cell.numFmt = args?.numFmt;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, cell: cellAddr, data: cellSnapshot(cell) });
    }

    if (name === SHEET_TOOL_NAMES.CELL_SET_HYPERLINK) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const cellAddr = String(args?.cell || '').trim();
      const hyperlink = args?.hyperlink;
      if (!cellAddr) return fail('cell required', { tool: name });
      if (hyperlink == null || typeof hyperlink !== 'object') return fail('hyperlink must be an object', { tool: name });
      const cell = getCellByA1(targetSheet, cellAddr);
      if (!cell) return fail('Cell not found or unsupported API', { tool: name, cell: cellAddr });
      cell.hyperlink = hyperlink;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, cell: cellAddr, data: cellSnapshot(cell) });
    }

    if (name === SHEET_TOOL_NAMES.CELL_SET_DATA_VALIDATION) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const cellAddr = String(args?.cell || '').trim();
      const dataValidation = args?.dataValidation;
      if (!cellAddr) return fail('cell required', { tool: name });
      if (dataValidation == null || typeof dataValidation !== 'object') return fail('dataValidation must be an object', { tool: name });
      const cell = getCellByA1(targetSheet, cellAddr);
      if (!cell) return fail('Cell not found or unsupported API', { tool: name, cell: cellAddr });
      cell.dataValidation = dataValidation;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, cell: cellAddr, data: cellSnapshot(cell) });
    }

    // --- Row-level tools ---
    if (name === SHEET_TOOL_NAMES.ROW_GET) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const r = Number(args?.row);
      const row = getRowByIndex(targetSheet, r);
      if (!row) return fail('Row not found or unsupported API', { tool: name, row: r });
      return ok({ tool: name, sheet: targetSheet.name, row: r, data: rowSnapshot(row) });
    }

    if (name === SHEET_TOOL_NAMES.ROW_SET_HEIGHT) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const r = Number(args?.row);
      const height = Number(args?.height);
      if (!Number.isFinite(height) || height <= 0) return fail('height must be a positive number (pixels)', { tool: name, height });
      const row = getRowByIndex(targetSheet, r);
      if (!row) return fail('Row not found or unsupported API', { tool: name, row: r });
      row.height = height;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, row: r, data: rowSnapshot(row) });
    }

    if (name === SHEET_TOOL_NAMES.ROW_SET_HIDDEN) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const r = Number(args?.row);
      const hidden = !!args?.hidden;
      const row = getRowByIndex(targetSheet, r);
      if (!row) return fail('Row not found or unsupported API', { tool: name, row: r });
      row.hidden = hidden;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, row: r, data: rowSnapshot(row) });
    }

    if (name === SHEET_TOOL_NAMES.ROW_SET_NUM_FMT) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const r = Number(args?.row);
      const row = getRowByIndex(targetSheet, r);
      if (!row) return fail('Row not found or unsupported API', { tool: name, row: r });
      row.numFmt = args?.numFmt;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, row: r, data: rowSnapshot(row) });
    }

    if (name === SHEET_TOOL_NAMES.ROW_SET_FONT) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const r = Number(args?.row);
      const font = args?.font;
      if (!font || typeof font !== 'object') return fail('font must be an object', { tool: name });
      const row = getRowByIndex(targetSheet, r);
      if (!row) return fail('Row not found or unsupported API', { tool: name, row: r });
      row.font = font;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, row: r, data: rowSnapshot(row) });
    }

    if (name === SHEET_TOOL_NAMES.ROW_SET_ALIGNMENT) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const r = Number(args?.row);
      const alignment = args?.alignment;
      if (!alignment || typeof alignment !== 'object') return fail('alignment must be an object', { tool: name });
      const row = getRowByIndex(targetSheet, r);
      if (!row) return fail('Row not found or unsupported API', { tool: name, row: r });
      row.alignment = alignment;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, row: r, data: rowSnapshot(row) });
    }

    if (name === SHEET_TOOL_NAMES.ROW_SET_BORDER) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const r = Number(args?.row);
      const border = args?.border;
      if (border == null || typeof border !== 'object') return fail('border must be an object', { tool: name });
      const row = getRowByIndex(targetSheet, r);
      if (!row) return fail('Row not found or unsupported API', { tool: name, row: r });
      row.border = border;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, row: r, data: rowSnapshot(row) });
    }

    if (name === SHEET_TOOL_NAMES.ROW_SET_FILL) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const r = Number(args?.row);
      const fill = args?.fill;
      if (fill == null || typeof fill !== 'object') return fail('fill must be an object', { tool: name });
      const row = getRowByIndex(targetSheet, r);
      if (!row) return fail('Row not found or unsupported API', { tool: name, row: r });
      row.fill = fill;
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, row: r, data: rowSnapshot(row) });
    }

    if (name === SHEET_TOOL_NAMES.ROW_GET_CELL) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const r = Number(args?.row);
      const c = Number(args?.col);
      if (!Number.isFinite(c) || c < 0) return fail('col must be a non-negative number (0-based)', { tool: name, col: args?.col });
      const row = getRowByIndex(targetSheet, r);
      if (!row || typeof row.getCell !== 'function') return fail('Row.getCell not supported', { tool: name, row: r });
      const cell = row.getCell(c);
      if (!cell) return fail('Cell not found', { tool: name, row: r, col: c });
      return ok({ tool: name, sheet: targetSheet.name, row: r, col: c, data: cellSnapshot(cell) });
    }

    // --- Drawing-level tools ---
    if (name === SHEET_TOOL_NAMES.DRAWING_GET) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const id = String(args?.id || '').trim();
      if (!id) return fail('id required', { tool: name });
      const d = findDrawingById(targetSheet, id);
      if (!d) return fail('Drawing not found', { tool: name, id });
      return ok({ tool: name, sheet: targetSheet.name, id, data: drawingSnapshot(d) });
    }

    if (name === SHEET_TOOL_NAMES.DRAWING_UPDATE) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const id = String(args?.id || '').trim();
      const patch = args?.patch;
      if (!id) return fail('id required', { tool: name });
      if (!patch || typeof patch !== 'object') return fail('patch must be an object', { tool: name });
      const d = findDrawingById(targetSheet, id);
      if (!d) return fail('Drawing not found', { tool: name, id });
      applyDrawingPatch(d, patch);
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, id, data: drawingSnapshot(d) });
    }

    if (name === SHEET_TOOL_NAMES.DRAWING_UPD_INDEX) {
      if (!targetSheet) return fail('No active sheet found', { tool: name });
      const id = String(args?.id || '').trim();
      const direction = String(args?.direction || '').trim();
      if (!id) return fail('id required', { tool: name });
      if (!direction) return fail('direction required', { tool: name });
      const d = findDrawingById(targetSheet, id);
      if (!d) return fail('Drawing not found', { tool: name, id });
      if (typeof d?.updIndex !== 'function') return fail('Drawing.updIndex not supported', { tool: name, id });
      d.updIndex(direction);
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, sheet: targetSheet.name, id, direction, data: drawingSnapshot(d) });
    }

    // --- Layout-level tools ---
    if (name === SHEET_TOOL_NAMES.LAYOUT_GET) {
      const layout = wb?.Layout || wb?.layout || wb?.api?.Layout || wb?.api?.layout || null;
      if (!layout) return fail('SheetNext.Layout not found', { tool: name });
      return ok({ tool: name, namespace: wb?.namespace ?? null, data: layoutSnapshot(layout) });
    }

    if (name === SHEET_TOOL_NAMES.LAYOUT_SET) {
      const layout = wb?.Layout || wb?.layout || wb?.api?.Layout || wb?.api?.layout || null;
      if (!layout) return fail('SheetNext.Layout not found', { tool: name });
      applyLayoutPatch(layout, args);
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, namespace: wb?.namespace ?? null, data: layoutSnapshot(layout) });
    }

    // --- Utils-level tools ---
    if (name === SHEET_TOOL_NAMES.UTILS_NUM_TO_CHAR) {
      const utils = getUtils(wb);
      if (!utils || typeof utils.numToChar !== 'function') return fail('SN.Utils.numToChar not supported', { tool: name });
      const num = Number(args?.num);
      if (!Number.isFinite(num)) return fail('num must be a number', { tool: name });
      const result = utils.numToChar(num);
      return ok({ tool: name, num, result });
    }

    if (name === SHEET_TOOL_NAMES.UTILS_CHAR_TO_NUM) {
      const utils = getUtils(wb);
      if (!utils || typeof utils.charToNum !== 'function') return fail('SN.Utils.charToNum not supported', { tool: name });
      const char = String(args?.char || '').trim();
      if (!char) return fail('char required', { tool: name });
      const result = utils.charToNum(char);
      return ok({ tool: name, char, result });
    }

    if (name === SHEET_TOOL_NAMES.UTILS_RANGE_NUM_TO_STR) {
      const utils = getUtils(wb);
      if (!utils || typeof utils.rangeNumToStr !== 'function') return fail('SN.Utils.rangeNumToStr not supported', { tool: name });
      const rangeNum = args?.rangeNum;
      if (!rangeNum || typeof rangeNum !== 'object') return fail('rangeNum must be an object', { tool: name });
      const result = utils.rangeNumToStr(rangeNum);
      return ok({ tool: name, rangeNum, result });
    }

    if (name === SHEET_TOOL_NAMES.UTILS_CELL_STR_TO_NUM) {
      const utils = getUtils(wb);
      if (!utils || typeof utils.cellStrToNum !== 'function') return fail('SN.Utils.cellStrToNum not supported', { tool: name });
      const cellStr = String(args?.cellStr || '').trim();
      if (!cellStr) return fail('cellStr required', { tool: name });
      const result = utils.cellStrToNum(cellStr);
      return ok({ tool: name, cellStr, result: safeCloneJson(result) ?? result });
    }

    if (name === SHEET_TOOL_NAMES.UTILS_CELL_NUM_TO_STR) {
      const utils = getUtils(wb);
      if (!utils || typeof utils.cellNumToStr !== 'function') return fail('SN.Utils.cellNumToStr not supported', { tool: name });
      const cellNum = args?.cellNum;
      if (!cellNum || typeof cellNum !== 'object') return fail('cellNum must be an object', { tool: name });
      const result = utils.cellNumToStr(cellNum);
      return ok({ tool: name, cellNum, result });
    }

    if (name === SHEET_TOOL_NAMES.UTILS_MSG) {
      const utils = getUtils(wb);
      if (!utils || typeof utils.msg !== 'function') return fail('SN.Utils.msg not supported', { tool: name });
      const message = String(args?.message || '').trim();
      if (!message) return fail('message required', { tool: name });
      utils.msg(message);
      return ok({ tool: name, message, shown: true });
    }

    if (name === SHEET_TOOL_NAMES.UTILS_MODAL) {
      const utils = getUtils(wb);
      if (!utils || typeof utils.modal !== 'function') return fail('SN.Utils.modal not supported', { tool: name });
      const options = args?.options;
      if (!options || typeof options !== 'object') return fail('options must be an object', { tool: name });
      try {
        const res = await utils.modal(options);
        return ok({ tool: name, confirmed: true, result: safeCloneJson(res) ?? res });
      } catch (e) {
        // 用户取消 / 关闭：按 ok:false 返回，便于模型分支处理
        return fail('modal canceled', { tool: name, canceled: true, reason: e?.message ?? String(e) });
      }
    }

    // --- History (Undo/Redo) tools ---
    if (name === SHEET_TOOL_NAMES.HISTORY_UNDO) {
      const ur = getUndoRedo(wb);
      if (!ur || typeof ur.undo !== 'function') return fail('SN.UndoRedo.undo not supported', { tool: name });
      ur.undo();
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, undone: true });
    }

    if (name === SHEET_TOOL_NAMES.HISTORY_REDO) {
      const ur = getUndoRedo(wb);
      if (!ur || typeof ur.redo !== 'function') return fail('SN.UndoRedo.redo not supported', { tool: name });
      ur.redo();
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, redone: true });
    }

    if (name === SHEET_TOOL_NAMES.SHEET_CLOSE) {
      const sheetName = String(args?.name || '').trim();
      if (!sheetName) return fail('name required', { tool: name });

      const vis = visibleSheets(wb);
      if (vis.length <= 1) return fail('Cannot close the last visible sheet', { tool: name, name: sheetName });

      const askConfirm = !!args?.askConfirm;
      if (askConfirm) {
        const utils = getUtils(wb);
        if (!utils || typeof utils.modal !== 'function') return fail('SN.Utils.modal not supported for confirmation', { tool: name });
        try {
          await utils.modal({
            title: '关闭工作表',
            content: `确定要关闭工作表 “${sheetName}” 吗？`,
            confirmText: '关闭',
            cancelText: '取消',
          });
        } catch {
          return fail('canceled', { tool: name, canceled: true, name: sheetName });
        }
      }

      tryActivateNeighborSheetBeforeDelete(wb, sheetName);

      if (typeof wb?.delSheet !== 'function') return fail('SheetNext.delSheet not supported on this instance', { tool: name });
      wb.delSheet(sheetName);
      wb?.render?.();
      wb?.refresh?.();
      return ok({ tool: name, closed: true, name: sheetName, info: workbookInfoSnapshot(wb) });
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

function isNonEmptyArray(a) {
  return Array.isArray(a) && a.length > 0;
}

function normalizeChartOption(option, sheet, startCellHint) {
  if (!option || typeof option !== 'object') return option;

  // If config already looks complete, don't touch it.
  const hasSeries = isNonEmptyArray(option.series);
  const hasXAxis = !!option.xAxis;
  const hasYAxis = !!option.yAxis;

  // Ensure series array exists
  const series = hasSeries ? option.series.slice() : [];

  // Try to hydrate empty series with values from a referenced range.
  // Supported lightweight conventions:
  // - option.dataset_range: "A1:B6" or "Sheet1!A1:B6"
  // - option.series[i].dataRange / option.series[i].range: same format
  const parseRange = (s) => {
    const str = String(s || '').trim();
    if (!str) return null;
    const m = str.match(/^(?:([^!]+)!){0,1}([A-Za-z]+\d+):([A-Za-z]+\d+)$/);
    if (!m) return null;
    return {
      sheetName: m[1] ? String(m[1]).trim() : null,
      range: `${m[2]}:${m[3]}`,
    };
  };

  // Minimal defaults so charts actually render even if caller provides only partial option.
  if (!option.grid) option.grid = { left: 40, right: 20, top: 40, bottom: 40 };
  if (!option.tooltip) option.tooltip = { trigger: 'axis' };

  // If no axes, provide a basic cartesian set.
  if (!hasXAxis) option.xAxis = { type: 'category' };
  if (!hasYAxis) option.yAxis = { type: 'value' };

  // If series is missing, create one placeholder so ECharts draws something once data is filled.
  if (!isNonEmptyArray(option.series)) {
    option.series = [{ type: 'line', name: 'Series 1', data: [] }];
  }

  // Best-effort: if a data range was provided but series has no data, we do not auto-read here.
  // Reading sheet cells is handled by the caller via explicit tool steps.
  // We still keep the parsed info to help debugging.
  if (option.dataset_range && !option.__parsed_dataset_range) {
    option.__parsed_dataset_range = parseRange(option.dataset_range);
  }

  return option;
}
