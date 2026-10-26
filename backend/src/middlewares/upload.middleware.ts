import fs from "fs";
import path from "path";
import multer from "multer";
import { ApiError } from "../utils/ApiError";

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
