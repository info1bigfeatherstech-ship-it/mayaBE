import type { Request, Response } from "express";
import {
  createCategory,
  deleteCategory,
  getCategoryBySlug,
  listCategories,
  updateCategory,
} from "../services/category.service";
import { successResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const getCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await listCategories();
  res.status(200).json(successResponse("Categories fetched", categories));
});

export const getCategorySlug = asyncHandler(async (req: Request, res: Response) => {
  const category = await getCategoryBySlug(req.params.slug);
  res.status(200).json(successResponse("Category fetched", category));
});

export const postCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await createCategory(req.body);
  res.status(201).json(successResponse("Category created", category));
});

export const putCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await updateCategory(req.params.id, req.body);
  res.status(200).json(successResponse("Category updated", category));
});

export const removeCategory = asyncHandler(async (req: Request, res: Response) => {
  const result = await deleteCategory(req.params.id);
  res.status(200).json(successResponse("Category deleted", result));
});
