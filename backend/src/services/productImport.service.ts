import {
  AGE_GROUPS,
  GENDERS,
  MARKETS,
  PRODUCT_STATUSES,
  QUANTITY_UNITS,
  YES_NO,
} from "../config/erp";
import { ApiError } from "../utils/ApiError";
import {
  groupImportFamilies,
  parseAttributes,
  pickEnum,
  splitCommaList,
  uniquePreserve,
  type FamilyMember,
  type ImportFamily,
  type ParsedAttributes,
} from "../utils/productImportParse";
import { parseImportSpreadsheet } from "../utils/productImportSheet";
import { asMulterFile, extractImportZip, type ZipImageFile } from "../utils/productImportZip";
import type { ErpInput, ProductFieldsInput } from "../validators/product.validator";
import { productFieldsSchema } from "../validators/product.validator";
import { findCategoryIdByPath } from "./category.service";
import { createProduct } from "./product.service";

export type ProductImportFailure = {
  row: number;
  productCode: string;
  familyCode: string;
  reason: string;
};

export type ProductImportResult = {
  created: unknown[];
  failed: ProductImportFailure[];
  skippedFolders: Array<{ folder: string; reason: string }>;
  warnings: string[];
  summary: {
    families: number;
    rows: number;
    created: number;
    failed: number;
    imagesQueued: number;
  };
};

type VariantDraft = {
  title: string;
  description: string;
  attributes: Array<{ key: string; value: string }>;
  color: string;
  size: string;
  images: string[];
  subVariants: Array<{
    sku: string;
    title: string;
    attributes: Array<{ key: string; value: string }>;
    color: string;
    size: string;
    images: string[];
    stockQty: number;
    priceAdjustment: number;
    status: "In Stock";
  }>;
};

function cell(member: FamilyMember, key: string): string {
  return (member.cells[key] || "").trim();
}

function failFamily(family: ImportFamily, reason: string): ProductImportFailure {
  const primary = family.members.find((member) => member.serial === 1) || family.members[0];
  return {
    row: primary?.row || 0,
    productCode: primary?.code || family.family,
    familyCode: family.family,
    reason,
  };
}

function readError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Unable to import this product";
}

function attributeOf(parsed: ParsedAttributes, name: string): string {
  const match = parsed.pairs.find((item) => item.key.toLowerCase() === name.toLowerCase());
  return match?.value || "";
}

function buildVariantDraft(member: FamilyMember, fallbackColor: string): VariantDraft {
  let parsed: ParsedAttributes;
  try {
    parsed = parseAttributes(cell(member, "attributes"));
  } catch (error) {
    throw new Error(`Row ${member.row}: ${readError(error)}`);
  }

  const spreading = parsed.spreading;
  const parentPairs = spreading
    ? parsed.pairs.filter((item) => item.key.toLowerCase() !== spreading.key.toLowerCase())
    : parsed.pairs;
  const colorFromAttrs = attributeOf({ pairs: parentPairs, spreading }, "Color");
  const sizeFromAttrs = attributeOf({ pairs: parentPairs, spreading }, "Size");
  const parentColor =
    spreading?.key.toLowerCase() === "color" ? "" : colorFromAttrs || cell(member, "color") || fallbackColor;
  const parentSize = spreading?.key.toLowerCase() === "size" ? "" : sizeFromAttrs;

  const subVariants = spreading
    ? spreading.values.map((value) => {
        const isColor = spreading.key.toLowerCase() === "color";
        const isSize = spreading.key.toLowerCase() === "size";
        return {
          sku: "",
          title: value,
          attributes: [{ key: spreading.key, value }],
          color: isColor ? value : parentColor,
          size: isSize ? value : parentSize,
          images: [] as string[],
          stockQty: 0,
          priceAdjustment: 0,
          status: "In Stock" as const,
        };
      })
    : [];

  return {
    title: cell(member, "title"),
    description: cell(member, "description"),
    attributes: parentPairs,
    color: parentColor,
    size: parentSize,
    images: [],
    subVariants,
  };
}

