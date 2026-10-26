import type { Request, Response } from "express";
import { createCustomer, deleteCustomer, listCustomers, updateCustomer } from "../services/customer.service";
import { successResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const getCustomers = asyncHandler(async (_req: Request, res: Response) => {
  const customers = await listCustomers();
  res.status(200).json(successResponse("Customers fetched", customers));
});

export const postCustomer = asyncHandler(async (req: Request, res: Response) => {
  const customer = await createCustomer(req.body);
  res.status(201).json(successResponse("Customer created", customer));
});

export const putCustomer = asyncHandler(async (req: Request, res: Response) => {
  const customer = await updateCustomer(req.params.id, req.body);
  res.status(200).json(successResponse("Customer updated", customer));
});

export const removeCustomer = asyncHandler(async (req: Request, res: Response) => {
  const result = await deleteCustomer(req.params.id);
  res.status(200).json(successResponse("Customer deleted", result));
});
