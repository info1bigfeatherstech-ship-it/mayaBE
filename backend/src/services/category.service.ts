import mongoose from "mongoose";
import { HEADER_CATEGORY_TREE, type HeaderCategorySeed } from "../config/headerCategories";
import { Category } from "../models/Category";
import { Product } from "../models/Product";
import { ApiError } from "../utils/ApiError";
import { slugify } from "../utils/slugify";
import type { CategoryInput } from "../validators/category.validator";

const MAX_DEPTH = 5;

type CategoryLean = {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  parent?: mongoose.Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId: string | null;
  path: string;
  depth: number;
  productCount: number;
  childCount: number;
  children: CategoryNode[];
  createdAt?: Date;
  updatedAt?: Date;
};

export async function syncCategoryIndexes(): Promise<void> {
  try {
    await Category.collection.dropIndex("name_1");
  } catch {
    // Old unique name index may not exist on a fresh database.
  }
  await Category.syncIndexes();
}

async function uniqueSlug(baseName: string, excludeId?: string): Promise<string> {
  const base = slugify(baseName);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const query: Record<string, unknown> = { slug: candidate };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    const exists = await Category.exists(query);
    if (!exists) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

async function assertValidParent(parentId: string | null, excludeId?: string) {
  if (!parentId) return null;

  if (!mongoose.isValidObjectId(parentId)) {
    throw new ApiError(400, "Invalid parent category");
  }
  if (excludeId && parentId === excludeId) {
    throw new ApiError(400, "A category cannot be inside itself");
  }

  const parent = await Category.findById(parentId);
  if (!parent) {
    throw new ApiError(404, "Parent category not found");
  }

  return parent;
}

async function getDepth(categoryId: string | null): Promise<number> {
  if (!categoryId) return -1;

  let depth = 0;
  let nextId: string | null = categoryId;
  const seen = new Set<string>();

  while (nextId) {
    if (seen.has(nextId)) {
      throw new ApiError(400, "Invalid category tree");
    }
    seen.add(nextId);

    const row = (await Category.findById(nextId).select("parent").lean()) as {
      parent?: mongoose.Types.ObjectId | null;
    } | null;
    if (!row) break;

    const parentId: string | null = row.parent ? String(row.parent) : null;
    nextId = parentId;
    if (parentId) depth += 1;
    if (depth > MAX_DEPTH + 2) {
      throw new ApiError(400, "Invalid category tree");
    }
  }

  return depth;
}

async function getDescendantIds(categoryId: string): Promise<string[]> {
  const ids: string[] = [];
  const queue = [categoryId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const children = await Category.find({ parent: current }).select("_id");
    for (const child of children) {
      const childId = String(child._id);
      ids.push(childId);
      queue.push(childId);
    }
  }

  return ids;
}

async function getSubtreeHeight(categoryId: string): Promise<number> {
  const children = await Category.find({ parent: categoryId }).select("_id");
  if (children.length === 0) return 0;
  const heights = await Promise.all(children.map((child) => getSubtreeHeight(String(child._id))));
  return 1 + Math.max(...heights);
}

export async function getCategoryAndDescendantIds(categoryId: string): Promise<string[]> {
  await getCategoryById(categoryId);
  const descendants = await getDescendantIds(categoryId);
  return [categoryId, ...descendants];
}

export async function buildCategoryPathMap(): Promise<Map<string, string>> {
  const all = (await Category.find().sort({ name: 1 }).lean()) as CategoryLean[];
  const byId = new Map(all.map((category) => [String(category._id), category]));
  const paths = new Map<string, string>();

  const pathOf = (id: string): string => {
    const cached = paths.get(id);
    if (cached) return cached;
    const category = byId.get(id);
    if (!category) return "";
    const parentId = category.parent ? String(category.parent) : null;
    const path = parentId ? `${pathOf(parentId)} / ${category.name}` : category.name;
    paths.set(id, path);
    return path;
  };

  for (const category of all) {
    pathOf(String(category._id));
  }

  return paths;
}

function buildTree(
  rows: Array<CategoryLean & { productCount: number }>,
  pathMap: Map<string, string>
): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();

  for (const row of rows) {
    const id = String(row._id);
    nodes.set(id, {
      id,
      name: row.name,
      slug: row.slug,
      description: row.description || "",
      parentId: row.parent ? String(row.parent) : null,
      path: pathMap.get(id) || row.name,
      depth: (pathMap.get(id) || row.name).split(" / ").length - 1,
      productCount: row.productCount,
      childCount: 0,
      children: [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      const parent = nodes.get(node.parentId);
      if (parent) {
        parent.children.push(node);
        parent.childCount += 1;
      }
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (list: CategoryNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    list.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

export async function listCategories() {
  const [categories, productCounts] = await Promise.all([
    Category.find().lean() as Promise<CategoryLean[]>,
    Product.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]),
  ]);

  const countMap = new Map(productCounts.map((item) => [String(item._id), item.count]));
  const pathMap = await buildCategoryPathMap();
  const rows = categories.map((category) => ({
    ...category,
    productCount: countMap.get(String(category._id)) || 0,
  }));

  return buildTree(rows, pathMap);
}

async function serializeOne(id: string): Promise<CategoryNode> {
  const tree = await listCategories();
  const stack = [...tree];
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node) continue;
    if (node.id === id) return node;
    stack.push(...node.children);
  }
  throw new ApiError(404, "Category not found");
}

export async function createCategory(input: CategoryInput) {
  const name = input.name.trim();
  const parent = await assertValidParent(input.parentId);
  const parentId = parent ? String(parent._id) : null;
  const parentDepth = await getDepth(parentId);
  const nextDepth = parentDepth + 1;

  if (nextDepth >= MAX_DEPTH) {
    throw new ApiError(400, `Categories can only nest ${MAX_DEPTH} levels deep`);
  }

  const siblingExists = await Category.exists({
    name,
    parent: parent?._id || null,
  });
  if (siblingExists) {
    throw new ApiError(409, "A category with this name already exists at this level");
  }

  const category = await Category.create({
    name,
    slug: await uniqueSlug(name),
    description: input.description?.trim() || "",
    parent: parent?._id || null,
  });

  return serializeOne(String(category._id));
}

export async function updateCategory(id: string, input: CategoryInput) {
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid category id");
  }

  const category = await Category.findById(id);
  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  const parent = await assertValidParent(input.parentId, id);
  const parentId = parent ? String(parent._id) : null;

  if (parentId) {
    const descendants = await getDescendantIds(id);
    if (descendants.includes(parentId)) {
      throw new ApiError(400, "A category cannot be moved inside its own subcategory");
    }
  }

  const parentDepth = await getDepth(parentId);
  const nextDepth = parentDepth + 1;
  const subtreeHeight = await getSubtreeHeight(id);
  if (nextDepth + subtreeHeight >= MAX_DEPTH) {
    throw new ApiError(400, `Categories can only nest ${MAX_DEPTH} levels deep`);
  }

  const name = input.name.trim();
  const siblingExists = await Category.exists({
    name,
    parent: parent?._id || null,
    _id: { $ne: id },
  });
  if (siblingExists) {
    throw new ApiError(409, "A category with this name already exists at this level");
  }

  if (name !== category.name) {
    category.slug = await uniqueSlug(name, id);
  }
  category.name = name;
  category.description = input.description?.trim() || "";
  category.parent = parent?._id || null;
  await category.save();

  return serializeOne(id);
}

export async function deleteCategory(id: string) {
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid category id");
  }

  const category = await Category.findById(id);
  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  const childCount = await Category.countDocuments({ parent: category._id });
  if (childCount > 0) {
    throw new ApiError(409, "Delete subcategories first before deleting this category");
  }

  const productCount = await Product.countDocuments({ category: category._id });
  if (productCount > 0) {
    throw new ApiError(
      409,
      `Cannot delete this category because it has ${productCount} product${productCount === 1 ? "" : "s"}`
    );
  }

  await category.deleteOne();
  return { id };
}