function collectListingFacts(primary: VariantDraft, extras: VariantDraft[], master: FamilyMember) {
  const colorValues = uniquePreserve(
    [
      primary.color,
      ...primary.subVariants.map((item) => item.color),
      ...extras.flatMap((item) => [item.color, ...item.subVariants.map((sub) => sub.color)]),
      ...splitCommaList(cell(master, "availableColors"), 30, 40),
      cell(master, "color"),
    ],
    30
  );
  const sizeValues = uniquePreserve(
    [
      primary.size,
      ...primary.subVariants.map((item) => item.size),
      ...extras.flatMap((item) => [item.size, ...item.subVariants.map((sub) => sub.size)]),
      ...splitCommaList(cell(master, "sizeRange"), 20, 40),
    ],
    20
  );
  let sizeRange = sizeValues.join(", ");
  if (sizeRange.length > 120) {
    sizeRange = sizeValues.reduce((acc, item) => {
      const next = acc ? `${acc}, ${item}` : item;
      return next.length <= 120 ? next : acc;
    }, "");
  }
  return {
    availableColors: colorValues,
    sizeRange: sizeRange || cell(master, "sizeRange"),
    color: primary.color || colorValues[0] || cell(master, "color"),
  };
}

function filesForFamily(
  members: Array<{ serial: number; code: string; subCount: number }>,
  folders: Map<string, ZipImageFile[]>,
  used: Set<string>
): Express.Multer.File[] {
  const files: Express.Multer.File[] = [];
  const take = (key: string, fieldname: string) => {
    const images = folders.get(key);
    if (!images?.length) return;
    used.add(key);
    for (const image of images) {
      files.push(asMulterFile(fieldname, image));
    }
  };

  for (const member of members) {
    take(member.code, member.serial === 1 ? "images" : `variantImage_${member.serial - 2}`);
    for (let sub = 1; sub <= member.subCount; sub += 1) {
      const fieldname =
        member.serial === 1 ? `primarySubImage_${sub - 1}` : `subImage_${member.serial - 2}_${sub - 1}`;
      take(`${member.code}-${sub}`, fieldname);
    }
  }

  return files;
}

