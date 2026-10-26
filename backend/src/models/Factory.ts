import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const factorySchema = new Schema(
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
    city: { type: String, default: "", trim: true, maxlength: 80 },
    contactPerson: { type: String, default: "", trim: true, maxlength: 80 },
    phone: { type: String, default: "", trim: true, maxlength: 40 },
  },
  { timestamps: true }
);

export type FactoryDocument = InferSchemaType<typeof factorySchema> & {
  _id: Types.ObjectId;
};

export const Factory = model("Factory", factorySchema);
