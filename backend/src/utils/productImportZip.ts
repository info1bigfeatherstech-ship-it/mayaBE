import path from "path";
import AdmZip from "adm-zip";
import { ApiError } from "./ApiError";
import { IMPORT_LIMITS, matchImageFolder } from "./productImportParse";

const IGNORED_NAMES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

export type ZipImageFile = {
  filename: string;
  buffer: Buffer;
  mimetype: string;
};

export type ZipExtractResult = {
  folders: Map<string, ZipImageFile[]>;
  skipped: Array<{ folder: string; reason: string }>;
  warnings: string[];
};

function sniffImage(buffer: Buffer): { ext: string; mimetype: string } | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: ".jpg", mimetype: "image/jpeg" };
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: ".png", mimetype: "image/png" };
  }
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { ext: ".webp", mimetype: "image/webp" };
  }
  return null;
}

function safeEntryParts(entryName: string): string[] | null {
  const normalized = entryName.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length) return null;
  if (parts.some((part) => part === "." || part === ".." || part.includes(".."))) return null;
  return parts;
}

function compareFilenames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function extractImportZip(buffer: Buffer, parentCodes: Iterable<string>): ZipExtractResult {
  if (!buffer?.length) {
    throw new ApiError(400, "The ZIP file is empty");
  }
  if (buffer.length > IMPORT_LIMITS.maxZipBytes) {
    throw new ApiError(400, "The ZIP file must be 80MB or smaller");
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new ApiError(400, "The images file must be a valid ZIP archive");
  }

  const parents = new Set(
    [...parentCodes].map((code) => code.trim().toUpperCase()).filter(Boolean)
  );
  const folders = new Map<string, ZipImageFile[]>();
  const skipped: Array<{ folder: string; reason: string }> = [];
  const warnings: string[] = [];
  const skippedKeys = new Set<string>();
  let uncompressed = 0;
  let fileCount = 0;

  const noteSkip = (folder: string, reason: string) => {
    const key = `${folder}::${reason}`;
    if (skippedKeys.has(key)) return;
    skippedKeys.add(key);
    skipped.push({ folder, reason });
  };

  let entries: AdmZip.IZipEntry[];
  try {
    entries = zip.getEntries();
  } catch {
    throw new ApiError(400, "The ZIP archive could not be read");
  }

  for (const entry of entries) {
    if (!entry || entry.isDirectory) continue;
    const parts = safeEntryParts(entry.entryName);
    if (!parts) {
      noteSkip(entry.entryName, "Unsafe file path was skipped");
      continue;
    }
    if (parts[0] === "__MACOSX") continue;
    const filename = parts[parts.length - 1];
    if (!filename || filename.startsWith(".")) continue;
    if (IGNORED_NAMES.has(filename.toLowerCase())) continue;
    if (parts.length < 2) {
      noteSkip("(root)", `${filename} must sit inside a folder named after the variant code`);
      continue;
    }

    const folder = parts[parts.length - 2].trim().toUpperCase();
    const match = matchImageFolder(folder, parents);
    if (!match) {
      noteSkip(folder, "Folder name does not match a product code in the spreadsheet");
      continue;
    }

    const size = Number(entry.header?.size || 0);
    uncompressed += Number.isFinite(size) ? size : 0;
    if (uncompressed > IMPORT_LIMITS.maxUncompressedBytes) {
      throw new ApiError(400, "Uncompressed ZIP contents exceed 200MB");
    }

    fileCount += 1;
    if (fileCount > IMPORT_LIMITS.maxZipFiles) {
      throw new ApiError(400, `A ZIP can contain a maximum of ${IMPORT_LIMITS.maxZipFiles} files`);
    }

    let data: Buffer;
    try {
      data = entry.getData();
    } catch {
      noteSkip(folder, `Could not read ${filename}`);
      continue;
    }

    if (!data?.length) {
      noteSkip(folder, `${filename} is empty`);
      continue;
    }
    if (data.length > IMPORT_LIMITS.maxImageBytes) {
      noteSkip(folder, `${filename} is larger than 8MB`);
      continue;
    }

    const sniffed = sniffImage(data);
    if (!sniffed) {
      noteSkip(folder, `${filename} is not a JPG, PNG, or WEBP image`);
      continue;
    }

    const key = match.subSerial ? `${match.parentCode}-${match.subSerial}` : match.parentCode;
    const current = folders.get(key) || [];
    current.push({
      filename: `${path.basename(filename, path.extname(filename))}${sniffed.ext}`,
      buffer: data,
      mimetype: sniffed.mimetype,
    });
    folders.set(key, current);
  }

  for (const [folder, files] of folders) {
    files.sort((a, b) => compareFilenames(a.filename, b.filename));
    if (files.length > IMPORT_LIMITS.maxImagesPerFolder) {
      warnings.push(`Folder ${folder} has ${files.length} images; only the first 5 were used`);
      folders.set(folder, files.slice(0, IMPORT_LIMITS.maxImagesPerFolder));
    }
  }

  return { folders, skipped, warnings };
}

export function asMulterFile(
  fieldname: string,
  file: ZipImageFile
): Express.Multer.File {
  return {
    fieldname,
    originalname: file.filename,
    encoding: "7bit",
    mimetype: file.mimetype,
    size: file.buffer.length,
    buffer: file.buffer,
    destination: "",
    filename: file.filename,
    path: "",
    stream: undefined as unknown as Express.Multer.File["stream"],
  };
}
