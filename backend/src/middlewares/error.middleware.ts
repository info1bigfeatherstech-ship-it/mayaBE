import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details && env.NODE_ENV !== "production" ? { details: err.details } : {}),
    });
    return;
  }

  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ success: false, message: "Invalid request body" });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_COUNT"
        ? "A product can have a maximum of 5 images"
        : err.code === "LIMIT_FILE_SIZE"
          ? "Each image must be 5MB or smaller"
          : "Invalid image upload";
    res.status(400).json({ success: false, message });
    return;
  }

  if (err?.name === "ValidationError") {
    const first = Object.values(err.errors || {})[0] as { message?: string } | undefined;
    res.status(400).json({
      success: false,
      message: first?.message || "Validation failed",
    });
    return;
  }

  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || "field";
    res.status(409).json({
      success: false,
      message: `${field} already exists`,
    });
    return;
  }

  if (err?.name === "CastError") {
    res.status(400).json({ success: false, message: "Invalid id" });
    return;
  }

  if (err instanceof Error && err.message === "Origin is not allowed by CORS") {
    res.status(403).json({ success: false, message: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again",
  });
};
