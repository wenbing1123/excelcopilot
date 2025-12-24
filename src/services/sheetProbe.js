import { executeSheetToolCall } from './sheetExecutor.js';
import { colToLetters } from './sheetExecutor.js';

/**
 * Minimal runtime probe to verify that the SheetNext instance being passed in is
 * the one driving the visible grid.
 *
 * Usage (DevTools):
 *   import('/src/services/sheetProbe.js').then(m => m.probeSheet(window.__sn))
 */
export async function probeSheet(sheet) {
  const results = [];

  const dump = (label, obj) => {
    try {
      return {
        label,
        keys: Object.keys(obj || {}).slice(0, 60),
        proto: obj ? Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).slice(0, 80) : [],
      };
    } catch {
      return { label, keys: [], proto: [] };
    }
  };

  results.push(dump('sheet', sheet));
  results.push(dump('sheet.api', sheet?.api));

  // Prefer current active sheet + active cell as the write/read anchor.
  const activeSheet = sheet?.activeSheet || sheet?.api?.activeSheet;
  const activeSheetName = activeSheet?.name || null;
  const ac = activeSheet?.activeCell;
  let addr = 'A1';
  if (ac && Number.isFinite(ac.r) && Number.isFinite(ac.c)) {
    addr = `${colToLetters(ac.c + 1)}${ac.r + 1}`;
  }

  results.push({ label: 'active', sheet: activeSheetName, activeCell: ac, addr });
  const val = `probe-${Date.now()}`;

  const setCall = {
    id: 'probe-set',
    type: 'function',
    function: {
      name: 'sheet_set_range_values',
      arguments: JSON.stringify({ sheet: activeSheetName || undefined, startCell: addr, values: [[val]] }),
    },
  };

  const resSet = await executeSheetToolCall(sheet, setCall);
  results.push({ label: 'set', res: resSet });

  const getCall = {
    id: 'probe-get',
    type: 'function',
    function: {
      name: 'sheet_get_range_values',
      arguments: JSON.stringify({ sheet: activeSheetName || undefined, range: addr }),
    },
  };

  const resGet = await executeSheetToolCall(sheet, getCall);
  results.push({ label: 'get', res: resGet });

  // Optional: verify cross-sheet targeting by name (useful when the model keeps writing to a different sheet)
  const otherSheetName = activeSheetName === '销售统计' ? 'Sheet1' : '销售统计';
  const resCrossSet = await executeSheetToolCall(sheet, {
    id: 'probe-cross-set',
    type: 'function',
    function: {
      name: 'sheet_set_range_values',
      arguments: JSON.stringify({ sheet: otherSheetName, startCell: 'A1', values: [[`cross-${val}`]] }),
    },
  });
  results.push({ label: 'cross-set', sheet: otherSheetName, res: resCrossSet });

  return results;
}
