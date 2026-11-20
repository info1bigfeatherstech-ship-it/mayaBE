import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const importLogSchema = new Schema(
  {
    fileName: { type: String, required: true, trim: true, maxlength: 260 },
    importedBy: { type: String, required: true, trim: true, maxlength: 160 },
    importedAt: { type: Date, default: Date.now, index: true },
    rows: { type: Number, default: 0, min: 0 },
    families: { type: Number, default: 0, min: 0 },
    ok: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
  },
  { timestamps: false }
);

export type ImportLogDocument = InferSchemaType<typeof importLogSchema> & {
  _id: Types.ObjectId;
};

export const ImportLog = model("ImportLog", importLogSchema);
