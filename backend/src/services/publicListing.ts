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
  if (primary) return [primary];
  if (data.variant === "Yes") {
    return uniqueTrimmed((data.variantDetails || []).map((row: { color?: string }) => row.color));
  }
  return [];
}

function publicSizing(data: Record<string, any>): string {
  const range = String(data.sizeRange || "").trim();
  const fromVariants =
    data.variant === "Yes"
      ? uniqueTrimmed((data.variantDetails || []).map((row: { size?: string }) => row.size)).join(", ")
      : "";
  const sizing = range || fromVariants;
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
