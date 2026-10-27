import ExcelJS from "exceljs";
import { ApiError } from "./ApiError";
import { matrixToSheetRows, parseCsv, type ParsedSheetRow } from "./productImportParse";

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    const record = value as unknown as Record<string, unknown>;
    if (typeof record.text === "string") return record.text.trim();
    if (record.result != null) return cellToString(record.result as ExcelJS.CellValue);
    if (Array.isArray(record.richText)) {
      return record.richText
        .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text || "") : ""))
        .join("")
        .trim();
    }
    if (typeof record.hyperlink === "string" && typeof record.text === "string") {
      return record.text.trim();
    }
  }
  return String(value).trim();
}

function extensionOf(filename: string): string {
  const ext = filename.trim().toLowerCase();
  const index = ext.lastIndexOf(".");
  return index >= 0 ? ext.slice(index) : "";
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Uint8Array.from(buffer) as unknown as ExcelJS.Buffer);
  } catch {
    throw new ApiError(400, "The Excel file could not be read. Save it as .xlsx and try again");
  }

  const sheet = workbook.worksheets.find((item) => item && item.rowCount > 0) || workbook.worksheets[0];
  if (!sheet) {
    throw new ApiError(400, "The Excel workbook has no sheets");
  }

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    const cells = values.map((value) => cellToString(value as ExcelJS.CellValue));
    while (matrix.length < rowNumber) {
      matrix.push([]);
    }
    matrix[rowNumber - 1] = cells;
  });

  return matrix.filter((row, index) => index === 0 || row.some((cell) => cell.trim()));
}

export async function parseImportSpreadsheet(file: Express.Multer.File): Promise<ParsedSheetRow[]> {
  if (!file?.buffer?.length) {
    throw new ApiError(400, "The spreadsheet file is empty");
  }

  const ext = extensionOf(file.originalname || "");
  const mime = (file.mimetype || "").toLowerCase();
  const isCsv =
    ext === ".csv" || mime.includes("csv") || mime === "text/plain" || mime === "application/csv";
  const isXlsx =
    ext === ".xlsx" ||
    mime.includes("spreadsheetml") ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  if (ext === ".xls") {
    throw new ApiError(400, "Legacy .xls files are not supported. Save the sheet as CSV or .xlsx");
  }

  let matrix: string[][];
  try {
    if (isXlsx) {
      matrix = await parseXlsx(file.buffer);
    } else if (isCsv || ext === "") {
      matrix = parseCsv(file.buffer.toString("utf8"));
    } else {
      throw new ApiError(400, "Upload a .csv or .xlsx spreadsheet in the sheet field");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, error instanceof Error ? error.message : "Unable to parse the spreadsheet");
  }

  try {
    return matrixToSheetRows(matrix);
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : "Unable to parse the spreadsheet");
  }
}
