import type { Request, Response } from "express";
import { createFactory, deleteFactory, listFactories, updateFactory } from "../services/factory.service";
import { successResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const getFactories = asyncHandler(async (_req: Request, res: Response) => {
  const factories = await listFactories();
  res.status(200).json(successResponse("Factories fetched", factories));
});

export const postFactory = asyncHandler(async (req: Request, res: Response) => {
  const factory = await createFactory(req.body);
  res.status(201).json(successResponse("Factory created", factory));
});

export const putFactory = asyncHandler(async (req: Request, res: Response) => {
  const factory = await updateFactory(req.params.id, req.body);
  res.status(200).json(successResponse("Factory updated", factory));
});

export const removeFactory = asyncHandler(async (req: Request, res: Response) => {
  const result = await deleteFactory(req.params.id);
  res.status(200).json(successResponse("Factory deleted", result));
});
