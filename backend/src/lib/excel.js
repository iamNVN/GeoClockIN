// Excel (.xlsx) export and import helpers.
import ExcelJS from 'exceljs';
import { HttpError } from '../errors.js';
import { isValidDate, parseClock } from './time.js';

const BRAND = 'FF0F9D69';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function newWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GeoClockIN';
  workbook.created = new Date();
  return workbook;
}

/**
 * Adds a sheet with a branded header row, frozen header, filters and widths.
 * columns: [{ header, key, width }]
 */
export function addTable(workbook, name, columns, rows) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map(({ header, key, width = 16 }) => ({ header, key, width }));
  for (const row of rows) sheet.addRow(row);
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;
  if (rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return sheet;
}

/** Adds a two-column "Label | Value" sheet (report summaries, filters used). */
export function addKeyValueSheet(workbook, name, pairs) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = [{ width: 28 }, { width: 40 }];
  for (const [label, value] of pairs) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  return sheet;
}

export async function sendWorkbook(res, workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', XLSX_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}

const normalizeHeader = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Plain text of a cell value (rich text, hyperlinks and formulas included). */
export function cellText(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('');
    if ('text' in value) return String(value.text);
    if ('result' in value) return cellText(value.result);
  }
  return String(value).trim();
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** 'YYYY-MM-DD' from a date cell, an Excel serial number or text (YYYY-MM-DD or DD/MM/YYYY). */
export function cellDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return new Date(EXCEL_EPOCH + Math.round(value) * 86_400_000).toISOString().slice(0, 10);
  const text = cellText(value);
  if (isValidDate(text)) return text;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (dmy) {
    const iso = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    if (isValidDate(iso)) return iso;
  }
  return null;
}

/** Minutes past midnight from a time cell, a fraction-of-day number or text ('09:05', '6:00 PM'). */
export function cellMinutes(value) {
  if (value instanceof Date) return value.getUTCHours() * 60 + value.getUTCMinutes();
  if (typeof value === 'number' && value >= 0) return Math.round((value % 1) * 1440) % 1440;
  const text = cellText(value);
  return text ? parseClock(text) : null;
}

/**
 * Reads the first sheet of an uploaded workbook into objects. `aliases` maps
 * normalized header text ("employeeid") to field names ("id"). Each object
 * carries its spreadsheet row number as `_row`.
 */
export async function readUploadedSheet(buffer, aliases) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new HttpError(400, 'INVALID_FILE', 'Choose an Excel (.xlsx) file to import.');
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new HttpError(400, 'INVALID_FILE', 'This file could not be read. Upload an Excel (.xlsx) file.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new HttpError(400, 'INVALID_FILE', 'The workbook has no sheets.');

  const fields = [];
  sheet.getRow(1).eachCell((cell, column) => {
    fields[column] = aliases[normalizeHeader(cellText(cell.value))];
  });
  if (!fields.some(Boolean)) {
    throw new HttpError(400, 'INVALID_FILE', 'The first row must contain column headers. Download the template to see them.');
  }

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const item = { _row: rowNumber };
    let hasValue = false;
    row.eachCell((cell, column) => {
      const field = fields[column];
      if (!field) return;
      item[field] = cell.value;
      if (cellText(cell.value) !== '') hasValue = true;
    });
    if (hasValue) rows.push(item);
  });
  return rows;
}
