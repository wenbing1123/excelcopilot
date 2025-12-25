// Tool definitions exposed to the LLM (OpenAI-compatible `tools` schema).
// We keep the schema simple and provider-friendly.

export const SHEET_TOOL_NAMES = {
  // ...existing code...
  ADD_SHEET: 'sheet_add_sheet',
  SET_RANGE_VALUES: 'sheet_set_range_values',
  FORMAT_RANGE: 'sheet_format_range',
  GET_RANGE_VALUES: 'sheet_get_range_values',

  // Workbook-level (SheetNext entry) tools
  WORKBOOK_GET_INFO: 'workbook_get_info',
  WORKBOOK_ADD_SHEET: 'workbook_add_sheet',
  WORKBOOK_DEL_SHEET: 'workbook_del_sheet',
  WORKBOOK_GET_SHEET_BY_NAME: 'workbook_get_sheet_by_name',
  WORKBOOK_GET_VISIBLE_SHEET_BY_INDEX: 'workbook_get_visible_sheet_by_index',
  WORKBOOK_RERENDER: 'workbook_rerender',
  WORKBOOK_GET_DATA: 'workbook_get_data',
  WORKBOOK_SET_DATA: 'workbook_set_data',
  WORKBOOK_IMPORT_FROM_URL: 'workbook_import_from_url',
  WORKBOOK_EXPORT: 'workbook_export',

  // Sheet-level (Sheet class) tools
  SHEET_GET_INFO: 'sheet_get_info',
  SHEET_SHOW_ALL_HID_ROWS: 'sheet_show_all_hid_rows',
  SHEET_SHOW_ALL_HID_COLS: 'sheet_show_all_hid_cols',
  SHEET_ADD_ROWS: 'sheet_add_rows',
  SHEET_ADD_COLS: 'sheet_add_cols',
  SHEET_DEL_ROWS: 'sheet_del_rows',
  SHEET_DEL_COLS: 'sheet_del_cols',
  SHEET_MERGE_CELLS: 'sheet_merge_cells',
  SHEET_UNMERGE_CELLS: 'sheet_unmerge_cells',
  SHEET_RANGE_SORT: 'sheet_range_sort',
  SHEET_INSERT_TABLE: 'sheet_insert_table',
  SHEET_ADD_DRAWING: 'sheet_add_drawing',
  SHEET_GET_DRAWINGS_BY_CELL: 'sheet_get_drawings_by_cell',
  SHEET_REMOVE_DRAWING: 'sheet_remove_drawing',

  // Cell-level (Cell class) tools
  CELL_GET: 'cell_get',
  CELL_SET_EDIT_VAL: 'cell_set_edit_val',
  CELL_SET_FONT: 'cell_set_font',
  CELL_SET_ALIGNMENT: 'cell_set_alignment',
  CELL_SET_BORDER: 'cell_set_border',
  CELL_SET_FILL: 'cell_set_fill',
  CELL_SET_NUM_FMT: 'cell_set_num_fmt',
  CELL_SET_HYPERLINK: 'cell_set_hyperlink',
  CELL_SET_DATA_VALIDATION: 'cell_set_data_validation',

  // Row-level (Row class) tools
  ROW_GET: 'row_get',
  ROW_SET_HEIGHT: 'row_set_height',
  ROW_SET_HIDDEN: 'row_set_hidden',
  ROW_SET_NUM_FMT: 'row_set_num_fmt',
  ROW_SET_FONT: 'row_set_font',
  ROW_SET_ALIGNMENT: 'row_set_alignment',
  ROW_SET_BORDER: 'row_set_border',
  ROW_SET_FILL: 'row_set_fill',
  ROW_GET_CELL: 'row_get_cell',

  // Drawing-level (Drawing class) tools
  DRAWING_GET: 'drawing_get',
  DRAWING_UPDATE: 'drawing_update',
  DRAWING_UPD_INDEX: 'drawing_upd_index',

  // Layout-level (SN.Layout) tools
  LAYOUT_GET: 'layout_get',
  LAYOUT_SET: 'layout_set',

  // Utils-level (SN.Utils) tools
  UTILS_NUM_TO_CHAR: 'utils_num_to_char',
  UTILS_CHAR_TO_NUM: 'utils_char_to_num',
  UTILS_RANGE_NUM_TO_STR: 'utils_range_num_to_str',
  UTILS_CELL_STR_TO_NUM: 'utils_cell_str_to_num',
  UTILS_CELL_NUM_TO_STR: 'utils_cell_num_to_str',
  UTILS_MSG: 'utils_msg',
  UTILS_MODAL: 'utils_modal',

  // Undo/Redo-level (SN.UndoRedo)
  HISTORY_UNDO: 'history_undo',
  HISTORY_REDO: 'history_redo',
  SHEET_CLOSE: 'sheet_close',
  SHEET_EXPORT_SHEET_CONTEXT: 'sheet_export_sheet_context',
};

