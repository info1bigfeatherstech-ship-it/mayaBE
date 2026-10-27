import fs from "fs";
import path from "path";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ApiError } from "../utils/ApiError";
import { IMPORT_LIMITS } from "../utils/productImportParse";

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "products");

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/jpg"]);
const MAX_FILE_SIZE = 8 * 1024 * 1024;

export function ensureUploadDirExists() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const VARIANT_IMAGE_FIELD = /^(variantImage_\d+|subImage_\d+_\d+|primarySubImage_\d+)$/;

export const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 250,
  },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      cb(new ApiError(400, "Only JPG, PNG, and WEBP images are allowed"));
      return;
    }
    if (file.fieldname !== "images" && !VARIANT_IMAGE_FIELD.test(file.fieldname)) {
      cb(new ApiError(400, "Unexpected image field"));
      return;
    }
    cb(null, true);
  },
}).any();

const SHEET_EXT = new Set([".csv", ".xlsx"]);
const ZIP_EXT = new Set([".zip"]);

function fileExtension(filename: string): string {
  return path.extname(filename || "").toLowerCase();
}

const importMulter = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: IMPORT_LIMITS.maxZipBytes,
    files: 2,
  },
  fileFilter(_req, file, cb) {
    const ext = fileExtension(file.originalname);
    if (file.fieldname === "sheet") {
      if (!SHEET_EXT.has(ext)) {
        cb(new ApiError(400, "The sheet field must be a .csv or .xlsx file"));
        return;
      }
      cb(null, true);
      return;
    }
    if (file.fieldname === "imagesZip") {
      if (!ZIP_EXT.has(ext) && file.mimetype !== "application/zip" && file.mimetype !== "application/x-zip-compressed") {
        cb(new ApiError(400, "The imagesZip field must be a .zip file"));
        return;
      }
      cb(null, true);
      return;
    }
    cb(new ApiError(400, "Unexpected import field. Use sheet and optional imagesZip"));
  },
}).fields([
  { name: "sheet", maxCount: 1 },
  { name: "imagesZip", maxCount: 1 },
]);

export function productImportUpload(req: Request, res: Response, next: NextFunction) {
  importMulter(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new ApiError(400, "The spreadsheet or ZIP must be 80MB or smaller"));
        return;
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        next(new ApiError(400, "Upload one spreadsheet as sheet and optionally one ZIP as imagesZip"));
        return;
      }
      next(new ApiError(400, "Invalid import upload"));
      return;
    }
    next(err);
  });
}
