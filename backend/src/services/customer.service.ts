import mongoose from "mongoose";
import { Customer } from "../models/Customer";
import { Product } from "../models/Product";
import { ApiError } from "../utils/ApiError";
import { nextPrefixedCode } from "../utils/prefixedCode";
import type { CustomerInput } from "../validators/customer.validator";

function serialize(customer: {
  _id: unknown;
  code: string;
  name: string;
  country?: string;
  tier?: string;
  primaryContact?: string;
  email?: string;
}) {
  return {
    id: String(customer._id),
    code: customer.code,
    name: customer.name,
    country: customer.country || "",
    tier: customer.tier || "Wholesale",
    primaryContact: customer.primaryContact || "",
    email: customer.email || "",
  };
}

export async function listCustomers() {
  const rows = await Customer.find().sort({ name: 1 });
  return rows.map(serialize);
}

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

export async function createCustomer(input: CustomerInput) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const code = await nextPrefixedCode(Customer, "code", "C");
      const customer = await Customer.create({
        code,
        name: input.name.trim(),
        country: input.country || "",
        tier: input.tier || "Wholesale",
        primaryContact: input.primaryContact || "",
        email: input.email || "",
      });
      return serialize(customer);
    } catch (error) {
      if (!isDuplicateKey(error) || attempt === 2) throw error;
    }
  }
  throw new ApiError(409, "Unable to assign a customer code. Try again.");
}

export async function updateCustomer(id: string, input: CustomerInput) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Invalid customer id");
  const customer = await Customer.findById(id);
  if (!customer) throw new ApiError(404, "Customer not found");
  customer.name = input.name.trim();
  customer.country = input.country || "";
  customer.tier = input.tier || "Wholesale";
  customer.primaryContact = input.primaryContact || "";
  customer.email = input.email || "";
  await customer.save();
  return serialize(customer);
}

export async function deleteCustomer(id: string) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Invalid customer id");
  const customer = await Customer.findById(id);
  if (!customer) throw new ApiError(404, "Customer not found");
  const used = await Product.countDocuments({
    $or: [{ customer: customer._id }, { "customerAssignments.customer": customer._id }],
  });
  if (used > 0) {
    throw new ApiError(409, "This customer is used by products. Reassign those products first.");
  }
  await customer.deleteOne();
  return { id };
}
