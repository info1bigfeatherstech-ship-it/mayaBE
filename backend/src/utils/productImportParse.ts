export const IMPORT_LIMITS = {
  maxRows: 2000,
  maxFamilies: 100,
  maxVariantsPerFamily: 50,
  maxZipBytes: 80 * 1024 * 1024,
  maxUncompressedBytes: 200 * 1024 * 1024,
  maxZipFiles: 800,
  maxImageBytes: 8 * 1024 * 1024,
  maxImagesPerFolder: 5,
  maxSubVariants: 20,
} as const;

export type SheetCellMap = Record<string, string>;

export type ParsedSheetRow = {
  row: number;
  cells: SheetCellMap;
};

export type ParentVariantCode = {
  family: string;
  serial: number;
  code: string;
};

export type AttributePair = {
  key: string;
  value: string;
};

export type ParsedAttributes = {
  pairs: AttributePair[];
  spreading?: { key: string; values: string[] };
};

const HEADER_ALIASES: Record<string, keyof SheetCellMap | "productCode"> = {
  productcode: "productCode",
  name: "name",
  title: "title",
  description: "description",
  desc: "description",
  categorypath: "categoryPath",
  category: "categoryPath",
  websitecategory: "categoryPath",
  moq: "moq",
  fabric: "fabric",
  fabriccomposition: "fabricComposition",
  gsm: "gsm",
  pattern: "pattern",
  fobport: "fobPort",
  gender: "gender",
  producttype: "productType",
  productstatus: "productStatus",
  quantityunit: "quantityUnit",
  color: "color",
  availablecolors: "availableColors",
  sizerange: "sizeRange",
  attributes: "attributes",
  attrs: "attributes",
  variantattributes: "attributes",
  purchasecode: "purchaseCode",
  collection: "collection",
  season: "season",
  agegroup: "ageGroup",
  marketsuitability: "marketSuitability",
  fobprice: "fobPrice",
  saleprice: "salePrice",
  factorypriceexw: "factoryPriceEXW",
  readystockavailability: "readyStockAvailability",
  readystockquantity: "readyStockQuantity",
  readystockquantityunit: "readyStockQuantityUnit",
};

export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function mapHeader(value: string): string | null {
  const normalized = normalizeHeader(value);
  if (!normalized) return null;
  return HEADER_ALIASES[normalized] || null;
}

export function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  return trimmed;
}

export function splitUnquoted(input: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '"') {
      if (inQuotes && input[i + 1] === '"') {
        current += '""';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }

  if (inQuotes) {
    throw new Error("Unclosed quote in spreadsheet value");
  }

  out.push(current);
  return out;
}

export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  const pushRow = () => {
    if (row.some((cell) => cell.trim()) || current.trim()) {
      row.push(current);
      rows.push(row);
    }
    row = [];
    current = "";
  };

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"') {
      if (inQuotes && source[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }
    if (ch === "\n" && !inQuotes) {
      pushRow();
      continue;
    }
    current += ch;
  }

  if (inQuotes) {
    throw new Error("The CSV file has an unclosed quote");
  }

  if (current.length || row.length) {
    row.push(current);
    if (row.some((cell) => cell.trim())) {
      rows.push(row);
    }
  }

  return rows;
}

export function matrixToSheetRows(matrix: string[][]): ParsedSheetRow[] {
  if (!matrix.length) {
    throw new Error("The spreadsheet is empty");
  }

  const headerCells = matrix[0].map((cell) => cell.trim());
  if (!headerCells.some(Boolean)) {
    throw new Error("The spreadsheet is missing a header row");
  }

  const mapped = headerCells.map((cell) => mapHeader(cell));
  if (!mapped.includes("productCode")) {
    throw new Error("The spreadsheet must include a productCode column (example: TST-901-1)");
  }

  const seen = new Set<string>();
  for (const key of mapped) {
    if (!key) continue;
    if (seen.has(key)) {
      throw new Error(`Duplicate column "${key}"`);
    }
    seen.add(key);
  }

  if (matrix.length - 1 > IMPORT_LIMITS.maxRows) {
    throw new Error(`A bulk import can have a maximum of ${IMPORT_LIMITS.maxRows} data rows`);
  }

  const rows: ParsedSheetRow[] = [];
  for (let i = 1; i < matrix.length; i += 1) {
    const line = matrix[i] || [];
    if (!line.some((cell) => String(cell || "").trim())) continue;
    const cells: SheetCellMap = {};
    mapped.forEach((key, index) => {
      if (!key) return;
      cells[key] = String(line[index] ?? "").trim();
    });
    if (!Object.values(cells).some(Boolean)) continue;
    rows.push({ row: i + 1, cells });
  }

  if (!rows.length) {
    throw new Error("No product rows found in the spreadsheet");
  }

  return rows;
}

