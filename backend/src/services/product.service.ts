import mongoose from "mongoose";
import { Product } from "../models/Product";
import { ApiError } from "../utils/ApiError";
import {
  buildCategoryPathMap,
  getCategoryAndDescendantIds,
  getCategoryById,
} from "./category.service";
import {
  deleteUploadedImages,
  parseExistingImages,
  splitUploadedFiles,
  uniqueImages,
  uploadedFilesToUrls,
} from "./upload.service";
import { normalizeInfoSections } from "../config/infoSections";
import { erpPayload } from "./erpProduct";
import { publicListing, publicOptions } from "./publicListing";
import { extraVariantSku, serialVariantSku } from "../utils/variantSku";
import type { ProductFieldsInput } from "../validators/product.validator";

type PopulatedCategory = {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
};

type NamedRef = { _id: mongoose.Types.ObjectId; code?: string; name?: string };

function isoDate(value: unknown): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function serializeCustomerAssignments(data: Record<string, any>) {
  const rows = (data.customerAssignments || [])
    .map((row: Record<string, any>) => {
      const customer = serializeNamedRef(row.customer);
      if (!customer) return null;
      return {
        ...customer,
        styleCode: row.styleCode || "",
        repeatOrder: row.repeatOrder === "Yes" ? "Yes" : "No",
        repeatOrderNumber: row.repeatOrderNumber || "None",
      };
    })
    .filter(Boolean);
  if (rows.length) return rows;
  const legacy = serializeNamedRef(data.customer);
  if (!legacy) return [];
  return [
    {
      ...legacy,
      styleCode: data.customerStyleCode || "",
      repeatOrder: data.repeatOrder === "Yes" ? "Yes" : "No",
      repeatOrderNumber: data.repeatOrderNumber || "None",
    },
  ];
}

function serializeNamedRef(value: NamedRef | mongoose.Types.ObjectId | null | undefined) {
  if (value && typeof value === "object" && "name" in value) {
    return {
      id: String(value._id),
      code: value.code || "",
      name: value.name || "",
    };
  }
  if (value) {
    return { id: String(value), code: "", name: "" };
  }
  return null;
}

function variantAttributes(row: Record<string, any>): { key: string; value: string }[] {
  const listed = (row.attributes || [])
    .map((item: { key?: string; value?: string }) => ({
      key: String(item.key || "").trim(),
      value: String(item.value || "").trim(),
    }))
    .filter((item: { key: string; value: string }) => item.key && item.value);
  if (listed.length) return listed.slice(0, 10);
  const fallback: { key: string; value: string }[] = [];
  if (row.color) fallback.push({ key: "Color", value: String(row.color).trim() });
  if (row.size) fallback.push({ key: "Size", value: String(row.size).trim() });
  return fallback;
}

function serializeSubVariants(rows: Record<string, any>[] | undefined, parentSku: string) {
  return (rows || []).map((row, index) => ({
    sku: `${parentSku}-${index + 1}`,
    title: row.title || "",
    attributes: variantAttributes(row),
    images: uniqueImages(row.images || []).slice(0, 5),
    color: row.color || "",
    size: row.size || "",
    status: row.status || "In Stock",
    stockQty: Number(row.stockQty) || 0,
    priceAdjustment: Number(row.priceAdjustment) || 0,
  }));
}

function serializeVariants(product: Record<string, any>) {
  if (product.variant !== "Yes") return [];
  const productCode = String(product.productCode || "");
  return (product.variantDetails || []).map((row: Record<string, any>, index: number) => {
    const sku = extraVariantSku(productCode, index);
    return {
      sku,
      title: row.title || "",
      description: row.description || "",
      attributes: variantAttributes(row),
      images: uniqueImages(row.images || []).slice(0, 5),
      color: row.color || "",
      size: row.size || "",
      status: row.status || "In Stock",
      stockQty: Number(row.stockQty) || 0,
      priceAdjustment: Number(row.priceAdjustment) || 0,
      subVariants: serializeSubVariants(row.subVariants, sku),
    };
  });
}

function nestedVariantImages(product: {
  images?: string[];
  primarySubVariants?: { images?: string[] }[];
  variantDetails?: { images?: string[]; subVariants?: { images?: string[] }[] }[];
}) {
  return uniqueImages([
    ...(product.images || []),
    ...(product.primarySubVariants || []).flatMap((row) => row.images || []),
    ...(product.variantDetails || []).flatMap((row) => [
      ...(row.images || []),
      ...(row.subVariants || []).flatMap((sub) => sub.images || []),
    ]),
  ]);
}

