export const PRODUCT_INFO_SECTION_KEYS = ["specs", "oem", "packing"] as const;

export type ProductInfoSectionKey = (typeof PRODUCT_INFO_SECTION_KEYS)[number];

export type ProductInfoItem = {
  heading: string;
  content: string;
};

export type ProductInfoSection = {
  key: ProductInfoSectionKey;
  items: ProductInfoItem[];
};

export function normalizeInfoSections(raw: unknown): ProductInfoSection[] {
  if (!Array.isArray(raw)) return [];

  const byKey = new Map<ProductInfoSectionKey, ProductInfoItem[]>();

  for (const section of raw) {
    if (!section || typeof section !== "object") continue;
    const key = String((section as { key?: unknown }).key) as ProductInfoSectionKey;
    if (!PRODUCT_INFO_SECTION_KEYS.includes(key)) continue;

    const items = Array.isArray((section as { items?: unknown }).items)
      ? ((section as { items: unknown[] }).items)
      : [];

    const cleaned = items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const heading = String((item as { heading?: unknown }).heading || "").trim();
        const content = String((item as { content?: unknown }).content || "").trim();
        if (!heading || !content) return null;
        return {
          heading: heading.slice(0, 120),
          content: content.slice(0, 1000),
        };
      })
      .filter((item): item is ProductInfoItem => Boolean(item))
      .slice(0, 6);

    byKey.set(key, cleaned);
  }

  return PRODUCT_INFO_SECTION_KEYS.map((key) => ({
    key,
    items: byKey.get(key) || [],
  })).filter((section) => section.items.length > 0);
}