function nodeMatchesSlug(node: CategoryNode, slug: string): boolean {
  const normalized = slugify(slug);
  return node.slug === slug || node.slug === normalized || slugify(node.name) === normalized;
}

export async function getCategoryBySlug(slug: string) {
  const tree = await listCategories();
  const matches: CategoryNode[] = [];
  const stack = [...tree];
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node) continue;
    if (nodeMatchesSlug(node, slug)) matches.push(node);
    stack.push(...node.children);
  }
  if (!matches.length) {
    throw new ApiError(404, "Category not found");
  }
  return (
    matches.find((node) => node.slug === slug) ||
    matches.find((node) => node.children.length === 0) ||
    matches[0]
  );
}

function namesMatch(a: string, b: string): boolean {
  return slugify(a) === slugify(b);
}

async function rehomeMatchingProducts(leafId: string, parentId: string, leafName: string) {
  const skip = new Set(["mens", "womens", "children", "childrens", "kids", "and"]);
  const tokens = slugify(leafName)
    .split("-")
    .filter((token) => token.length > 3 && !skip.has(token));
  if (!tokens.length) return;

  const products = await Product.find({ category: parentId });
  for (const product of products) {
    const hay = slugify(`${product.name} ${product.title} ${product.productCode}`);
    const matchesLeaf = tokens.some((token) => {
      const stem = token.replace(/s$/, "");
      return hay.includes(token) || (stem.length > 3 && hay.includes(stem));
    });
    if (matchesLeaf) {
      product.category = new mongoose.Types.ObjectId(leafId);
      await product.save();
    }
  }
}

