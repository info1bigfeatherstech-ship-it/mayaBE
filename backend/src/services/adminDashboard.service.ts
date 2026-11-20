import { Category } from "../models/Category";
import { Customer } from "../models/Customer";
import { Factory } from "../models/Factory";
import { ImportLog } from "../models/ImportLog";
import { Product } from "../models/Product";
import {
  buildProductMatch,
  parseThreshold,
  type ProductMatchQuery,
} from "../utils/dashboardFilters";

type RootBucket = {
  categoryId: string;
  name: string;
  slug: string;
  count: number;
  demographics: Record<string, number>;
};

function pct(n: number, total: number): number {
  if (!total) return 0;
  return Math.round((n / total) * 1000) / 10;
}

function toIso(value: Date | string | undefined | null): string {
  if (!value) return new Date(0).toISOString();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

/** Convert string/number stock fields safely inside aggregations. */
const numericStockExpr = (fieldPath: string) => ({
  $convert: {
    input: fieldPath,
    to: "double",
    onError: 0,
    onNull: 0,
  },
});

export async function getDashboardSummary() {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [productFacet, totalCategories, totalFactories, totalCustomers] = await Promise.all([
    Product.aggregate([
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalProducts: { $sum: 1 },
                activeProducts: {
                  $sum: { $cond: [{ $eq: ["$productStatus", "Active"] }, 1, 0] },
                },
                inactiveProducts: {
                  $sum: { $cond: [{ $eq: ["$productStatus", "Inactive"] }, 1, 0] },
                },
                readyStockProducts: {
                  $sum: { $cond: [{ $eq: ["$readyStockAvailability", "Yes"] }, 1, 0] },
                },
                readyStockTotalUnits: {
                  $sum: {
                    $cond: [
                      { $eq: ["$readyStockAvailability", "Yes"] },
                      numericStockExpr("$readyStockQuantity"),
                      0,
                    ],
                  },
                },
              },
            },
          ],
          newThisMonth: [{ $match: { createdAt: { $gte: monthStart } } }, { $count: "n" }],
        },
      },
      {
        $project: {
          totals: { $arrayElemAt: ["$totals", 0] },
          newProductsThisMonth: {
            $ifNull: [{ $arrayElemAt: ["$newThisMonth.n", 0] }, 0],
          },
        },
      },
    ]),
    Category.countDocuments(),
    Factory.countDocuments(),
    Customer.countDocuments(),
  ]);

  const row = productFacet[0] || {};
  const t = row.totals || {};

  return {
    totalProducts: t.totalProducts || 0,
    activeProducts: t.activeProducts || 0,
    inactiveProducts: t.inactiveProducts || 0,
    totalCategories,
    readyStockProducts: t.readyStockProducts || 0,
    readyStockTotalUnits: Math.round(t.readyStockTotalUnits || 0),
    totalFactories,
    totalCustomers,
    newProductsThisMonth: row.newProductsThisMonth || 0,
  };
}