async function familyToProductInput(family: ImportFamily): Promise<{
  fields: ProductFieldsInput;
  members: Array<{ serial: number; code: string; subCount: number }>;
}> {
  const master = family.members.find((member) => member.serial === 1);
  if (!master) {
    throw new Error(`Family ${family.family} is missing ${family.family}-1`);
  }

  const name = cell(master, "name");
  const title = cell(master, "title");
  const description = cell(master, "description");
  const categoryPath = cell(master, "categoryPath");
  if (!name) throw new Error("Product name is required on the primary row");
  if (!title) throw new Error("Product title is required on the primary row");
  if (!description) throw new Error("Description is required on the primary row");
  if (!categoryPath) throw new Error("categoryPath is required on the primary row");

  const category = await findCategoryIdByPath(categoryPath);
  const primary = buildVariantDraft(master, cell(master, "color"));
  const extras = family.members
    .filter((member) => member.serial > 1)
    .map((member) => buildVariantDraft(member, primary.color));
  const listing = collectListingFacts(primary, extras, master);
  const markets = splitCommaList(cell(master, "marketSuitability"), 20, 40).map((item) => {
    const match = MARKETS.find((market) => market.toLowerCase() === item.toLowerCase());
    return match || item;
  });

  const erp: ErpInput = {
    sku: "",
    purchaseCode: cell(master, "purchaseCode"),
    productType: cell(master, "productType"),
    gender: pickEnum(cell(master, "gender"), GENDERS, "gender"),
    ageGroup: pickEnum(cell(master, "ageGroup"), AGE_GROUPS, "ageGroup"),
    garmentCategory: "",
    subcategory: "",
    collection: cell(master, "collection"),
    season: cell(master, "season"),
    developmentDate: { month: "", year: "" },
    shipmentDate: { month: "", year: "" },
    fabric: cell(master, "fabric"),
    fabricComposition: cell(master, "fabricComposition"),
    gsm: cell(master, "gsm"),
    pattern: cell(master, "pattern"),
    color: listing.color,
    availableColors: listing.availableColors,
    sizeRange: listing.sizeRange,
    variant: extras.length ? "Yes" : "No",
    variantDetails: extras.map((item) => ({
      title: item.title,
      description: item.description,
      attributes: item.attributes,
      images: [] as string[],
      color: item.color,
      size: item.size,
      sku: "",
      barcode: "",
      stockQty: 0,
      priceAdjustment: 0,
      status: "In Stock",
      subVariants: item.subVariants,
    })),
    primarySubVariants: primary.subVariants,
    factoryId: "",
    factoryPriceEXW: cell(master, "factoryPriceEXW"),
    salePrice: cell(master, "salePrice"),
    fobPrice: cell(master, "fobPrice"),
    fobPort: cell(master, "fobPort"),
    moq: cell(master, "moq"),
    quantityUnit: pickEnum(cell(master, "quantityUnit"), QUANTITY_UNITS, "quantityUnit", "Pcs") || "Pcs",
    readyStockAvailability: pickEnum(cell(master, "readyStockAvailability"), YES_NO, "readyStockAvailability", "No") || "No",
    readyStockQuantity: cell(master, "readyStockQuantity"),
    readyStockQuantityUnit:
      pickEnum(cell(master, "readyStockQuantityUnit"), QUANTITY_UNITS, "readyStockQuantityUnit", "Pcs") || "Pcs",
    customerId: "",
    customerStyleCode: "",
    repeatOrder: "No",
    repeatOrderNumber: "None",
    customers: [],
    productStatus: pickEnum(cell(master, "productStatus"), PRODUCT_STATUSES, "productStatus", "Active") || "Active",
    featuredProduct: "No",
    marketSuitability: markets,
  };

  const parsed = productFieldsSchema.safeParse({
    productCode: family.family,
    name,
    title,
    description,
    category,
    attributes: [],
    infoSections: [],
    erp,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid product data");
  }

  return {
    fields: parsed.data,
    members: family.members.map((member, index) => ({
      serial: member.serial,
      code: member.code,
      subCount: index === 0 ? primary.subVariants.length : extras[index - 1]?.subVariants.length || 0,
    })),
  };
}

export async function importProducts(
  sheet: Express.Multer.File,
  zipFile?: Express.Multer.File
): Promise<ProductImportResult> {
  const rows = await parseImportSpreadsheet(sheet);
  const grouped = groupImportFamilies(rows);
  const failed: ProductImportFailure[] = [...grouped.failed];
  const warnings: string[] = [];

  if (!grouped.families.length && failed.length) {
    return {
      created: [],
      failed,
      skippedFolders: [],
      warnings,
      summary: {
        families: 0,
        rows: rows.length,
        created: 0,
        failed: failed.length,
        imagesQueued: 0,
      },
    };
  }

  if (!grouped.families.length) {
    throw new ApiError(400, "No valid products found in the spreadsheet");
  }

  const parentCodes = grouped.families.flatMap((family) => family.members.map((member) => member.code));
  let zipFolders = new Map<string, ZipImageFile[]>();
  let skippedFolders: Array<{ folder: string; reason: string }> = [];

  if (zipFile?.buffer?.length) {
    const extracted = extractImportZip(zipFile.buffer, parentCodes);
    zipFolders = extracted.folders;
    skippedFolders = extracted.skipped;
    warnings.push(...extracted.warnings);
  } else if (zipFile && !zipFile.buffer?.length) {
    throw new ApiError(400, "The ZIP file is empty");
  }

  const created: unknown[] = [];
  const usedFolders = new Set<string>();
  let imagesQueued = 0;

  for (const family of grouped.families) {
    try {
      const prepared = await familyToProductInput(family);
      const files = filesForFamily(prepared.members, zipFolders, usedFolders);
      imagesQueued += files.length;
      const product = await createProduct(prepared.fields, files);
      created.push(product);
    } catch (error) {
      failed.push(failFamily(family, readError(error)));
    }
  }

  for (const folder of zipFolders.keys()) {
    if (!usedFolders.has(folder)) {
      skippedFolders.push({
        folder,
        reason: "Folder was not attached to an imported product",
      });
    }
  }

  return {
    created,
    failed,
    skippedFolders,
    warnings,
    summary: {
      families: grouped.families.length,
      rows: rows.length,
      created: created.length,
      failed: failed.length,
      imagesQueued,
    },
  };
}
