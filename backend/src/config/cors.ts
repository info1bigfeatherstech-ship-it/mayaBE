import type { CorsOptions } from "cors";
import { env } from "./env";

const allowedOrigins = new Set(
  env.CLIENT_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
