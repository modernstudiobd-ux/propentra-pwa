import * as XLSX from 'xlsx';

export interface ParsedSheet {
  name: string;
  headers: string[]; // detected header row, blank cells given a "Column N" placeholder
  rows: any[][]; // data rows only, fully blank rows dropped
}

export interface ParsedWorkbook {
  fileName: string;
  sheets: ParsedSheet[];
}

const SUPPORTED_EXTENSIONS = ['xlsx', 'xls', 'csv', 'tsv'];

/**
 * Some exports put a title or a blank row above the real header row. This
 * scans the first 10 rows and picks the first one that looks like a header
 * (most cells filled in), rather than always assuming row 0.
 */
function findHeaderRowIndex(matrix: any[][]): number {
  const scanLimit = Math.min(matrix.length, 10);
  for (let i = 0; i < scanLimit; i++) {
    const row = matrix[i] || [];
    const filled = row.filter((c) => c !== '' && c !== null && c !== undefined).length;
    if (row.length > 0 && filled >= Math.max(2, Math.ceil(row.length * 0.5))) return i;
  }
  return 0;
}

export async function parseImportFile(file: File): Promise<ParsedWorkbook> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error('Unsupported file type. Please upload a .xlsx, .xls, .csv, or .tsv file.');
  }

  let workbook: XLSX.WorkBook;
  if (ext === 'csv' || ext === 'tsv') {
    const text = await file.text();
    workbook = XLSX.read(text, { type: 'string', FS: ext === 'tsv' ? '\t' : ',', cellDates: true, raw: true });
  } else {
    const buf = await file.arrayBuffer();
    workbook = XLSX.read(buf, { type: 'array', cellDates: true, raw: true });
  }

  if (!workbook.SheetNames.length) {
    throw new Error('This file has no sheets/tabs Propentra can read.');
  }

  const sheets: ParsedSheet[] = workbook.SheetNames.map((name) => {
    const ws = workbook.Sheets[name];
    const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const headerRowIndex = findHeaderRowIndex(matrix);
    const headerRow = matrix[headerRowIndex] || [];
    const headers = headerRow.map((h, i) => {
      const s = h === '' || h === null || h === undefined ? '' : String(h).trim();
      return s || `Column ${i + 1}`;
    });
    const rows = matrix
      .slice(headerRowIndex + 1)
      .filter((r) => Array.isArray(r) && r.some((c) => c !== '' && c !== null && c !== undefined));
    return { name, headers, rows };
  });

  return { fileName: file.name, sheets };
}
