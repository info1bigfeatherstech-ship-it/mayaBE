import { extraVariantSku, serialVariantSku } from "../utils/variantSku";

function uniqueTrimmed(values: unknown[], max = 30): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = String(value || "").trim();
    const key = next.toLowerCase();
    if (!next || seen.has(key)) continue;
    seen.add(key);
    out.push(next);
    if (out.length >= max) break;
  }
  return out;
}

function publicMoq(moq: string, unit: string): string {
  const qty = String(moq || "").trim();
  if (!qty) return "";
  if (/[a-zA-Z]/.test(qty)) return qty;
  const suffix = String(unit || "Pcs").trim();
  return suffix ? `${qty} ${suffix}` : qty;
}

function publicFabric(data: Record<string, unknown>): string {
  const gsm = String(data.gsm || "").trim();
  const fabric = String(data.fabric || "").trim();
  const composition = String(data.fabricComposition || "").trim();
  if (composition) return gsm ? `${gsm}GSM ${composition}` : composition;
  if (fabric) return gsm ? `${gsm}GSM ${fabric}` : fabric;
  return gsm ? `${gsm} GSM` : "";
}

function publicColorways(data: Record<string, any>): string[] {
  const listed = uniqueTrimmed(data.availableColors || []);
  if (listed.length) return listed;
  const primary = String(data.color || "").trim();
  return primary ? [primary] : [];
}

function publicSizing(data: Record<string, any>): string {
  const sizing = String(data.sizeRange || "").trim();
  if (!sizing) return "";
  const gender = String(data.gender || "").trim();
  if (gender === "Men" || gender === "Women") {
    if (sizing.toLowerCase().startsWith(`${gender.toLowerCase()}'s`)) return sizing;
    return `${gender}'s ${sizing}`;
  }
  return sizing;
}

export type PublicListing = {
  moq: string;
  fabric: string;
  sizing: string;
  colorways: string[];
  fobPort: string;
  pattern: string;
};

export type PublicOptionAttribute = {
  key: string;
  value: string;
};

export type PublicOptionVariant = {
  code: string;
  title: string;
  description: string;
  images: string[];
  attributes: PublicOptionAttribute[];
  primary?: boolean;
  children?: PublicOptionVariant[];
};

export type PublicOptions = {
  variants: PublicOptionVariant[];
};

export function publicListing(data: Record<string, any>): PublicListing {
  return {
    moq: publicMoq(data.moq, data.quantityUnit),
    fabric: publicFabric(data),
    sizing: publicSizing(data),
    colorways: publicColorways(data),
    fobPort: String(data.fobPort || "").trim(),
    pattern: String(data.pattern || "").trim(),
  };
}

function optionAttributes(row: Record<string, any>): PublicOptionAttribute[] {
  const attributes: PublicOptionAttribute[] = (row.attributes || [])
    .map((item: { key?: string; value?: string }) => ({
      key: String(item.key || "").trim(),
      value: String(item.value || "").trim(),
    }))
    .filter((item: PublicOptionAttribute) => item.key && item.value);
  if (row.color && !attributes.some((item) => item.key.toLowerCase() === "color")) {
    attributes.unshift({ key: "Color", value: String(row.color).trim() });
  }
  if (row.size && !attributes.some((item) => item.key.toLowerCase() === "size")) {
    const colorOffset = attributes.some((item) => item.key.toLowerCase() === "color") ? 1 : 0;
    attributes.splice(colorOffset, 0, { key: "Size", value: String(row.size).trim() });
  }
  return attributes;
}

function resolvedImages(own: unknown[], fallback: string[]): string[] {
  const images = uniqueTrimmed(own || [], 5);
  return images.length ? images : fallback;
}

function publicChildren(
  rows: Record<string, any>[] | undefined,
  parentSku: string,
  parentImages: string[]
): PublicOptionVariant[] {
  const children: PublicOptionVariant[] = [];
  for (const [index, row] of (rows || []).entries()) {
    if (String(row.status || "In Stock") === "Out of Stock") continue;
    children.push({
      code: `${parentSku}-${index + 1}`,
      title: String(row.title || "").trim(),
      description: "",
      images: resolvedImages(row.images || [], parentImages),
      attributes: optionAttributes(row),
      primary: false,
    });
    if (children.length >= 20) break;
  }
  return children;
}

export function publicOptions(data: Record<string, any>): PublicOptions | undefined {
  const productCode = String(data.productCode || "");
  const productImages = uniqueTrimmed(data.images || [], 5);
  const extras: PublicOptionVariant[] = [];

  if (data.variant === "Yes") {
    for (const [index, row] of (data.variantDetails || []).entries()) {
      if (String(row.status || "In Stock") === "Out of Stock") continue;
      const code = extraVariantSku(productCode, index);
      const images = resolvedImages(row.images || [], productImages);
      extras.push({
        code,
        title: String(row.title || "").trim(),
        description: String(row.description || "").trim(),
        images,
        attributes: optionAttributes(row),
        primary: false,
        children: publicChildren(row.subVariants, code, images),
      });
      if (extras.length >= 200) break;
    }
  }

  const primaryCode = serialVariantSku(productCode, 0);
  const primaryChildren = publicChildren(data.primarySubVariants, primaryCode, productImages);
  if (extras.length === 0 && primaryChildren.length === 0) return undefined;

  return {
    variants: [
      {
        code: primaryCode,
        title: "",
        description: "",
        images: productImages,
        attributes: optionAttributes({ color: data.color, size: "", attributes: [] }),
        primary: true,
        children: primaryChildren,
      },
      ...extras,
    ],
  };
}
