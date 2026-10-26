import mongoose from "mongoose";
import { Customer } from "../models/Customer";
import { Factory } from "../models/Factory";
import { Product } from "../models/Product";
import { ApiError } from "../utils/ApiError";
import { nextPrefixedCode } from "../utils/prefixedCode";
import { erpSchema, type ErpInput } from "../validators/product.validator";

function cleanList(values: string[] | undefined, max = 30): string[] {
  return [...new Set((values || []).map((item) => item.trim()).filter(Boolean))].slice(0, max);
}

function normalizeVariants(erp: ErpInput) {
  if (erp.variant !== "Yes") return [];
  const seen = new Set<string>();
  const rows = [];
  for (const item of erp.variantDetails || []) {
    const sku = item.sku.trim();
    const color = item.color.trim();
    const size = item.size.trim();
    if (!sku || !color || !size) continue;
    const key = sku.toLowerCase();
    if (seen.has(key)) {
      throw new ApiError(400, `Duplicate variant SKU: ${sku}`);
    }
    seen.add(key);
    rows.push({
      color,
      size,
      sku,
      barcode: item.barcode?.trim() || "",
      stockQty: Number.isFinite(item.stockQty) ? item.stockQty : 0,
      priceAdjustment: Number.isFinite(item.priceAdjustment) ? item.priceAdjustment : 0,
      status: item.status || "In Stock",
    });
  }
  return rows;
}

async function optionalRef(id: string | undefined, kind: "factory" | "customer") {
  if (!id) return null;
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, `Invalid ${kind} id`);
  }
  if (kind === "factory") {
    const exists = await Factory.exists({ _id: id });
    if (!exists) throw new ApiError(404, "Factory not found");
  } else {
    const exists = await Customer.exists({ _id: id });
    if (!exists) throw new ApiError(404, "Customer not found");
  }
  return new mongoose.Types.ObjectId(id);
}

export async function erpPayload(erp: ErpInput | undefined, productCode: string) {
  const data = erp ?? erpSchema.parse({});
  const factory = await optionalRef(data.factoryId, "factory");
  const customer = await optionalRef(data.customerId, "customer");
  let customerStyleCode = data.customerStyleCode?.trim() || "";
  if (!customer) {
    customerStyleCode = "";
  } else if (!customerStyleCode) {
    customerStyleCode = await nextPrefixedCode(Product, "customerStyleCode", "C");
  }

  return {
    sku: data.sku?.trim() || productCode.trim(),
    purchaseCode: data.purchaseCode?.trim() || "",
    productType: data.productType?.trim() || "",
    gender: data.gender || "",
    ageGroup: data.ageGroup || "",
    garmentCategory: data.garmentCategory || "",
    subcategory: data.subcategory?.trim() || "",
    styleCollection: data.collection?.trim() || "",
    season: data.season?.trim() || "",
    developmentDate: {
      month: data.developmentDate?.month || "",
      year: data.developmentDate?.year || "",
    },
    shipmentDate: {
      month: data.shipmentDate?.month || "",
      year: data.shipmentDate?.year || "",
    },
    fabric: data.fabric?.trim() || "",
    fabricComposition: data.fabricComposition?.trim() || "",
    gsm: data.gsm?.trim() || "",
    pattern: data.pattern?.trim() || "",
    color: data.color?.trim() || "",
    availableColors: cleanList(data.availableColors),
    sizeRange: data.sizeRange?.trim() || "",
    variant: data.variant || "No",
    variantDetails: normalizeVariants(data),
    factory,
    factoryPriceEXW: data.factoryPriceEXW?.trim() || "",
    salePrice: data.salePrice?.trim() || "",
    fobPrice: data.fobPrice?.trim() || "",
    fobPort: data.fobPort?.trim() || "",
    moq: data.moq?.trim() || "",
    quantityUnit: data.quantityUnit || "Pcs",
    readyStockAvailability: data.readyStockAvailability || "No",
    readyStockQuantity: data.readyStockAvailability === "Yes" ? data.readyStockQuantity?.trim() || "" : "",
    readyStockQuantityUnit: data.readyStockQuantityUnit || "Pcs",
    customer,
    customerStyleCode,
    repeatOrder: data.repeatOrder || "No",
    repeatOrderNumber: data.repeatOrder === "Yes" ? data.repeatOrderNumber || "None" : "None",
    productStatus: data.productStatus || "Active",
    featuredProduct: data.featuredProduct || "No",
    marketSuitability: cleanList(data.marketSuitability, 20),
  };
}
