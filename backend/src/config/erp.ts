export const YES_NO = ["Yes", "No"] as const;
export const PRODUCT_STATUSES = ["Active", "Inactive"] as const;
export const PRODUCT_TYPES = ["New Developed", "Shipment Sample", "Customer Sample"] as const;
export const GENDERS = ["Women", "Men", "Unisex"] as const;
export const AGE_GROUPS = ["Newborn", "Infant", "Toddler", "Kids", "Teen", "Adult"] as const;
export const GARMENT_CATEGORIES = [
  "Dress",
  "Top",
  "Shirt",
  "Trousers",
  "Outerwear",
  "Knitwear",
  "Other",
] as const;
export const QUANTITY_UNITS = [
  "Pcs",
  "Sets",
  "Dozens",
  "Pairs",
  "Yards",
  "Meters",
  "Packs",
  "Cartons",
] as const;
export const MARKETS = ["USA", "UK", "Europe", "UAE"] as const;
export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
export const VARIANT_STATUSES = ["In Stock", "Low Stock", "Out of Stock"] as const;
export const REPEAT_NUMBERS = ["None", "1st", "2nd", "3rd"] as const;
export const SIZE_PRESETS = ["S, M, L, XL", "XS, S, M, L, XL, XXL", "28, 30, 32, 34, 36", "Free Size"] as const;
export const SEASON_PRESETS = ["SS26", "AW26", "Resort", "Holiday"] as const;
export const COLLECTION_PRESETS = ["Summer Collection", "Winter Collection", "Resort", "Core"] as const;

export type YesNo = (typeof YES_NO)[number];
