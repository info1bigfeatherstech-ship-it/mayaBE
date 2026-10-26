import app from "./app";
import { isCloudinaryConfigured } from "./config/cloudinary";
import { connectDatabase } from "./config/db";
import { env } from "./config/env";
import { seedAdminUser } from "./services/auth.service";
import { seedHeaderCategories, syncCategoryIndexes } from "./services/category.service";

async function start() {
  await connectDatabase();
  await syncCategoryIndexes();
  await seedAdminUser();
  await seedHeaderCategories();

  if (env.NODE_ENV === "production") {
    if (env.JWT_SECRET.includes("dev-jwt") || env.ADMIN_PASSWORD === "ChangeMeNow123!") {
      console.warn("Replace default JWT_SECRET and ADMIN_PASSWORD before going live");
    }
  }

  app.listen(env.PORT, () => {
    console.log(`Maya Exports API listening on ${env.PUBLIC_API_URL}`);
    if (isCloudinaryConfigured()) {
      console.log("Cloudinary image uploads are enabled");
    } else {
      console.warn(
        "Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to backend/.env"
      );
    }
  });
}

start().catch((error) => {
  console.error("Failed to start API:", error);
  process.exit(1);
});
