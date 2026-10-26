import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const customerSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 20,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    country: { type: String, default: "", trim: true, maxlength: 80 },
    tier: {
      type: String,
      default: "Wholesale",
      enum: ["Key Account", "Retail Brand", "Boutique", "Wholesale"],
    },
    primaryContact: { type: String, default: "", trim: true, maxlength: 80 },
    email: { type: String, default: "", trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

export type CustomerDocument = InferSchemaType<typeof customerSchema> & {
  _id: Types.ObjectId;
};

export const Customer = model("Customer", customerSchema);
