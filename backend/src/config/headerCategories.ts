import { slugify } from "../utils/slugify";

export type HeaderCategorySeed = {
  name: string;
  slug: string;
  children?: HeaderCategorySeed[];
};

function leaf(name: string, slug?: string): HeaderCategorySeed {
  return { name, slug: slug || slugify(name) };
}

function branch(name: string, slug: string, children: HeaderCategorySeed[]): HeaderCategorySeed {
  return { name, slug, children };
}

const garmentItems: Record<string, string[]> = {
  Men: [
    "Men's Jackets",
    "Men's Sweat Top & Hoodies",
    "Men's Shirts",
    "Men's T-shirts",
    "Men's Shorts & Lowers",
    "Men's Jeans & Pants",
  ],
  Women: [
    "Women's Jackets & Blazers",
    "Women's Sweat Tops & Hoodies",
    "Women's Blouses & Shirts",
    "Women's T-shirts & Tops",
    "Women's Skirts & Shorts",
    "Women's Jeans & Trousers",
  ],
  Children: [
    "Children's Jackets & Outerwear",
    "Children's Hoodies & Sweat Tops",
    "Children's School Shirts",
    "Children's Graphic T-shirts",
    "Children's Shorts & Pants",
  ],
  Kids: [
    "Kids Outerwear & Rompers",
    "Kids Cotton T-shirts & Bodysuits",
    "Kids Sweatshirts & Sets",
    "Kids Soft Joggers & Leggings",
  ],
};

const footwearItems = ["Sports & Casual", "Slippers & Sandals", "Office Shoes"];
const footwearGroups = ["Men", "Women", "Children", "Kids"];

export const HEADER_CATEGORY_TREE: HeaderCategorySeed[] = [
  branch(
    "Garments",
    "garments",
    Object.entries(garmentItems).map(([group, items]) =>
      branch(
        group,
        slugify(`garments ${group}`),
        items.map((item) => leaf(item))
      )
    )
  ),
  branch(
    "Footwear",
    "footwear",
    footwearGroups.map((group) =>
      branch(
        group,
        slugify(`footwear ${group}`),
        footwearItems.map((item) =>
          leaf(item, slugify(`${group === "Men" ? "mens" : group.toLowerCase()} ${item}`))
        )
      )
    )
  ),
  leaf("Home Textiles", "home-textiles"),
  leaf("Fabrics", "fabrics"),
  leaf("Electronics & Appliances", "electronics-and-appliances"),
];
