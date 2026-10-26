import path from "path";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import { corsOptions } from "./config/cors";
import { env } from "./config/env";
import { errorMiddleware } from "./middlewares/error.middleware";
import { requireTrustedOrigin } from "./middlewares/origin.middleware";
import { ensureUploadDirExists } from "./middlewares/upload.middleware";
import routes from "./routes";

ensureUploadDirExists();

const app = express();

app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(cors(corsOptions));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));
app.use("/api", requireTrustedOrigin, routes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use(errorMiddleware);

export default app;
