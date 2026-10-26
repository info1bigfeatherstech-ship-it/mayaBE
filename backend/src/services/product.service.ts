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
  uniqueImages,
  uploadedFilesToUrls,
} from "./upload.service";
import { normalizeInfoSections } from "../config/infoSections";
import { erpPayload } from "./erpProduct";
import { publicListing } from "./publicListing";
import type { ProductFieldsInput } from "../validators/product.validator";

type PopulatedCategory = {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
};

type NamedRef = { _id: mongoose.Types.ObjectId; code?: string; name?: string };

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

function serializeVariants(product: Record<string, any>, forAdmin: boolean) {
  if (product.variant !== "Yes") return [];
  return (product.variantDetails || []).map((row: Record<string, any>) => {
    const base = {
      color: row.color || "",
      size: row.size || "",
      sku: row.sku || "",
      status: row.status || "In Stock",
    };
    if (!forAdmin) return base;
    return {
      ...base,
      barcode: row.barcode || "",
      stockQty: Number(row.stockQty) || 0,
      priceAdjustment: Number(row.priceAdjustment) || 0,
    };
  });
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
  };

  if (!forAdmin) return publicFields;

  return {
    ...publicFields,
    sku: data.sku || data.productCode,
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
    variantDetails: serializeVariants(data, true),
    productStatus: data.productStatus === "Inactive" ? "Inactive" : "Active",
    featuredProduct: data.featuredProduct === "Yes" ? "Yes" : "No",
    marketSuitability: data.marketSuitability || [],
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
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
    customerStyleCode: data.customerStyleCode || "",
    repeatOrder: data.repeatOrder === "Yes" ? "Yes" : "No",
    repeatOrderNumber: data.repeatOrderNumber || "None",
  };
}

function populateProduct(query: mongoose.Query<any, any>) {
  return query
    .populate("category", "name slug")
    .populate("factory", "code name")
    .populate("customer", "code name");
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

  const images = uniqueImages(await uploadedFilesToUrls(files));
  if (images.length > 5) {
    await deleteUploadedImages(images);
    throw new ApiError(400, "A product can have a maximum of 5 images");
  }

  try {
    const erp = await erpPayload(input.erp, input.productCode);
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
    });

    const populated = await product.populate([
      { path: "category", select: "name slug" },
      { path: "factory", select: "code name" },
      { path: "customer", select: "code name" },
    ]);
    const pathMap = await buildCategoryPathMap();
    return serializeProduct(populated, pathMap, true);
  } catch (error) {
    await deleteUploadedImages(images);
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
  const keptImages = uniqueImages(
    parseExistingImages(rawExistingImages).filter((url) => currentImages.includes(url))
  );
  const newImages = await uploadedFilesToUrls(files);
  const nextImages = uniqueImages([...keptImages, ...newImages]);

  if (nextImages.length > 5) {
    await deleteUploadedImages(newImages);
    throw new ApiError(400, "A product can have a maximum of 5 images");
  }

  const removed = currentImages.filter((url) => !nextImages.includes(url));

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
      product.set(await erpPayload(input.erp, input.productCode));
    }
    await product.save();
  } catch (error) {
    await deleteUploadedImages(newImages);
    throw error;
  }

  await deleteUploadedImages(removed);

  const populated = await product.populate([
    { path: "category", select: "name slug" },
    { path: "factory", select: "code name" },
    { path: "customer", select: "code name" },
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

  await deleteUploadedImages(product.images || []);
  await product.deleteOne();
  return { id };
}