export function parseParentVariantCode(raw: string): ParentVariantCode {
  const code = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!code) {
    throw new Error("Product code is required");
  }
  if (code.length > 80) {
    throw new Error("Product code is too long");
  }
  const match = code.match(/^(.*)-(\d{1,3})$/);
  if (!match?.[1]) {
    throw new Error(`Product code "${raw}" must look like TST-901-1 (family plus -1, -2, ...)`);
  }
  const family = match[1];
  const serial = Number(match[2]);
  if (!Number.isInteger(serial) || serial < 1 || serial > 200) {
    throw new Error(`Product code "${raw}" has an invalid variant number`);
  }
  if (!family.trim() || family.length > 60) {
    throw new Error(`Family code derived from "${raw}" is invalid`);
  }
  return { family, serial, code };
}

export function parseAttributes(raw: string): ParsedAttributes {
  const text = raw.trim();
  if (!text) return { pairs: [] };

  const parts = splitUnquoted(text, ";")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 10) {
    throw new Error("A variant can have a maximum of 10 attributes");
  }

  const pairs: AttributePair[] = [];
  const seen = new Set<string>();
  let spreading: ParsedAttributes["spreading"];

  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) {
      throw new Error(`Attribute "${part}" must look like Key=Value`);
    }
    const key = unquote(part.slice(0, eq));
    const value = part.slice(eq + 1).trim();
    if (!key) {
      throw new Error("Attribute name is required");
    }
    if (key.length > 80) {
      throw new Error(`Attribute name "${key}" is too long`);
    }
    const keyId = key.toLowerCase();
    if (seen.has(keyId)) {
      throw new Error(`Duplicate attribute "${key}"`);
    }
    seen.add(keyId);

    let values: string[];
    try {
      values = splitUnquoted(value, ",")
        .map((item) => unquote(item))
        .filter(Boolean);
    } catch {
      throw new Error(`Attribute "${key}" has an unclosed quote`);
    }

    if (!values.length) {
      throw new Error(`Attribute "${key}" needs a value`);
    }

    if (values.length > 1) {
      if (spreading) {
        throw new Error(
          `Only one attribute can list multiple values on a row (already spreading ${spreading.key})`
        );
      }
      if (values.length > IMPORT_LIMITS.maxSubVariants) {
        throw new Error(`Attribute "${key}" can list at most ${IMPORT_LIMITS.maxSubVariants} values`);
      }
      for (const item of values) {
        if (item.length > 200) {
          throw new Error(`Attribute "${key}" has a value that is too long`);
        }
      }
      spreading = { key, values };
      continue;
    }

    if (values[0].length > 200) {
      throw new Error(`Attribute "${key}" has a value that is too long`);
    }
    pairs.push({ key, value: values[0] });
  }

  return { pairs, spreading };
}

export function matchImageFolder(
  folder: string,
  parentCodes: Iterable<string>
): { parentCode: string; subSerial?: number } | null {
  const name = folder.trim().toUpperCase();
  if (!name) return null;

  const parents = [...parentCodes]
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const parent of parents) {
    if (name === parent) {
      return { parentCode: parent };
    }
    if (name.startsWith(`${parent}-`)) {
      const rest = name.slice(parent.length + 1);
      if (/^\d{1,3}$/.test(rest)) {
        const subSerial = Number(rest);
        if (subSerial >= 1 && subSerial <= IMPORT_LIMITS.maxSubVariants) {
          return { parentCode: parent, subSerial };
        }
      }
    }
  }

  return null;
}

