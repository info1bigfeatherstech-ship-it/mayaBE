import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const monthYearSchema = {
  month: { type: String, default: "", trim: true, maxlength: 20 },
  year: { type: String, default: "", trim: true, maxlength: 4 },
  _id: false,
};

const variantSchema = new Schema(
  {
    color: { type: String, required: true, trim: true, maxlength: 40 },
    size: { type: String, required: true, trim: true, maxlength: 40 },
    sku: { type: String, required: true, trim: true, maxlength: 80 },
    barcode: { type: String, default: "", trim: true, maxlength: 40 },
    stockQty: { type: Number, default: 0, min: 0, max: 100000000 },
    priceAdjustment: { type: Number, default: 0, min: -100000, max: 100000 },
    status: {
      type: String,
      enum: ["In Stock", "Low Stock", "Out of Stock"],
      default: "In Stock",
    },
  },
  { _id: false }
);

const productSchema = new Schema(
  {
    productCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 60,
    },
    sku: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "",
      index: true,
    },
    purchaseCode: { type: String, default: "", trim: true, maxlength: 60 },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator(value: string[]) {
          return Array.isArray(value) && value.length <= 5;
        },
        message: "A product can have a maximum of 5 images",
      },
    },
    attributes: {
      type: [
        {
          key: { type: String, required: true, trim: true, maxlength: 80 },
          value: { type: String, required: true, trim: true, maxlength: 200 },
          _id: false,
        },
      ],
      default: [],
      validate: {
        validator(value: unknown[]) {
          return Array.isArray(value) && value.length <= 20;
        },
        message: "A product can have a maximum of 20 attributes",
      },
    },
    infoSections: {
      type: [
        {
          key: {
            type: String,
            required: true,
            enum: ["specs", "oem", "packing"],
          },
          items: {
            type: [
              {
                heading: { type: String, required: true, trim: true, maxlength: 120 },
                content: { type: String, required: true, trim: true, maxlength: 1000 },
                _id: false,
              },
            ],
            default: [],
            validate: {
              validator(value: unknown[]) {
                return Array.isArray(value) && value.length <= 6;
              },
              message: "A section can have a maximum of 6 items",
            },
          },
          _id: false,
        },
      ],
      default: [],
      validate: {
        validator(value: unknown[]) {
          return Array.isArray(value) && value.length <= 3;
        },
        message: "A product can have a maximum of 3 info sections",
      },
    },
    productType: { type: String, default: "", trim: true, maxlength: 80 },
    gender: { type: String, default: "", trim: true, maxlength: 20 },
    ageGroup: { type: String, default: "", trim: true, maxlength: 20 },
    garmentCategory: { type: String, default: "", trim: true, maxlength: 40 },
    subcategory: { type: String, default: "", trim: true, maxlength: 80 },
    styleCollection: { type: String, default: "", trim: true, maxlength: 80 },
    season: { type: String, default: "", trim: true, maxlength: 40 },
    developmentDate: monthYearSchema,
    shipmentDate: monthYearSchema,
    fabric: { type: String, default: "", trim: true, maxlength: 80 },
    fabricComposition: { type: String, default: "", trim: true, maxlength: 120 },
    gsm: { type: String, default: "", trim: true, maxlength: 20 },
    pattern: { type: String, default: "", trim: true, maxlength: 80 },
    color: { type: String, default: "", trim: true, maxlength: 40 },
    availableColors: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: 40,
        },
      ],
      default: [],
      validate: {
        validator(value: unknown[]) {
          return Array.isArray(value) && value.length <= 30;
        },
        message: "A product can have a maximum of 30 colors",
      },
    },
    sizeRange: { type: String, default: "", trim: true, maxlength: 120 },
    variant: { type: String, enum: ["Yes", "No"], default: "No" },
    variantDetails: {
      type: [variantSchema],
      default: [],
      validate: {
        validator(value: unknown[]) {
          return Array.isArray(value) && value.length <= 200;
        },
        message: "A product can have a maximum of 200 variants",
      },
    },
    factory: { type: Schema.Types.ObjectId, ref: "Factory", default: null },
    factoryPriceEXW: { type: String, default: "", trim: true, maxlength: 40 },
    salePrice: { type: String, default: "", trim: true, maxlength: 40 },
    fobPrice: { type: String, default: "", trim: true, maxlength: 40 },
    fobPort: { type: String, default: "", trim: true, maxlength: 80 },
    moq: { type: String, default: "", trim: true, maxlength: 40 },
    quantityUnit: { type: String, default: "Pcs", trim: true, maxlength: 20 },
    readyStockAvailability: { type: String, enum: ["Yes", "No"], default: "No" },
    readyStockQuantity: { type: String, default: "", trim: true, maxlength: 40 },
    readyStockQuantityUnit: { type: String, default: "Pcs", trim: true, maxlength: 20 },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    customerStyleCode: { type: String, default: "", trim: true, maxlength: 40 },
    repeatOrder: { type: String, enum: ["Yes", "No"], default: "No" },
    repeatOrderNumber: {
      type: String,
      enum: ["None", "1st", "2nd", "3rd"],
      default: "None",
    },
    productStatus: { type: String, enum: ["Active", "Inactive"], default: "Active", index: true },
    featuredProduct: { type: String, enum: ["Yes", "No"], default: "No" },
    marketSuitability: { type: [String], default: [] },
  },
  { timestamps: true }
);

export type ProductDocument = InferSchemaType<typeof productSchema> & {
  _id: Types.ObjectId;
};

export const Product = model("Product", productSchema);
