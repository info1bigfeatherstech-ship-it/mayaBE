import { z } from "zod";
import {
  AGE_GROUPS,
  GARMENT_CATEGORIES,
  GENDERS,
  PRODUCT_STATUSES,
  QUANTITY_UNITS,
  REPEAT_NUMBERS,
  VARIANT_STATUSES,
  YES_NO,
} from "../config/erp";

function parseJson(value: unknown, fallback: unknown, label: string) {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${label} must be valid JSON`);
    }
  }
  return value;
}

const attributeSchema = z.object({
  key: z.string().trim().min(1, "Attribute name is required").max(80),
  value: z.string().trim().min(1, "Attribute value is required").max(200),
});

const infoItemSchema = z.object({
  heading: z.string().trim().max(120).optional().default(""),
  content: z.string().trim().max(1000).optional().default(""),
});

const infoSectionSchema = z.object({
  key: z.enum(["specs", "oem", "packing"]),
  items: z.array(infoItemSchema).max(6, "A section can have a maximum of 6 items"),
});

const monthYearSchema = z.object({
  month: z.string().trim().max(20).optional().default(""),
  year: z.string().trim().max(4).optional().default(""),
});

const subVariantSchema = z.object({
  title: z.string().trim().max(160).optional().default(""),
  attributes: z.array(attributeSchema).max(10).optional().default([]),
  images: z.array(z.string().trim().min(1).max(500)).max(5).optional().default([]),
  color: z.string().trim().max(40).optional().default(""),
  size: z.string().trim().max(120).optional().default(""),
  sku: z.string().trim().max(80).optional().default(""),
  stockQty: z.coerce.number().min(0).max(100000000).optional().default(0),
  priceAdjustment: z.coerce.number().min(-100000).max(100000).optional().default(0),
  status: z.enum(VARIANT_STATUSES).optional().default("In Stock"),
});

const variantSchema = z.object({
  title: z.string().trim().max(160).optional().default(""),
  description: z.string().trim().max(2000).optional().default(""),
  attributes: z.array(attributeSchema).max(10).optional().default([]),
  images: z.array(z.string().trim().min(1).max(500)).max(5).optional().default([]),
  color: z.string().trim().max(40).optional().default(""),
  size: z.string().trim().max(120).optional().default(""),
  sku: z.string().trim().max(80).optional().default(""),
  barcode: z.string().trim().max(40).optional().default(""),
  stockQty: z.coerce.number().min(0).max(100000000).optional().default(0),
  priceAdjustment: z.coerce.number().min(-100000).max(100000).optional().default(0),
  status: z.enum(VARIANT_STATUSES).optional().default("In Stock"),
  subVariants: z.array(subVariantSchema).max(20).optional().default([]),
});

const optionalId = z
  .string()
  .trim()
  .optional()
  .default("")
  .transform((value) => value || "");

export const erpSchema = z.object({
  sku: z.string().trim().max(60).optional().default(""),
  purchaseCode: z.string().trim().max(60).optional().default(""),
  productType: z.string().trim().max(80).optional().default(""),
  gender: z.union([z.enum(GENDERS), z.literal("")]).optional().default(""),
  ageGroup: z.union([z.enum(AGE_GROUPS), z.literal("")]).optional().default(""),
  garmentCategory: z.union([z.enum(GARMENT_CATEGORIES), z.literal("")]).optional().default(""),
  subcategory: z.string().trim().max(80).optional().default(""),
  collection: z.string().trim().max(80).optional().default(""),
  season: z.string().trim().max(40).optional().default(""),
  developmentDate: monthYearSchema.optional().default({ month: "", year: "" }),
  shipmentDate: monthYearSchema.optional().default({ month: "", year: "" }),
  fabric: z.string().trim().max(80).optional().default(""),
  fabricComposition: z.string().trim().max(120).optional().default(""),
  gsm: z.string().trim().max(20).optional().default(""),
  pattern: z.string().trim().max(80).optional().default(""),
  color: z.string().trim().max(40).optional().default(""),
  availableColors: z.array(z.string().trim().min(1).max(40)).max(30).optional().default([]),
  sizeRange: z.string().trim().max(120).optional().default(""),
  variant: z.enum(YES_NO).optional().default("No"),
  variantDetails: z.array(variantSchema).max(200).optional().default([]),
  primarySubVariants: z.array(subVariantSchema).max(20).optional().default([]),
  factoryId: optionalId,
  factoryPriceEXW: z.string().trim().max(40).optional().default(""),
  salePrice: z.string().trim().max(40).optional().default(""),
  fobPrice: z.string().trim().max(40).optional().default(""),
  fobPort: z.string().trim().max(80).optional().default(""),
  moq: z.string().trim().max(40).optional().default(""),
  quantityUnit: z.union([z.enum(QUANTITY_UNITS), z.literal("")]).optional().default("Pcs"),
  readyStockAvailability: z.enum(YES_NO).optional().default("No"),
  readyStockQuantity: z.string().trim().max(40).optional().default(""),
  readyStockQuantityUnit: z.union([z.enum(QUANTITY_UNITS), z.literal("")]).optional().default("Pcs"),
  customerId: optionalId,
  customerStyleCode: z.string().trim().max(40).optional().default(""),
  repeatOrder: z.enum(YES_NO).optional().default("No"),
  repeatOrderNumber: z.enum(REPEAT_NUMBERS).optional().default("None"),
  customers: z
    .array(
      z.object({
        customerId: optionalId,
        styleCode: z.string().trim().max(40).optional().default(""),
        repeatOrder: z.enum(YES_NO).optional().default("No"),
        repeatOrderNumber: z.enum(REPEAT_NUMBERS).optional().default("None"),
      })
    )
    .max(10)
    .optional()
    .default([]),
  productStatus: z.enum(PRODUCT_STATUSES).optional().default("Active"),
  featuredProduct: z.enum(YES_NO).optional().default("No"),
  marketSuitability: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
});

export const productFieldsSchema = z.object({
  productCode: z.string().trim().min(1, "Product code is required").max(60),
  name: z.string().trim().min(1, "Product name is required").max(120),
  title: z.string().trim().min(1, "Product title is required").max(160),
  description: z.string().trim().min(1, "Description is required").max(4000),
  category: z.string().trim().min(1, "Category is required"),
  attributes: z.preprocess(
    (value) => parseJson(value, [], "Attributes"),
    z.array(attributeSchema).max(20, "A product can have a maximum of 20 attributes")
  ),
  infoSections: z.preprocess(
    (value) => parseJson(value, [], "Info sections"),
    z.array(infoSectionSchema).max(3, "A product can have a maximum of 3 info sections")
  ),
  erp: z.preprocess((value) => {
    if (value == null || value === "") return undefined;
    return parseJson(value, undefined, "ERP data");
  }, erpSchema.optional()),
});

export type ProductFieldsInput = z.infer<typeof productFieldsSchema>;
export type ErpInput = z.infer<typeof erpSchema>;
