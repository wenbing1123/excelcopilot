// Tool definitions exposed to the LLM (OpenAI-compatible `tools` schema).
// We keep the schema simple and provider-friendly.

export const SHEET_TOOL_NAMES = {
  ADD_SHEET: 'sheet_add_sheet',
  SET_RANGE_VALUES: 'sheet_set_range_values',
  FORMAT_RANGE: 'sheet_format_range',
  GET_RANGE_VALUES: 'sheet_get_range_values',
};

export function getSheetTools() {
  return [
    {
      type: 'function',
      function: {
        name: SHEET_TOOL_NAMES.ADD_SHEET,
        description: 'Add a new worksheet (sheet tab) to the workbook.',
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
      function: {
        name: SHEET_TOOL_NAMES.SET_RANGE_VALUES,
        description:
          'Write a 2D array of values into a rectangular A1 range. You can either provide `range` (e.g. "A1:E6") or provide `startCell` (e.g. "C5") and it will auto-expand to fit the values.',
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
  ];
}