function knownImageUrls(product: {
  images?: string[];
  primarySubVariants?: { images?: string[] }[];
  variantDetails?: { images?: string[]; subVariants?: { images?: string[] }[] }[];
}) {
  return new Set(nestedVariantImages(product));
}

function retainKnownImages(urls: string[] | undefined, known: Set<string>) {
  return uniqueImages(urls || []).filter((url) => known.has(url)).slice(0, 5);
}

function retainKnownVariantImages(rows: Record<string, any>[], known: Set<string>) {
  return rows.map((row) => ({
    ...row,
    images: retainKnownImages(row.images, known),
    subVariants: (row.subVariants || []).map((sub: Record<string, any>) => ({
      ...sub,
      images: retainKnownImages(sub.images, known),
    })),
  }));
}

async function attachUploadedImages(
  current: string[] | undefined,
  files: Express.Multer.File[] | undefined
) {
  if (!files?.length) return { images: uniqueImages(current || []).slice(0, 5), created: [] as string[] };
  const urls = await uploadedFilesToUrls(files);
  return { images: uniqueImages([...(current || []), ...urls]).slice(0, 5), created: urls };
}

async function attachVariantImages(
  rows: Record<string, any>[],
  uploads: Map<number, Express.Multer.File[]>,
  subUploads: Map<string, Express.Multer.File[]>
) {
  const next = [...rows];
  const created: string[] = [];
  try {
    for (const [index, files] of uploads.entries()) {
      if (!next[index]) continue;
      const attached = await attachUploadedImages(next[index].images, files);
      created.push(...attached.created);
      next[index] = { ...next[index], images: attached.images };
    }
    for (const [key, files] of subUploads.entries()) {
      const [parent, sub] = key.split("_").map(Number);
      if (!next[parent]?.subVariants?.[sub]) continue;
      const attached = await attachUploadedImages(next[parent].subVariants[sub].images, files);
      created.push(...attached.created);
      next[parent] = {
        ...next[parent],
        subVariants: next[parent].subVariants.map((row: Record<string, any>, index: number) =>
          index === sub ? { ...row, images: attached.images } : row
        ),
      };
    }
    return { rows: next, created };
  } catch (error) {
    await deleteUploadedImages(created);
    throw error;
  }
}

async function attachPrimarySubImages(
  rows: Record<string, any>[],
  uploads: Map<number, Express.Multer.File[]>,
  known: Set<string>
) {
  const next = (rows || []).map((row) => ({ ...row, images: retainKnownImages(row.images, known) }));
  const created: string[] = [];
  try {
    for (const [index, files] of uploads.entries()) {
      if (!next[index]) continue;
      const attached = await attachUploadedImages(next[index].images, files);
      created.push(...attached.created);
      next[index] = { ...next[index], images: attached.images };
    }
    return { rows: next, created };
  } catch (error) {
    await deleteUploadedImages(created);
    throw error;
  }
}

