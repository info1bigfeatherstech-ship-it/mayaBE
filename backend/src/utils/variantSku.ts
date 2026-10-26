export function serialVariantSku(productCode: string, index: number): string {
  const base = productCode.trim().toUpperCase() || "CODE";
  return `${base}-${index + 1}`;
}

export function extraVariantSku(productCode: string, extraIndex: number): string {
  return serialVariantSku(productCode, extraIndex + 1);
}