export function getSheetTools() {
  return [
    {
      type: 'function',
      xCategory: 'workbook/sheet',
      function: {
        name: SHEET_TOOL_NAMES.ADD_SHEET,
        description:
          'Add a new worksheet (sheet tab) to the workbook. IMPORTANT: Do NOT create new sheets unless the user explicitly asks. For examples/demo data, always write into the current active sheet at the current selected cell anchor.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', description: 'New sheet name (unique).' },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/range',
      function: {
        name: SHEET_TOOL_NAMES.SET_RANGE_VALUES,
        description:
          'Write a 2D array of values into the active worksheet starting from the user\'s current selection (anchor) whenever possible. Prefer using `startCell` (anchor) instead of hardcoding A1. You can either provide `range` (e.g. "A1:E6") or provide `startCell` (e.g. "C5") and it will auto-expand to fit the values.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            range: { type: 'string', description: 'A1 range, e.g. "A1" or "A1:E6". Optional if startCell is provided.' },
            startCell: { type: 'string', description: 'Anchor cell like "B2". If provided, range will be computed from values size.' },
            values: {
              type: 'array',
              description: '2D array: rows -> columns. Strings/numbers/booleans/null are allowed.',
              items: {
                type: 'array',
                items: { type: ['string', 'number', 'boolean', 'null', 'object'] },
              },
            },
          },
          required: ['values'],
          anyOf: [{ required: ['range'] }, { required: ['startCell'] }],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/range',
      function: {
        name: SHEET_TOOL_NAMES.FORMAT_RANGE,
        description:
          'Apply simple formatting to a range. Only supports a small subset: bold, fill color, horizontalAlign, numberFormat. (MVP)',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            range: { type: 'string', description: 'A1 range, e.g. "A1:E1".' },
            style: {
              type: 'object',
              additionalProperties: false,
              properties: {
                bold: { type: 'boolean' },
                fill: { type: 'string', description: 'Hex color like #F2F2F2' },
                horizontalAlign: { type: 'string', enum: ['left', 'center', 'right'] },
                numberFormat: { type: 'string', description: 'Excel-like format string, e.g. "#,##0" or "¥#,##0.00"' },
              },
            },
          },
          required: ['range', 'style'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/range',
      function: {
        name: SHEET_TOOL_NAMES.GET_RANGE_VALUES,
        description: 'Read values from a rectangular range. Returns a 2D array of values.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            range: { type: 'string', description: 'A1 range, e.g. "A1:E6".' },
          },
          required: ['range'],
        },
      },
    },

    // --- Workbook-level tools (SheetNext main entry) ---
    {
      type: 'function',
      xCategory: 'workbook',
      function: {
        name: SHEET_TOOL_NAMES.WORKBOOK_GET_INFO,
        description:
          'Get core workbook info snapshot from the current SheetNext instance (workbookName, namespace, locked, activeSheet name, sheetNames).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            namespace: {
              type: 'string',
              description: 'Optional SheetNext global namespace like "SN_0". If omitted, uses the active instance passed into the tool executor.',
            },
          },
        },
      },
    },
    {
      type: 'function',
      xCategory: 'workbook',
      function: {
        name: SHEET_TOOL_NAMES.WORKBOOK_ADD_SHEET,
        description:
          'Add a new sheet to the workbook. If name is omitted, SheetNext auto-generates (Sheet1/Sheet2...). Name rules: 1-31 chars, unique, no : / \\ * ? [ ]',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', description: 'Optional new sheet name.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
        },
      },
    },
    {
      type: 'function',
      xCategory: 'workbook',
      function: {
        name: SHEET_TOOL_NAMES.WORKBOOK_DEL_SHEET,
        description: 'Delete a sheet by name. Must keep at least one visible sheet.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', description: 'Sheet name to delete.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'workbook',
      function: {
        name: SHEET_TOOL_NAMES.WORKBOOK_GET_SHEET_BY_NAME,
        description: 'Get a sheet by name (returns a small serializable snapshot; not the full Sheet object).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', description: 'Sheet name.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'workbook',
      function: {
        name: SHEET_TOOL_NAMES.WORKBOOK_GET_VISIBLE_SHEET_BY_INDEX,
        description: 'Get visible sheet by index (0-based; hidden sheets are not counted). Returns a small serializable snapshot.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            index: { type: 'number', description: 'Visible sheet index, 0-based.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['index'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'workbook',
      function: {
        name: SHEET_TOOL_NAMES.WORKBOOK_RERENDER,
        description: 'Manually trigger a canvas rerender after batch mutations (SheetNext.r()).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
        },
      },
    },
    {
      type: 'function',
      xCategory: 'workbook',
      function: {
        name: SHEET_TOOL_NAMES.WORKBOOK_GET_DATA,
        description: 'Get full workbook JSON data (for backup/persistence).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
        },
      },
    },
    {
      type: 'function',
      xCategory: 'workbook',
      function: {
        name: SHEET_TOOL_NAMES.WORKBOOK_SET_DATA,
        description: 'Load full workbook JSON data, replacing current workbook (SheetNext.setData()).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            data: { type: 'object', description: 'Workbook JSON data.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['data'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'workbook',
      function: {
        name: SHEET_TOOL_NAMES.WORKBOOK_IMPORT_FROM_URL,
        description: 'Import an .xlsx workbook from a URL into the current SheetNext instance (importFromUrl).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            url: { type: 'string', description: 'XLSX URL.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['url'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'workbook',
      function: {
        name: SHEET_TOOL_NAMES.WORKBOOK_EXPORT,
        description:
          'Export workbook as XLSX/CSV/JSON. NOTE: In browser builds SheetNext export usually triggers a download; this tool returns a status only.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['XLSX', 'CSV', 'JSON'], description: 'Export type.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['type'],
        },
      },
    },

    // --- Sheet-level tools (Sheet class) ---
    {
      type: 'function',
      xCategory: 'sheet',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_GET_INFO,
        description:
          'Get a serializable snapshot of a worksheet (Sheet). Includes core properties like name, hidden, rowCount, colCount, defaultRowHeight/ColWidth, grid/header visibility, activeCell, activeAreas, merges, splits.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/rows-cols',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_SHOW_ALL_HID_ROWS,
        description: 'Show all hidden rows in the target sheet.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/rows-cols',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_SHOW_ALL_HID_COLS,
        description: 'Show all hidden cols in the target sheet.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/rows-cols',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_ADD_ROWS,
        description: 'Insert rows at startR (0-based) with length num.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            startR: { type: 'number', description: 'Start row index (0-based).' },
            num: { type: 'number', description: 'Number of rows to insert.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['startR', 'num'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/rows-cols',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_ADD_COLS,
        description: 'Insert cols at startC (0-based) with length num.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            startC: { type: 'number', description: 'Start col index (0-based).' },
            num: { type: 'number', description: 'Number of cols to insert.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['startC', 'num'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/rows-cols',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_DEL_ROWS,
        description: 'Delete rows from startR (0-based) with length num.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            startR: { type: 'number', description: 'Start row index (0-based).' },
            num: { type: 'number', description: 'Number of rows to delete.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['startR', 'num'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/rows-cols',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_DEL_COLS,
        description: 'Delete cols from startC (0-based) with length num.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            startC: { type: 'number', description: 'Start col index (0-based).' },
            num: { type: 'number', description: 'Number of cols to delete.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['startC', 'num'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/merge',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_MERGE_CELLS,
        description: 'Merge cells in a range. rangeRef can be an A1 range string like "A1:C3".',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            range: { type: 'string', description: 'Range reference like "A1:C3".' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['range'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/merge',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_UNMERGE_CELLS,
        description: 'Unmerge cells by providing any cell reference within the merged region, e.g. "A1".',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            cell: { type: 'string', description: 'Cell reference like "A1".' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['cell'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/sort',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_RANGE_SORT,
        description:
          'Sort a range using Sheet.rangeSort(sortItems, rangeRef). sortItems supports column/row/custom with order asc/desc/value.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            sortItems: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  type: { type: 'string', enum: ['column', 'row', 'custom'] },
                  order: { type: 'string', enum: ['asc', 'desc', 'value'] },
                  index: { type: 'string', description: 'Column label (A,B,...) or row label (1,2,...).' },
                  sortData: { type: 'array', description: 'When order="value", custom order array.' },
                },
                required: ['type', 'index'],
              },
            },
            range: { type: 'string', description: 'Optional range like "A2:D20". If omitted, SheetNext decides (often whole used range).' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['sortItems'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/insert',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_INSERT_TABLE,
        description:
          'Insert a rectangular 2D table into a sheet at startCell (A1 string). Supports simple cell configs (v,w,h,b,s,fg,a,c,mr,mb) and an optional globalConfig (border,a,w,h,fg,c).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            startCell: { type: 'string', description: 'Start cell reference like "A1".' },
            data: {
              type: 'array',
              description: '2D array (must be rectangular). Each item can be string/number or a config object.',
              items: {
                type: 'array',
                items: { type: ['string', 'number', 'object', 'null', 'boolean'] },
              },
            },
            globalConfig: { type: 'object', description: 'Optional global insertion config.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['startCell', 'data'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/drawing',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_ADD_DRAWING,
        description: 'Add a drawing (chart/image/etc) to the sheet: Sheet.addDrawing(config).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            config: { type: 'object', description: 'Drawing config object.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['config'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/drawing',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_GET_DRAWINGS_BY_CELL,
        description: 'Get drawings at a specific cell: Sheet.getDrawingsByCell(cellRef).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            cell: { type: 'string', description: 'Cell ref like "B2".' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['cell'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/drawing',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_REMOVE_DRAWING,
        description: 'Remove a drawing by id: Sheet.removeDrawing(id).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            id: { type: 'string', description: 'Drawing id.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['id'],
        },
      },
    },

    // --- Cell-level tools (Cell class) ---
    {
      type: 'function',
      xCategory: 'cell/read',
      function: {
        name: SHEET_TOOL_NAMES.CELL_GET,
        description:
          'Get a serializable snapshot of a single cell (editVal/showVal/calcVal/type/formula/merge/master) plus key style/feature fields (font/alignment/border/fill/numFmt/hyperlink/dataValidation/validData).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            cell: { type: 'string', description: 'Cell reference like "A1".' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['cell'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'cell/value',
      function: {
        name: SHEET_TOOL_NAMES.CELL_SET_EDIT_VAL,
        description: 'Set cell.editVal (value or formula) by A1 reference. Supports text/number/boolean/null.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            cell: { type: 'string', description: 'Cell reference like "A1".' },
            editVal: { type: ['string', 'number', 'boolean', 'null', 'object'], description: 'Value or formula string.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['cell', 'editVal'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'cell/style',
      function: {
        name: SHEET_TOOL_NAMES.CELL_SET_FONT,
        description: 'Set cell.font object (name/size/bold/italic/underline/strike/color/etc).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            cell: { type: 'string', description: 'Cell reference like "A1".' },
            font: { type: 'object', description: 'Font config object.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['cell', 'font'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'cell/style',
      function: {
        name: SHEET_TOOL_NAMES.CELL_SET_ALIGNMENT,
        description: 'Set cell.alignment object (horizontal/vertical/wrapText/indent).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            cell: { type: 'string', description: 'Cell reference like "A1".' },
            alignment: { type: 'object', description: 'Alignment config object.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['cell', 'alignment'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'cell/style',
      function: {
        name: SHEET_TOOL_NAMES.CELL_SET_BORDER,
        description: 'Set cell.border object (top/right/bottom/left/diagonal).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            cell: { type: 'string', description: 'Cell reference like "A1".' },
            border: { type: 'object', description: 'Border config object; use {} to clear.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['cell', 'border'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'cell/style',
      function: {
        name: SHEET_TOOL_NAMES.CELL_SET_FILL,
        description: 'Set cell.fill object (pattern/gradient). Use {} to clear.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            cell: { type: 'string', description: 'Cell reference like "A1".' },
            fill: { type: 'object', description: 'Fill config object; use {} to clear.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['cell', 'fill'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'cell/style',
      function: {
        name: SHEET_TOOL_NAMES.CELL_SET_NUM_FMT,
        description: 'Set cell.numFmt to an Excel-like number format string. Use null to clear.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            cell: { type: 'string', description: 'Cell reference like "A1".' },
            numFmt: { type: ['string', 'null'], description: 'Number format string or null.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['cell', 'numFmt'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'cell/feature',
      function: {
        name: SHEET_TOOL_NAMES.CELL_SET_HYPERLINK,
        description: 'Set cell.hyperlink ({target|location|tooltip}). Use {} to remove.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            cell: { type: 'string', description: 'Cell reference like "A1".' },
            hyperlink: { type: 'object', description: 'Hyperlink object; use {} to clear.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['cell', 'hyperlink'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'cell/feature',
      function: {
        name: SHEET_TOOL_NAMES.CELL_SET_DATA_VALIDATION,
        description: 'Set cell.dataValidation object. Use {} to remove.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            cell: { type: 'string', description: 'Cell reference like "A1".' },
            dataValidation: { type: 'object', description: 'Data validation config; use {} to clear.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['cell', 'dataValidation'],
        },
      },
    },

    // --- Row-level tools (Row class) ---
    {
      type: 'function',
      xCategory: 'row/read',
      function: {
        name: SHEET_TOOL_NAMES.ROW_GET,
        description:
          'Get a serializable snapshot of a row (height/hidden/rIndex plus row-level style fields like numFmt/font/alignment/border/fill).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            row: { type: 'number', description: 'Row index (0-based).' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['row'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'row/style',
      function: {
        name: SHEET_TOOL_NAMES.ROW_SET_HEIGHT,
        description: 'Set row.height (pixels).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string' },
            row: { type: 'number', description: 'Row index (0-based).' },
            height: { type: 'number', description: 'Row height in pixels.' },
            namespace: { type: 'string' },
          },
          required: ['row', 'height'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'row/style',
      function: {
        name: SHEET_TOOL_NAMES.ROW_SET_HIDDEN,
        description: 'Set row.hidden (true/false).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string' },
            row: { type: 'number', description: 'Row index (0-based).' },
            hidden: { type: 'boolean', description: 'Whether the row is hidden.' },
            namespace: { type: 'string' },
          },
          required: ['row', 'hidden'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'row/style',
      function: {
        name: SHEET_TOOL_NAMES.ROW_SET_NUM_FMT,
        description: 'Set row.numFmt (number format string). Use null to clear.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string' },
            row: { type: 'number', description: 'Row index (0-based).' },
            numFmt: { type: ['string', 'null'], description: 'Number format or null.' },
            namespace: { type: 'string' },
          },
          required: ['row', 'numFmt'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'row/style',
      function: {
        name: SHEET_TOOL_NAMES.ROW_SET_FONT,
        description: 'Set row.font object. (Applies row-level font style.)',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string' },
            row: { type: 'number', description: 'Row index (0-based).' },
            font: { type: 'object', description: 'Font config object.' },
            namespace: { type: 'string' },
          },
          required: ['row', 'font'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'row/style',
      function: {
        name: SHEET_TOOL_NAMES.ROW_SET_ALIGNMENT,
        description: 'Set row.alignment object. (Applies row-level alignment style.)',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string' },
            row: { type: 'number', description: 'Row index (0-based).' },
            alignment: { type: 'object', description: 'Alignment config object.' },
            namespace: { type: 'string' },
          },
          required: ['row', 'alignment'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'row/style',
      function: {
        name: SHEET_TOOL_NAMES.ROW_SET_BORDER,
        description: 'Set row.border object. Use {} to clear.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string' },
            row: { type: 'number', description: 'Row index (0-based).' },
            border: { type: 'object', description: 'Border config object.' },
            namespace: { type: 'string' },
          },
          required: ['row', 'border'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'row/style',
      function: {
        name: SHEET_TOOL_NAMES.ROW_SET_FILL,
        description: 'Set row.fill object. Use {} to clear.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string' },
            row: { type: 'number', description: 'Row index (0-based).' },
            fill: { type: 'object', description: 'Fill config object.' },
            namespace: { type: 'string' },
          },
          required: ['row', 'fill'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'row/read',
      function: {
        name: SHEET_TOOL_NAMES.ROW_GET_CELL,
        description: 'Get a cell snapshot via Row.getCell(c). Useful for row-based logic.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string' },
            row: { type: 'number', description: 'Row index (0-based).' },
            col: { type: 'number', description: 'Column index (0-based).' },
            namespace: { type: 'string' },
          },
          required: ['row', 'col'],
        },
      },
    },

    // --- Drawing-level tools (Drawing class) ---
    {
      type: 'function',
      xCategory: 'drawing/read',
      function: {
        name: SHEET_TOOL_NAMES.DRAWING_GET,
        description: 'Get a serializable snapshot of a drawing by id on a sheet.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            id: { type: 'string', description: 'Drawing id.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'drawing/write',
      function: {
        name: SHEET_TOOL_NAMES.DRAWING_UPDATE,
        description:
          'Update drawing properties by id (best-effort shallow merge). You can update startCell/offsetX/offsetY/width/height/option/anchorType/updRender/shapeText/shapeStyle/imageBase64.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            id: { type: 'string', description: 'Drawing id.' },
            patch: { type: 'object', description: 'Partial drawing fields to set.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['id', 'patch'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'drawing/layer',
      function: {
        name: SHEET_TOOL_NAMES.DRAWING_UPD_INDEX,
        description: 'Update drawing z-index / layer order. Calls drawing.updIndex(direction). direction: up|down|top|bottom',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            id: { type: 'string', description: 'Drawing id.' },
            direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'], description: 'Layer move direction.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['id', 'direction'],
        },
      },
    },

    // --- Layout-level tools (SN.Layout) ---
    {
      type: 'function',
      xCategory: 'layout/read',
      function: {
        name: SHEET_TOOL_NAMES.LAYOUT_GET,
        description: 'Get current layout visibility state from SheetNext.Layout (menu/toolbar/formula/sheet tabs/AI chat).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
        },
      },
    },
    {
      type: 'function',
      xCategory: 'layout/write',
      function: {
        name: SHEET_TOOL_NAMES.LAYOUT_SET,
        description:
          'Update layout visibility flags on SheetNext.Layout. Any provided field will be set. Fields: showMenuBar/showToolbar/showFormulaBar/showSheetTabBar/showAIChat/showAIChatWindow.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
            showMenuBar: { type: 'boolean' },
            showToolbar: { type: 'boolean' },
            showFormulaBar: { type: 'boolean' },
            showSheetTabBar: { type: 'boolean' },
            showAIChat: { type: 'boolean' },
            showAIChatWindow: { type: 'boolean' },
          },
        },
      },
    },

    // --- Utils-level tools (SN.Utils) ---
    {
      type: 'function',
      xCategory: 'utils/convert',
      function: {
        name: SHEET_TOOL_NAMES.UTILS_NUM_TO_CHAR,
        description: 'Convert 0-based column number to column letters. Example: 0->A, 25->Z, 26->AA.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            num: { type: 'number', description: '0-based column index.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['num'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'utils/convert',
      function: {
        name: SHEET_TOOL_NAMES.UTILS_CHAR_TO_NUM,
        description: 'Convert column letters to 0-based column number. Example: A->0, Z->25, AA->26.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            char: { type: 'string', description: 'Column letters like A, Z, AA.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['char'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'utils/convert',
      function: {
        name: SHEET_TOOL_NAMES.UTILS_RANGE_NUM_TO_STR,
        description: 'Convert RangeNum object to A1 range string. Example: {s:{r:0,c:0},e:{r:2,c:2}} -> "A1:C3".',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            rangeNum: { type: 'object', description: 'RangeNum object: {s:{r,c}, e:{r,c}}' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['rangeNum'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'utils/convert',
      function: {
        name: SHEET_TOOL_NAMES.UTILS_CELL_STR_TO_NUM,
        description: 'Convert cell string like "A1" to CellNum {r:0,c:0}.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cellStr: { type: 'string', description: 'Cell reference like A1.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['cellStr'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'utils/convert',
      function: {
        name: SHEET_TOOL_NAMES.UTILS_CELL_NUM_TO_STR,
        description: 'Convert CellNum {r:0,c:0} to cell string like "A1".',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cellNum: { type: 'object', description: 'CellNum object: {r:number,c:number} (0-based).' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['cellNum'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'utils/ui',
      function: {
        name: SHEET_TOOL_NAMES.UTILS_MSG,
        description: 'Show a temporary message toast in SheetNext UI (auto disappears).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            message: { type: 'string', description: 'Message text.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['message'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'utils/ui',
      function: {
        name: SHEET_TOOL_NAMES.UTILS_MODAL,
        description:
          'Show a modal dialog in SheetNext UI. Resolves on confirm, rejects on cancel. This tool awaits the result and returns ok:true on confirm, ok:false on cancel.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            options: {
              type: 'object',
              description:
                'Modal options, e.g. {title, content, confirmText, cancelText}. Additional fields are passed through.',
            },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['options'],
        },
      },
    },

    // --- Undo/Redo tools (SN.UndoRedo) ---
    {
      type: 'function',
      xCategory: 'history',
      function: {
        name: SHEET_TOOL_NAMES.HISTORY_UNDO,
        description: 'Undo the last operation (SN.UndoRedo.undo()).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
        },
      },
    },
    {
      type: 'function',
      xCategory: 'history',
      function: {
        name: SHEET_TOOL_NAMES.HISTORY_REDO,
        description: 'Redo the last undone operation (SN.UndoRedo.redo()).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
        },
      },
    },
    {
      type: 'function',
      xCategory: 'workbook/sheet',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_CLOSE,
        description: 'Close (delete) a sheet by name. Must keep at least one visible sheet. Optionally ask for confirmation via SN.Utils.modal.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', description: 'Sheet name to close.' },
            askConfirm: { type: 'boolean', description: 'If true, show a confirm modal before deleting. Default false.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      xCategory: 'sheet/read',
      function: {
        name: SHEET_TOOL_NAMES.SHEET_EXPORT_SHEET_CONTEXT,
        description:
          'Export the whole current sheet as LLM context. Returns a compact JSON including sheet name, row/col counts, activeCell, and a bounded 2D grid of cell snapshots (value + basic style). Use for editing tasks. NOTE: Output is size-limited (maxRows/maxCols) to avoid huge prompts.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sheet: { type: 'string', description: 'Target sheet name. Optional; uses active sheet if omitted.' },
            maxRows: { type: 'number', description: 'Max rows to export starting from row 0. Default 50.' },
            maxCols: { type: 'number', description: 'Max cols to export starting from col 0. Default 26.' },
            withStyles: { type: 'boolean', description: 'Include basic style fields (font/alignment/border/fill/numFmt). Default true.' },
            namespace: { type: 'string', description: 'Optional SheetNext namespace like "SN_0".' },
          },
        },
      },
    },
  ];
}