function serializeProduct(
  product: Record<string, any>,
  pathMap?: Map<string, string>,
  forAdmin = false
) {
  const data = typeof product.toObject === "function" ? product.toObject() : product;
  const category =
    data.category && typeof data.category === "object" && "name" in data.category
      ? {
          id: String(data.category._id),
          name: data.category.name,
          slug: data.category.slug,
          path: pathMap?.get(String(data.category._id)) || data.category.name,
        }
      : {
          id: String(data.category || ""),
          name: "",
          slug: "",
          path: "",
        };

  const publicFields = {
    id: String(data._id),
    productCode: data.productCode,
    name: data.name,
    title: data.title,
    description: data.description,
    category,
    images: data.images || [],
    attributes: (data.attributes || [])
      .map((item: { key: string; value: string }) => ({ key: item.key, value: item.value }))
      .filter((item: { key: string; value: string }) => item.key && item.value),
    infoSections: normalizeInfoSections(data.infoSections),
    listing: publicListing(data),
    modelCode: serialVariantSku(String(data.productCode || ""), 0),
    options: publicOptions(data),
  };

  if (!forAdmin) return publicFields;

  return {
    ...publicFields,
    sku: serialVariantSku(String(data.productCode || ""), 0),
    purchaseCode: data.purchaseCode || "",
    productType: data.productType || "",
    gender: data.gender || "",
    ageGroup: data.ageGroup || "",
    garmentCategory: data.garmentCategory || "",
    subcategory: data.subcategory || "",
    collection: data.styleCollection || "",
    season: data.season || "",
    fabric: data.fabric || "",
    fabricComposition: data.fabricComposition || "",
    gsm: data.gsm || "",
    pattern: data.pattern || "",
    color: data.color || "",
    availableColors: data.availableColors || [],
    sizeRange: data.sizeRange || "",
    variant: data.variant === "Yes" ? "Yes" : "No",
    variantDetails: serializeVariants(data),
    primarySubVariants: serializeSubVariants(
      data.primarySubVariants,
      serialVariantSku(String(data.productCode || ""), 0)
    ),
    productStatus: data.productStatus === "Inactive" ? "Inactive" : "Active",
    featuredProduct: data.featuredProduct === "Yes" ? "Yes" : "No",
    marketSuitability: data.marketSuitability || [],
    createdAt: isoDate(data.createdAt),
    updatedAt: isoDate(data.updatedAt),
    developmentDate: {
      month: data.developmentDate?.month || "",
      year: data.developmentDate?.year || "",
    },
    shipmentDate: {
      month: data.shipmentDate?.month || "",
      year: data.shipmentDate?.year || "",
    },
    factory: serializeNamedRef(data.factory),
    factoryPriceEXW: data.factoryPriceEXW || "",
    salePrice: data.salePrice || "",
    fobPrice: data.fobPrice || "",
    fobPort: data.fobPort || "",
    moq: data.moq || "",
    quantityUnit: data.quantityUnit || "Pcs",
    readyStockAvailability: data.readyStockAvailability === "Yes" ? "Yes" : "No",
    readyStockQuantity: data.readyStockQuantity || "",
    readyStockQuantityUnit: data.readyStockQuantityUnit || "Pcs",
    customer: serializeNamedRef(data.customer),
    customers: serializeCustomerAssignments(data),
    customerStyleCode: data.customerStyleCode || "",
    repeatOrder: data.repeatOrder === "Yes" ? "Yes" : "No",
    repeatOrderNumber: data.repeatOrderNumber || "None",
  };
}

function populateProduct(query: mongoose.Query<any, any>) {
  return query
    .populate("category", "name slug")
    .populate("factory", "code name")
    .populate("customer", "code name")
    .populate("customerAssignments.customer", "code name");
}

async function assertUniqueProductCode(productCode: string, excludeId?: string) {
  const query: Record<string, unknown> = { productCode };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const exists = await Product.exists(query);
  if (exists) {
    throw new ApiError(409, "Product code already exists");
  }
}

export async function listProducts(filters: {
  category?: string;
  search?: string;
  includeInactive?: boolean;
  forAdmin?: boolean;
}) {
  const query: Record<string, unknown> = {};

  if (!filters.includeInactive) {
    query.productStatus = { $ne: "Inactive" };
  }

  if (filters.category) {
    if (!mongoose.isValidObjectId(filters.category)) {
      throw new ApiError(400, "Invalid category id");
    }
    query.category = { $in: await getCategoryAndDescendantIds(filters.category) };
  }

  if (filters.search?.trim()) {
    const term = filters.search.trim();
    query.$or = [
      { productCode: { $regex: term, $options: "i" } },
      { sku: { $regex: term, $options: "i" } },
      { purchaseCode: { $regex: term, $options: "i" } },
      { name: { $regex: term, $options: "i" } },
      { title: { $regex: term, $options: "i" } },
    ];
  }

  const [products, pathMap] = await Promise.all([
    populateProduct(Product.find(query)).sort({ createdAt: -1 }),
    buildCategoryPathMap(),
  ]);

  return products.map((product: Record<string, unknown>) =>
    serializeProduct(product, pathMap, Boolean(filters.forAdmin))
  );
}

export async function getProductById(
  id: string,
  options?: { includeInactive?: boolean; forAdmin?: boolean }
) {
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid product id");
  }

  const product = await populateProduct(Product.findById(id));
  if (!product) {
    throw new ApiError(404, "Product not found");
  }
  if (!options?.includeInactive && product.productStatus === "Inactive") {
    throw new ApiError(404, "Product not found");
  }
  const pathMap = await buildCategoryPathMap();
  return serializeProduct(product, pathMap, Boolean(options?.forAdmin));
}