export type FamilyMember = {
  row: number;
  serial: number;
  code: string;
  cells: SheetCellMap;
};

export type ImportFamily = {
  family: string;
  members: FamilyMember[];
};

export function groupImportFamilies(rows: ParsedSheetRow[]): {
  families: ImportFamily[];
  failed: Array<{ row: number; productCode: string; familyCode: string; reason: string }>;
} {
  const order: string[] = [];
  const grouped = new Map<string, FamilyMember[]>();
  const failed: Array<{ row: number; productCode: string; familyCode: string; reason: string }> = [];

  for (const item of rows) {
    const rawCode = item.cells.productCode || "";
    try {
      const parsed = parseParentVariantCode(rawCode);
      const list = grouped.get(parsed.family) || [];
      if (!grouped.has(parsed.family)) {
        order.push(parsed.family);
      }
      if (list.some((member) => member.serial === parsed.serial)) {
        throw new Error(`Duplicate product code ${parsed.code}`);
      }
      list.push({
        row: item.row,
        serial: parsed.serial,
        code: parsed.code,
        cells: item.cells,
      });
      grouped.set(parsed.family, list);
    } catch (error) {
      failed.push({
        row: item.row,
        productCode: rawCode || "(missing)",
        familyCode: "",
        reason: error instanceof Error ? error.message : "Invalid product code",
      });
    }
  }

  const families: ImportFamily[] = [];
  for (const family of order) {
    const members = (grouped.get(family) || []).sort((a, b) => a.serial - b.serial);
    const serials = members.map((member) => member.serial);
    if (!serials.includes(1)) {
      failed.push({
        row: members[0]?.row || 0,
        productCode: members[0]?.code || family,
        familyCode: family,
        reason: `Family ${family} is missing primary code ${family}-1`,
      });
      continue;
    }
    if (members.length > IMPORT_LIMITS.maxVariantsPerFamily) {
      failed.push({
        row: members[0].row,
        productCode: members[0].code,
        familyCode: family,
        reason: `Family ${family} has more than ${IMPORT_LIMITS.maxVariantsPerFamily} variants`,
      });
      continue;
    }
    const expected = members.map((_, index) => index + 1);
    const missing = expected.find((serial, index) => serials[index] !== serial);
    if (missing) {
      failed.push({
        row: members[0].row,
        productCode: `${family}-${missing}`,
        familyCode: family,
        reason: `Family ${family} has a gap: missing ${family}-${missing}`,
      });
      continue;
    }
    families.push({ family, members });
  }

  if (families.length > IMPORT_LIMITS.maxFamilies) {
    throw new Error(`A bulk import can have a maximum of ${IMPORT_LIMITS.maxFamilies} products`);
  }

  return { families, failed };
}

export function pickEnum<T extends readonly string[]>(
  value: string,
  options: T,
  label: string,
  fallback: T[number] | "" = ""
): T[number] | "" {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const match = options.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  if (!match) {
    throw new Error(`${label} "${trimmed}" is not valid. Use: ${options.join(", ")}`);
  }
  return match;
}

export function splitCommaList(value: string, max: number, maxLen: number): string[] {
  if (!value.trim()) return [];
  const items = splitUnquoted(value, ",")
    .map((item) => unquote(item))
    .filter(Boolean);
  const unique: string[] = [];
  for (const item of items) {
    if (item.length > maxLen) {
      throw new Error(`"${item}" is too long`);
    }
    if (!unique.some((entry) => entry.toLowerCase() === item.toLowerCase())) {
      unique.push(item);
    }
  }
  return unique.slice(0, max);
}

export function uniquePreserve(values: string[], max: number): string[] {
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!out.some((entry) => entry.toLowerCase() === trimmed.toLowerCase())) {
      out.push(trimmed);
    }
  }
  return out.slice(0, max);
}
