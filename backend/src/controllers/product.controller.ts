import type { Request, Response } from "express";
import {
  createProduct,
  deleteProduct,
  getProductById,
  listProducts,
  updateProduct,
} from "../services/product.service";
import { importProducts } from "../services/productImport.service";
import { successResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { productFieldsSchema } from "../validators/product.validator";
import { ApiError } from "../utils/ApiError";
import { buildImportTemplateCsv } from "../utils/productImportTemplate";

function readFiles(req: Request): Express.Multer.File[] {
  return Array.isArray(req.files) ? req.files : [];
}

function parseProductFields(req: Request) {
  try {
    const parsed = productFieldsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid product data");
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error) throw new ApiError(400, error.message);
    throw new ApiError(400, "Invalid product data");
  }
}

export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  const forAdmin = Boolean(req.admin);
  const products = await listProducts({
    category: typeof req.query.category === "string" ? req.query.category : undefined,
    search: typeof req.query.search === "string" ? req.query.search : undefined,
    includeInactive: forAdmin && req.query.includeInactive === "true",
    forAdmin,
  });
  res.status(200).json(successResponse("Products fetched", products));
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const forAdmin = Boolean(req.admin);
  const product = await getProductById(req.params.id, {
    includeInactive: forAdmin,
    forAdmin,
  });
  res.status(200).json(successResponse("Product fetched", product));
});

export const postProduct = asyncHandler(async (req: Request, res: Response) => {
  const fields = parseProductFields(req);
  const product = await createProduct(fields, readFiles(req));
  res.status(201).json(successResponse("Product created", product));
});

export const putProduct = asyncHandler(async (req: Request, res: Response) => {
  const fields = parseProductFields(req);
  const product = await updateProduct(req.params.id, fields, readFiles(req), req.body.existingImages);
  res.status(200).json(successResponse("Product updated", product));
});

export const removeProduct = asyncHandler(async (req: Request, res: Response) => {
  const result = await deleteProduct(req.params.id);
  res.status(200).json(successResponse("Product deleted", result));
});

function importFiles(req: Request) {
  const files = req.files as
    | { sheet?: Express.Multer.File[]; imagesZip?: Express.Multer.File[] }
    | undefined;
  return {
    sheet: files?.sheet?.[0],
    zip: files?.imagesZip?.[0],
  };
}

export const getImportTemplate = asyncHandler(async (_req: Request, res: Response) => {
  const csv = buildImportTemplateCsv();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="maya-exports-product-import.csv"');
  res.status(200).send(`\uFEFF${csv}`);
});

export const postProductImport = asyncHandler(async (req: Request, res: Response) => {
  req.setTimeout(10 * 60 * 1000);
  res.setTimeout(10 * 60 * 1000);
  const { sheet, zip } = importFiles(req);
  if (!sheet) {
    throw new ApiError(400, "Upload a CSV or Excel file in the sheet field");
  }
  const result = await importProducts(sheet, zip);
  const created = result.summary.created;
  const failed = result.summary.failed;
  const message =
    failed && created
      ? `Imported ${created} product${created === 1 ? "" : "s"}; ${failed} could not be imported`
      : failed
        ? "No products were created"
        : `Imported ${created} product${created === 1 ? "" : "s"}`;
  res.status(200).json(successResponse(message, result));
});