export async function createProduct(input: ProductFieldsInput, files?: Express.Multer.File[]) {
  await getCategoryById(input.category);
  await assertUniqueProductCode(input.productCode);

  const split = splitUploadedFiles(files);
  const images = uniqueImages(await uploadedFilesToUrls(split.parent));
  let variantUploads: string[] = [];
  if (images.length > 5) {
    await deleteUploadedImages(images);
    throw new ApiError(400, "A product can have a maximum of 5 images");
  }

  try {
    const erp = await erpPayload(input.erp, input.productCode);
    const withImages = await attachVariantImages(
      retainKnownVariantImages(erp.variantDetails || [], new Set()),
      split.variants,
      split.subs
    );
    const primarySubs = await attachPrimarySubImages(erp.primarySubVariants || [], split.primarySubs, new Set());
    variantUploads = [...withImages.created, ...primarySubs.created];
    const product = await Product.create({
      productCode: input.productCode.trim(),
      name: input.name.trim(),
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      images,
      attributes: input.attributes || [],
      infoSections: normalizeInfoSections(input.infoSections),
      ...erp,
      variantDetails: withImages.rows,
      primarySubVariants: primarySubs.rows,
    });

    const populated = await product.populate([
      { path: "category", select: "name slug" },
      { path: "factory", select: "code name" },
      { path: "customer", select: "code name" },
      { path: "customerAssignments.customer", select: "code name" },
    ]);
    const pathMap = await buildCategoryPathMap();
    return serializeProduct(populated, pathMap, true);
  } catch (error) {
    await deleteUploadedImages([...images, ...variantUploads]);
    throw error;
  }
}

export async function updateProduct(
  id: string,
  input: ProductFieldsInput,
  files?: Express.Multer.File[],
  rawExistingImages?: unknown
) {
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid product id");
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  await getCategoryById(input.category);
  await assertUniqueProductCode(input.productCode, id);

  const currentImages = product.images || [];
  const split = splitUploadedFiles(files);
  const keptImages = uniqueImages(
    parseExistingImages(rawExistingImages).filter((url) => currentImages.includes(url))
  );
  const newImages = await uploadedFilesToUrls(split.parent);
  const nextImages = uniqueImages([...keptImages, ...newImages]);

  if (nextImages.length > 5) {
    await deleteUploadedImages(newImages);
    throw new ApiError(400, "A product can have a maximum of 5 images");
  }

  const previousVariantImages = nestedVariantImages(product).filter((url) => !currentImages.includes(url));
  const removed = currentImages.filter((url) => !nextImages.includes(url));
  let variantUploads: string[] = [];

  try {
    product.productCode = input.productCode.trim();
    product.name = input.name.trim();
    product.title = input.title.trim();
    product.description = input.description.trim();
    product.category = new mongoose.Types.ObjectId(input.category);
    product.images = nextImages;
    product.set("attributes", input.attributes || []);
    product.set("infoSections", normalizeInfoSections(input.infoSections));
    if (input.erp) {
      const erp = await erpPayload(input.erp, input.productCode);
      const known = knownImageUrls(product);
      const withImages = await attachVariantImages(
        retainKnownVariantImages(erp.variantDetails || [], known),
        split.variants,
        split.subs
      );
      const primarySubs = await attachPrimarySubImages(erp.primarySubVariants || [], split.primarySubs, known);
      variantUploads = [...withImages.created, ...primarySubs.created];
      product.set({
        ...erp,
        variantDetails: withImages.rows,
        primarySubVariants: primarySubs.rows,
      });
      const nextVariantImages = nestedVariantImages({
        variantDetails: withImages.rows,
        primarySubVariants: primarySubs.rows,
      });
      removed.push(
        ...previousVariantImages.filter((url) => !nextVariantImages.includes(url) && !nextImages.includes(url))
      );
    }
    await product.save();
  } catch (error) {
    await deleteUploadedImages([...newImages, ...variantUploads]);
    throw error;
  }

  await deleteUploadedImages(removed);

  const populated = await product.populate([
    { path: "category", select: "name slug" },
    { path: "factory", select: "code name" },
    { path: "customer", select: "code name" },
    { path: "customerAssignments.customer", select: "code name" },
  ]);
  const pathMap = await buildCategoryPathMap();
  return serializeProduct(populated, pathMap, true);
}

export async function deleteProduct(id: string) {
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid product id");
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  await deleteUploadedImages(nestedVariantImages(product));
  await product.deleteOne();
  return { id };
}
