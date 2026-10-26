import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { env } from "../config/env";
import { getCloudinary, isCloudinaryConfigured } from "../config/cloudinary";
import { ensureUploadDirExists, UPLOAD_DIR } from "../middlewares/upload.middleware";
import { ApiError } from "../utils/ApiError";

export function fileToPublicUrl(filename: string): string {
  return `${env.PUBLIC_API_URL.replace(/\/$/, "")}/uploads/products/${filename}`;
}

function extensionFor(file: Express.Multer.File): string {
  const fromName = path.extname(file.originalname || "").toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(fromName)) return fromName;
  if (file.mimetype === "image/png") return ".png";
  if (file.mimetype === "image/webp") return ".webp";
  return ".jpg";
}

async function saveLocalFile(file: Express.Multer.File): Promise<string> {
  ensureUploadDirExists();
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extensionFor(file)}`;
  const fullPath = path.join(UPLOAD_DIR, filename);
  if (file.buffer) {
    await fs.writeFile(fullPath, file.buffer);
  } else if (file.path) {
    await fs.copyFile(file.path, fullPath);
  } else {
    throw new ApiError(500, "Unable to store image");
  }
  return fileToPublicUrl(filename);
}

function uploadToCloudinary(file: Express.Multer.File): Promise<string> {
  const cloudinary = getCloudinary();
  if (!cloudinary) {
    throw new ApiError(503, "Cloudinary is not configured");
  }
  if (!file.buffer?.length) {
    throw new ApiError(400, "Image data is missing");
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "maya-exports/products",
        resource_type: "image",
        unique_filename: true,
        overwrite: false,
        transformation: [
          { width: 1600, height: 1600, crop: "limit" },
          { quality: "auto:good", fetch_format: "auto" },
        ],
      },
      (error, result) => {
        if (error || !result?.secure_url) {
          reject(new ApiError(500, error?.message || "Unable to upload image to Cloudinary"));
          return;
        }
        resolve(result.secure_url);
      }
    );
    stream.end(file.buffer);
  });
}

export function splitUploadedFiles(files?: Express.Multer.File[]): {
  parent: Express.Multer.File[];
  variants: Map<number, Express.Multer.File[]>;
  subs: Map<string, Express.Multer.File[]>;
  primarySubs: Map<number, Express.Multer.File[]>;
} {
  const parent: Express.Multer.File[] = [];
  const variants = new Map<number, Express.Multer.File[]>();
  const subs = new Map<string, Express.Multer.File[]>();
  const primarySubs = new Map<number, Express.Multer.File[]>();
  for (const file of files || []) {
    if (file.fieldname === "images") {
      if (parent.length < 5) parent.push(file);
      continue;
    }
    const variantMatch = file.fieldname.match(/^variantImage_(\d+)$/);
    if (variantMatch) {
      const index = Number(variantMatch[1]);
      if (!Number.isInteger(index) || index < 0) continue;
      const list = variants.get(index) || [];
      if (list.length < 5) list.push(file);
      variants.set(index, list);
      continue;
    }
    const subMatch = file.fieldname.match(/^subImage_(\d+)_(\d+)$/);
    if (subMatch) {
      const key = `${Number(subMatch[1])}_${Number(subMatch[2])}`;
      const list = subs.get(key) || [];
      if (list.length < 5) list.push(file);
      subs.set(key, list);
      continue;
    }
    const primaryMatch = file.fieldname.match(/^primarySubImage_(\d+)$/);
    if (primaryMatch) {
      const index = Number(primaryMatch[1]);
      if (!Number.isInteger(index) || index < 0) continue;
      const list = primarySubs.get(index) || [];
      if (list.length < 5) list.push(file);
      primarySubs.set(index, list);
    }
  }
  return { parent, variants, subs, primarySubs };
}

export async function uploadedFilesToUrls(files?: Express.Multer.File[]): Promise<string[]> {
  if (!files?.length) return [];

  if (isCloudinaryConfigured()) {
    return Promise.all(files.map((file) => uploadToCloudinary(file)));
  }

  console.warn(
    "[upload] Cloudinary is not configured. Images will be stored locally. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in backend/.env"
  );
  return Promise.all(files.map((file) => saveLocalFile(file)));
}

export function parseExistingImages(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).map((item) => item.trim()).filter(Boolean);
  }

  if (typeof raw !== "string" || !raw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(String).map((item) => item.trim()).filter(Boolean);
    }
  } catch {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function filenameFromUrl(imageUrl: string): string | null {
  try {
    const parsed = new URL(imageUrl, env.PUBLIC_API_URL);
    const base = path.basename(parsed.pathname);
    if (!base || base.includes("..")) return null;
    return base;
  } catch {
    const base = path.basename(imageUrl);
    if (!base || base.includes("..")) return null;
    return base;
  }
}

function cloudinaryPublicId(imageUrl: string): string | null {
  try {
    const parsed = new URL(imageUrl);
    if (!parsed.hostname.endsWith("res.cloudinary.com")) return null;
    const match = parsed.pathname.match(/\/maya-exports\/products\/([^/.]+)/);
    if (!match?.[1]) return null;
    return `maya-exports/products/${match[1]}`;
  } catch {
    return null;
  }
}

async function deleteLocalFile(imageUrl: string): Promise<void> {
  const filename = filenameFromUrl(imageUrl);
  if (!filename) return;
  try {
    await fs.unlink(path.join(UPLOAD_DIR, filename));
  } catch {
    // File may already be gone.
  }
}

export async function deleteUploadedImages(imageUrls: string[]): Promise<void> {
  const cloudinary = getCloudinary();
  await Promise.all(
    imageUrls.map(async (imageUrl) => {
      const publicId = cloudinaryPublicId(imageUrl);
      if (publicId && cloudinary) {
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch {
          // Remote file may already be gone.
        }
        return;
      }
      await deleteLocalFile(imageUrl);
    })
  );
}

export async function deleteLocalImages(imageUrls: string[]): Promise<void> {
  await deleteUploadedImages(imageUrls);
}

export function uniqueImages(images: string[]): string[] {
  return [...new Set(images.filter(Boolean))];
}
