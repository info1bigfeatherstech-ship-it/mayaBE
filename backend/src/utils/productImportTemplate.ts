function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const IMPORT_TEMPLATE_HEADERS = [
  "productCode",
  "name",
  "title",
  "description",
  "categoryPath",
  "moq",
  "fabric",
  "fabricComposition",
  "gsm",
  "pattern",
  "fobPort",
  "gender",
  "productType",
  "productStatus",
  "quantityUnit",
  "color",
  "attributes",
] as const;

const EXAMPLE_ROWS: string[][] = [
  [
    "TST-901-1",
    "Cotton Hoodie",
    "Cotton Hoodie — Red",
    "Soft cotton fleece hoodie for export buyers. Mid-weight fleece with a clean export finish.",
    "Garments / Women / Women's Sweat Tops & Hoodies",
    "300",
    "Cotton Fleece",
    "80% Cotton 20% Polyester",
    "320",
    "Solid",
    "Mundra",
    "Women",
    "New Developed",
    "Active",
    "Pcs",
    "Red",
    "Color=Red; Size=XS, SM, L",
  ],
  [
    "TST-901-2",
    "",
    "Cotton Hoodie — Black",
    "Black colorway of the cotton fleece hoodie.",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "Black",
    "Color=Black; Size=XS, SM",
  ],
];

export function buildImportTemplateCsv(): string {
  const lines = [
    IMPORT_TEMPLATE_HEADERS.join(","),
    ...EXAMPLE_ROWS.map((row) => row.map(csvEscape).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