export async function getCategoryDistribution(query: ProductMatchQuery) {
  const match = buildProductMatch(query);

  const rows = await Product.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "cat",
      },
    },
    { $unwind: "$cat" },
    {
      $graphLookup: {
        from: "categories",
        startWith: "$cat._id",
        connectFromField: "parent",
        connectToField: "_id",
        as: "chain",
        maxDepth: 8,
      },
    },
    {
      $addFields: {
        root: {
          $arrayElemAt: [
            {
              $filter: {
                input: "$chain",
                as: "c",
                cond: {
                  $or: [{ $eq: ["$$c.parent", null] }, { $not: ["$$c.parent"] }],
                },
              },
            },
            0,
          ],
        },
      },
    },
    {
      $addFields: {
        demo: {
          $arrayElemAt: [
            {
              $filter: {
                input: "$chain",
                as: "c",
                cond: { $eq: ["$$c.parent", "$root._id"] },
              },
            },
            0,
          ],
        },
      },
    },
    {
      $match: {
        "root._id": { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: {
          rootId: "$root._id",
          rootName: "$root.name",
          rootSlug: "$root.slug",
          demo: "$demo.name",
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const roots = new Map<string, RootBucket>();
  let total = 0;

  for (const r of rows) {
    const rootId = r._id?.rootId;
    if (!rootId) continue;
    const key = String(rootId);
    if (!roots.has(key)) {
      roots.set(key, {
        categoryId: key,
        name: r._id.rootName || "Unknown",
        slug: r._id.rootSlug || "",
        count: 0,
        demographics: {},
      });
    }
    const node = roots.get(key)!;
    node.count += r.count;
    total += r.count;

    const demoRaw = typeof r._id.demo === "string" ? r._id.demo.trim() : "";
    if (demoRaw) {
      // Demographic level only: Men / Women / Kids (Children normalized to Kids).
      const label = demoRaw === "Children" ? "Kids" : demoRaw;
      // Roots without a real demographic tier (Home Textiles, Fabrics) often have
      // the leaf as direct child of root — skip non-demographic labels.
      if (label === "Men" || label === "Women" || label === "Kids") {
        node.demographics[label] = (node.demographics[label] || 0) + r.count;
      }
    }
  }

  const byRootCategory = [...roots.values()]
    .sort((a, b) => b.count - a.count)
    .map((n) => ({
      categoryId: n.categoryId,
      name: n.name,
      slug: n.slug,
      count: n.count,
      percentage: pct(n.count, total),
      demographics: Object.entries(n.demographics)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    }));

  return { totalProducts: total, byRootCategory };
}

export async function getMarketAndBuyerAnalytics(query: ProductMatchQuery) {
  const match = buildProductMatch(query);

  const [facet, tierRows] = await Promise.all([
    Product.aggregate([
      { $match: match },
      {
        $addFields: {
          repeatEntries: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$customerAssignments", []] } }, 0] },
              "$customerAssignments",
              [
                {
                  repeatOrder: { $ifNull: ["$repeatOrder", "No"] },
                  repeatOrderNumber: { $ifNull: ["$repeatOrderNumber", "None"] },
                },
              ],
            ],
          },
        },
      },
      {
        $facet: {
          total: [{ $count: "n" }],
          markets: [
            { $unwind: { path: "$marketSuitability", preserveNullAndEmptyArrays: false } },
            { $match: { marketSuitability: { $type: "string", $ne: "" } } },
            { $group: { _id: "$marketSuitability", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          repeatStyles: [
            {
              $match: {
                repeatEntries: { $elemMatch: { repeatOrder: "Yes" } },
              },
            },
            { $count: "n" },
          ],
          byNumber: [
            { $unwind: "$repeatEntries" },
            { $match: { "repeatEntries.repeatOrder": "Yes" } },
            {
              $match: {
                "repeatEntries.repeatOrderNumber": { $nin: [null, "", "None"] },
              },
            },
            {
              $group: {
                _id: {
                  p: "$_id",
                  n: "$repeatEntries.repeatOrderNumber",
                },
              },
            },
            { $group: { _id: "$_id.n", styles: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]),
    Customer.aggregate([
      { $group: { _id: { $ifNull: ["$tier", "Wholesale"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const f = facet[0] || { total: [], markets: [], repeatStyles: [], byNumber: [] };
  const totalProducts = f.total[0]?.n || 0;
  const repeatStyles = f.repeatStyles[0]?.n || 0;

  return {
    totalProducts,
    marketDistribution: (f.markets || []).map(
      (m: { _id: string; count: number }) => ({
        market: m._id,
        count: m.count,
        percentage: pct(m.count, totalProducts),
      })
    ),
    buyerTiers: (tierRows || []).map((t: { _id: string; count: number }) => ({
      tier: t._id,
      count: t.count,
    })),
    repeatOrderStats: {
      repeatStyles,
      nonRepeatStyles: Math.max(0, totalProducts - repeatStyles),
      percentage: pct(repeatStyles, totalProducts),
      byOrderNumber: (f.byNumber || []).map((b: { _id: string; styles: number }) => ({
        repeatOrderNumber: b._id,
        styles: b.styles,
      })),
    },
  };
}

export async function getFactoryWorkload() {
  const data = await Factory.aggregate([
    {
      $lookup: {
        from: "products",
        let: { fid: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$factory", "$$fid"] } } },
          {
            $group: {
              _id: null,
              assigned: { $sum: 1 },
              ready: {
                $sum: {
                  $cond: [{ $eq: ["$readyStockAvailability", "Yes"] }, 1, 0],
                },
              },
            },
          },
        ],
        as: "stats",
      },
    },
    {
      $project: {
        _id: 0,
        factoryId: "$_id",
        factoryCode: "$code",
        factoryName: "$name",
        country: { $ifNull: ["$country", ""] },
        assignedStylesCount: {
          $ifNull: [{ $arrayElemAt: ["$stats.assigned", 0] }, 0],
        },
        readyStockStylesCount: {
          $ifNull: [{ $arrayElemAt: ["$stats.ready", 0] }, 0],
        },
      },
    },
    { $sort: { assignedStylesCount: -1, factoryName: 1 } },
  ]);

  return data.map((row) => ({
    ...row,
    factoryId: String(row.factoryId),
  }));
}

export async function getInventoryAlerts(thresholdRaw: unknown) {
  const threshold = parseThreshold(thresholdRaw, 100);

  const variantStages = [
    { $match: { readyStockAvailability: "Yes" } },
    {
      $addFields: {
        variantRows: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ["$variantDetails", []] } }, 0] },
            "$variantDetails",
            [
              {
                color: { $ifNull: ["$color", ""] },
                status: "In Stock",
                stockQty: null,
              },
            ],
          ],
        },
      },
    },
    { $unwind: "$variantRows" },
    {
      $project: {
        _id: 0,
        productCode: 1,
        title: 1,
        quantityUnit: { $ifNull: ["$quantityUnit", "Pcs"] },
        color: {
          $let: {
            vars: { variantColor: { $ifNull: ["$variantRows.color", ""] } },
            in: {
              $cond: [
                { $ne: ["$$variantColor", ""] },
                "$$variantColor",
                { $ifNull: ["$color", ""] },
              ],
            },
          },
        },
        variantStatus: {
          $ifNull: ["$variantRows.status", "In Stock"],
        },
        readyStockQuantity: {
          $convert: {
            input: {
              $ifNull: ["$variantRows.stockQty", "$readyStockQuantity"],
            },
            to: "double",
            onError: 0,
            onNull: 0,
          },
        },
      },
    },
  ];

  const [totalReadyStockItems, facetRows] = await Promise.all([
    Product.countDocuments({ readyStockAvailability: "Yes" }),
    Product.aggregate([
      ...variantStages,
      {
        $facet: {
          top: [{ $sort: { readyStockQuantity: 1, productCode: 1 } }, { $limit: 5 }],
          low: [
            { $match: { readyStockQuantity: { $lte: threshold } } },
            { $count: "n" },
          ],
        },
      },
    ]),
  ]);

  const facet = facetRows[0] || { top: [], low: [] };

  return {
    totalReadyStockItems,
    lowStockCount: facet.low[0]?.n || 0,
    lowStockThreshold: threshold,
    urgentItems: (facet.top || []).map(
      (item: {
        productCode: string;
        title: string;
        color: string;
        readyStockQuantity: number;
        quantityUnit: string;
        variantStatus: string;
      }) => ({
        productCode: item.productCode,
        title: item.title,
        color: item.color || "",
        readyStockQuantity: Math.round(item.readyStockQuantity || 0),
        quantityUnit: item.quantityUnit || "Pcs",
        // Map In Stock → Ready Stock for ready-stock alert feed (FE contract sample).
        variantStatus:
          item.variantStatus === "In Stock" ? "Ready Stock" : item.variantStatus || "Ready Stock",
      })
    ),
  };
}

export async function getRecentActivity() {
  const [recentStyles, lastImport] = await Promise.all([
    Product.aggregate([
      { $sort: { updatedAt: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "cat",
        },
      },
      {
        $project: {
          _id: 0,
          id: "$_id",
          productCode: 1,
          title: 1,
          categoryName: {
            $ifNull: [{ $arrayElemAt: ["$cat.name", 0] }, "Uncategorized"],
          },
          status: { $ifNull: ["$productStatus", "Active"] },
          updatedAt: 1,
        },
      },
    ]),
    ImportLog.findOne()
      .sort({ importedAt: -1 })
      .select("fileName importedAt importedBy rows families ok failed -_id")
      .lean(),
  ]);

  return {
    recentStyles: (recentStyles || []).map(
      (row: {
        id: unknown;
        productCode: string;
        title: string;
        categoryName: string;
        status: string;
        updatedAt: Date;
      }) => ({
        id: String(row.id),
        productCode: row.productCode,
        title: row.title,
        categoryName: row.categoryName,
        status: row.status,
        updatedAt: toIso(row.updatedAt),
      })
    ),
    lastBulkImport: lastImport
      ? {
          fileName: lastImport.fileName,
          importedAt: toIso(lastImport.importedAt),
          importedBy: lastImport.importedBy,
          rows: lastImport.rows || 0,
          families: lastImport.families || 0,
          ok: lastImport.ok || 0,
          failed: lastImport.failed || 0,
        }
      : null,
  };
}

export async function ensureDashboardIndexes(): Promise<void> {
  await Promise.all([
    Product.collection.createIndex({ productStatus: 1 }).catch(() => undefined),
    Product.collection.createIndex({ readyStockAvailability: 1 }).catch(() => undefined),
    Product.collection.createIndex({ factory: 1 }).catch(() => undefined),
    Product.collection.createIndex({ category: 1 }).catch(() => undefined),
    Product.collection.createIndex({ marketSuitability: 1 }).catch(() => undefined),
    Product.collection.createIndex({ updatedAt: -1 }).catch(() => undefined),
    Product.collection.createIndex({ createdAt: -1 }).catch(() => undefined),
    Product.collection.createIndex({ season: 1 }).catch(() => undefined),
    Category.collection.createIndex({ parent: 1 }).catch(() => undefined),
    Customer.collection.createIndex({ tier: 1 }).catch(() => undefined),
    ImportLog.collection.createIndex({ importedAt: -1 }).catch(() => undefined),
  ]);
}
