import mongoose from "mongoose";
import { Customer } from "../models/Customer";
import { Factory } from "../models/Factory";
import { ApiError } from "../utils/ApiError";
import { extraVariantSku, serialVariantSku } from "../utils/variantSku";
import { erpSchema, type ErpInput } from "../validators/product.validator";
import { uniqueImages } from "./upload.service";

function cleanList(values: string[] | undefined, max = 30): string[] {
  return [...new Set((values || []).map((item) => item.trim()).filter(Boolean))].slice(0, max);
}

function attributeValue(attributes: { key: string; value: string }[], name: string): string {
  const match = attributes.find((item) => item.key.trim().toLowerCase() === name.toLowerCase());
  return match?.value.trim() || "";
}

function normalizeSubs(
  rows: ErpInput["primarySubVariants"],
  parentSku: string,
  fallbackColor: string
) {
  return (rows || []).slice(0, 20).map((item, index) => {
    const attributes = (item.attributes || [])
      .map((entry) => ({ key: entry.key.trim(), value: entry.value.trim() }))
      .filter((entry) => entry.key && entry.value)
      .slice(0, 10);
    const color = item.color?.trim() || attributeValue(attributes, "Color") || fallbackColor;
    const size = item.size?.trim() || attributeValue(attributes, "Size");
    return {
      sku: `${parentSku}-${index + 1}`,
      title: item.title?.trim() || "",
      attributes,
      images: uniqueImages(item.images || []).slice(0, 5),
      color,
      size,
      stockQty: Number.isFinite(item.stockQty) ? item.stockQty : 0,
      priceAdjustment: Number.isFinite(item.priceAdjustment) ? item.priceAdjustment : 0,
      status: item.status || "In Stock",
    };
  });
}

function normalizeVariants(erp: ErpInput, productCode: string) {
  if (erp.variant !== "Yes") return [];
  const rows = [];
  for (const [index, item] of (erp.variantDetails || []).entries()) {
    const attributes = (item.attributes || [])
      .map((entry) => ({ key: entry.key.trim(), value: entry.value.trim() }))
      .filter((entry) => entry.key && entry.value)
      .slice(0, 10);
    const color = item.color?.trim() || attributeValue(attributes, "Color");
    const size = item.size?.trim() || attributeValue(attributes, "Size");
    const sku = extraVariantSku(productCode, index);
    rows.push({
      sku,
      title: item.title?.trim() || "",
      description: item.description?.trim() || "",
      attributes,
      images: uniqueImages(item.images || []).slice(0, 5),
      color,
      size,
      barcode: "",
      stockQty: Number.isFinite(item.stockQty) ? item.stockQty : 0,
      priceAdjustment: Number.isFinite(item.priceAdjustment) ? item.priceAdjustment : 0,
      status: item.status || "In Stock",
      subVariants: normalizeSubs(item.subVariants, sku, color),
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
  const customerRows = (data.customers || []).filter((item) => item.customerId);
  if (!customerRows.length && data.customerId) {
    customerRows.push({
      customerId: data.customerId,
      styleCode: data.customerStyleCode || "",
      repeatOrder: data.repeatOrder || "No",
      repeatOrderNumber: data.repeatOrderNumber || "None",
    });
  }
  const customerAssignments = [];
  const seenCustomers = new Set<string>();
  for (const row of customerRows) {
    const assigned = await optionalRef(row.customerId, "customer");
    if (!assigned) continue;
    const key = String(assigned);
    if (seenCustomers.has(key)) continue;
    seenCustomers.add(key);
    customerAssignments.push({
      customer: assigned,
      styleCode: row.styleCode?.trim() || "",
      repeatOrder: row.repeatOrder || "No",
      repeatOrderNumber: row.repeatOrder === "Yes" ? row.repeatOrderNumber || "None" : "None",
    });
  }
  const customer = customerAssignments[0]?.customer || null;
  const customerStyleCode = customerAssignments[0]?.styleCode || "";

  return {
    sku: serialVariantSku(productCode, 0),
    purchaseCode: data.purchaseCode?.trim() || "",
    productType: data.productType?.trim() || "",
    gender: data.gender || "",
    ageGroup: data.ageGroup || "",
    // garmentCategory / subcategory are legacy ERP labels. Website Category is the
    // public menu. Leave stored values untouched so older records are not wiped.
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
    variantDetails: normalizeVariants(data, productCode),
    primarySubVariants: normalizeSubs(
      data.primarySubVariants,
      serialVariantSku(productCode, 0),
      data.color?.trim() || ""
    ),
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
    customerAssignments,
    customerStyleCode,
    repeatOrder: customerAssignments[0]?.repeatOrder || "No",
    repeatOrderNumber: customerAssignments[0]?.repeatOrderNumber || "None",
    productStatus: data.productStatus || "Active",
    marketSuitability: cleanList(data.marketSuitability, 20),
  };
}