async function upsertHeaderNode(node: HeaderCategorySeed, parentId: string | null): Promise<string> {
  const parent = parentId ? new mongoose.Types.ObjectId(parentId) : null;

  let category =
    (await Category.findOne({ parent, name: node.name })) ||
    (await Category.findOne({ parent, slug: node.slug })) ||
    (await Category.findOne({ slug: node.slug }).then((row) =>
      row && namesMatch(row.name, node.name) ? row : null
    ));

  if (!category) {
    const occupant = await Category.findOne({ slug: node.slug });
    if (occupant) {
      occupant.slug = await uniqueSlug(occupant.name, String(occupant._id));
      await occupant.save();
    }
    category = await Category.create({
      name: node.name,
      slug: node.slug,
      description: "",
      parent,
    });
  } else {
    const occupant = await Category.findOne({ slug: node.slug, _id: { $ne: category._id } });
    if (occupant) {
      occupant.slug = await uniqueSlug(occupant.name, String(occupant._id));
      await occupant.save();
    }
    category.name = node.name;
    category.slug = node.slug;
    category.parent = parent;
    await category.save();
  }

  const id = String(category._id);
  if (node.children?.length) {
    for (const child of node.children) {
      await upsertHeaderNode(child, id);
    }
  } else if (parentId) {
    await rehomeMatchingProducts(id, parentId, node.name);
  }
  return id;
}

export async function seedHeaderCategories(): Promise<void> {
  for (const root of HEADER_CATEGORY_TREE) {
    await upsertHeaderNode(root, null);
  }
}

export async function getCategoryById(id: string) {
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid category id");
  }
  const category = await Category.findById(id);
  if (!category) {
    throw new ApiError(404, "Category not found");
  }
  return category;
}

export function normalizeCategoryPath(input: string): string {
  return input
    .trim()
    .replace(/[>|\\]+/g, "/")
    .split("/")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" / ")
    .toLowerCase();
}

function lastPathSegment(path: string): string {
  const parts = path.split(" / ").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || path;
}

export async function findCategoryIdByPath(input: string): Promise<string> {
  const needle = normalizeCategoryPath(input);
  if (!needle) {
    throw new ApiError(400, "Category path is required");
  }

  const pathMap = await buildCategoryPathMap();
  const entries = [...pathMap.entries()];
  const exact = entries.filter(([, path]) => normalizeCategoryPath(path) === needle);
  if (exact.length === 1) return exact[0][0];
  if (exact.length > 1) {
    throw new ApiError(400, `Category path "${input}" matches more than one category`);
  }

  const leaf = lastPathSegment(needle);
  const leafMatches = entries.filter(([, path]) => lastPathSegment(normalizeCategoryPath(path)) === leaf);
  if (leafMatches.length === 1) return leafMatches[0][0];
  if (leafMatches.length > 1) {
    throw new ApiError(
      400,
      `Category "${input}" is ambiguous. Use the full path, e.g. Garments / Women / Women's Sweat Tops & Hoodies`
    );
  }

  throw new ApiError(400, `Category "${input}" was not found. Use the exact website category path`);
}
