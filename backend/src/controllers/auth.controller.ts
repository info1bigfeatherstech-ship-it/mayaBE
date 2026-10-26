import type { Request, Response } from "express";
import { clearAuthCookies, loginAdmin, setAuthCookie } from "../services/auth.service";
import { successResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await loginAdmin(req.body);
  clearAuthCookies(res);
  setAuthCookie(res, result.token);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(
    successResponse("Logged in successfully", {
      admin: result.admin,
    })
  );
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  clearAuthCookies(res);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(successResponse("Logged out successfully"));
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(
    successResponse("Session active", {
      admin: req.admin,
    })
  );
});
