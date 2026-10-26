import mongoose from "mongoose";
import { Factory } from "../models/Factory";
import { Product } from "../models/Product";
import { ApiError } from "../utils/ApiError";
import { nextPrefixedCode } from "../utils/prefixedCode";
import type { FactoryInput } from "../validators/factory.validator";

function serialize(factory: {
  _id: unknown;
  code: string;
  name: string;
  country?: string;
  city?: string;
  contactPerson?: string;
  phone?: string;
}) {
  return {
    id: String(factory._id),
    code: factory.code,
    name: factory.name,
    country: factory.country || "",
    city: factory.city || "",
    contactPerson: factory.contactPerson || "",
    phone: factory.phone || "",
  };
}

export async function listFactories() {
  const rows = await Factory.find().sort({ name: 1 });
  return rows.map(serialize);
}

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

export async function createFactory(input: FactoryInput) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const code = await nextPrefixedCode(Factory, "code", "F");
      const factory = await Factory.create({
        code,
        name: input.name.trim(),
        country: input.country || "",
        city: input.city || "",
        contactPerson: input.contactPerson || "",
        phone: input.phone || "",
      });
      return serialize(factory);
    } catch (error) {
      if (!isDuplicateKey(error) || attempt === 2) throw error;
    }
  }
  throw new ApiError(409, "Unable to assign a factory code. Try again.");
}

export async function updateFactory(id: string, input: FactoryInput) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Invalid factory id");
  const factory = await Factory.findById(id);
  if (!factory) throw new ApiError(404, "Factory not found");
  factory.name = input.name.trim();
  factory.country = input.country || "";
  factory.city = input.city || "";
  factory.contactPerson = input.contactPerson || "";
  factory.phone = input.phone || "";
  await factory.save();
  return serialize(factory);
}

export async function deleteFactory(id: string) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Invalid factory id");
  const factory = await Factory.findById(id);
  if (!factory) throw new ApiError(404, "Factory not found");
  const used = await Product.countDocuments({ factory: factory._id });
  if (used > 0) {
    throw new ApiError(409, "This factory is used by products. Reassign those products first.");
  }
  await factory.deleteOne();
  return { id };
}
