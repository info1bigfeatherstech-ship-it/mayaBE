import { ApiError } from "./ApiError";

type LeanDoc = Record<string, unknown>;

type Findable = {
  findOne: (filter: Record<string, unknown>) => {
    sort: (sort: Record<string, 1 | -1>) => {
      select: (field: string) => {
        lean: () => Promise<LeanDoc | null>;
      };
    };
  };
};

export async function nextPrefixedCode(model: Findable, field: string, letter: string): Promise<string> {
  const year = String(new Date().getFullYear()).slice(-2);
  const prefix = `${letter}${year}-`;
  const latest = await model
    .findOne({ [field]: { $regex: `^${prefix}` } })
    .sort({ [field]: -1 })
    .select(field)
    .lean();

  let next = 1;
  const raw = latest ? String(latest[field] || "") : "";
  const serial = raw.split("-")[1];
  const parsed = Number(serial);
  if (Number.isFinite(parsed) && parsed >= 0) {
    next = parsed + 1;
  }

  if (next > 999) {
    throw new ApiError(409, "Yearly code sequence is full. Contact support to extend codes.");
  }

  return `${prefix}${String(next).padStart(3, "0")}`;
}
