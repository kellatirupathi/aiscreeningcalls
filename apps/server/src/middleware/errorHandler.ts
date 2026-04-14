import type { NextFunction, Request, Response } from "express";

export function errorHandler(error: Error, _req: Request, res: Response, _next: NextFunction) {
  res.status(500).json({
    message: error.message || "Unexpected server error"
  });
}
