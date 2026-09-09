import { NextResponse } from "next/server";
import { getClient, query } from "@/lib/db";
import { ensureProcurementSchema } from "@/lib/procurementSchema";
import { ensurePurchaseOrderSchema } from "@/lib/purchaseOrderSchema";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import { ensureVendorsSchema } from "@/lib/vendorsSchema";
import {
  appendStoreScope,
  auditLog,
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";
import { resolveVendorPaymentTerms } from "@/lib/vendorCreditTerms";

function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDemandIds(items = []) {
  return Array.from(
    new Set(
      items
        .flatMap((item) =>
          Array.isArray(item.demandIds) ? item.demandIds : [],
        )
        .map((id) => toNum(id, 0))
        .filter(Boolean),
    ),
  );
}

export async function GET(request) {
  try {
    await ensureProcurementSchema();
    await ensurePurchaseOrderSchema();
    await ensureInventoryBatchSchema();
    await ensureVendorsSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_PURCHASE_ORDERS",
      "VIEW_INVENTORY",
      "MANAGE_INVENTORY",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId") || searchParams.get("store_id");
    const vendorId = toNum(
      searchParams.get("vendorId") || searchParams.get("vendor_id"),
      0,
    );
    const search = String(searchParams.get("search") || "").trim();
    const includeAll = searchParams.get("includeAll") === "true";
    const allStores = searchParams.get("allStores") === "true";
    const params = [];
    const where = ["ps.is_active = TRUE"];
    const scope = appendStoreScope(
      where,
      params,
      "ps.store_id",
      auth.user,
      storeId,
    );
    if (scope.error) return scope.error;
    if (vendorId && !includeAll) {
      params.push(vendorId);
      const vendorParam = params.length;
      where.push(`(
        (
          EXISTS (SELECT 1 FROM vendor_brands vb_scope WHERE vb_scope.vendor_id = $${vendorParam})
          AND EXISTS (
            SELECT 1
            FROM vendor_brands vb_match
            WHERE vb_match.vendor_id = $${vendorParam}
              AND vb_match.brand_id = p.brand_id
          )
        )
        OR (
          NOT EXISTS (SELECT 1 FROM vendor_brands vb_scope WHERE vb_scope.vendor_id = $${vendorParam})
          AND EXISTS (
            SELECT 1
            FROM stock_in_items hist_sii
            JOIN stock_in hist_si ON hist_si.id = hist_sii.stock_in_id
            WHERE hist_sii.product_id = p.id
              AND hist_si.vendor_id = $${vendorParam}
              AND LOWER(COALESCE(hist_si.status, '')) = 'confirmed'
          )
        )
      )`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        COALESCE(p.name, '') ILIKE $${params.length}
        OR COALESCE(p.sku, '') ILIKE $${params.length}
        OR COALESCE(p.barcode, '') ILIKE $${params.length}
        OR COALESCE(p.product_id, '') ILIKE $${params.length}
      )`);
    }

    const res = await query(
      `WITH stock AS (
         SELECT
           product_id,
           store_id,
           expiry_date,
           COALESCE(NULLIF(meta->>'mrp', '')::numeric, 0) AS mrp,
           COALESCE(NULLIF(meta->>'sellingPrice', '')::numeric, 0) AS selling_price,
           cost_price,
           ARRAY_AGG(id ORDER BY id) AS batch_ids,
           COALESCE(SUM(available_qty), 0) AS available_qty
         FROM inventory_batches
         WHERE status = 'active' AND available_qty > 0
         GROUP BY product_id, store_id, expiry_date,
                  COALESCE(NULLIF(meta->>'mrp', '')::numeric, 0),
                  COALESCE(NULLIF(meta->>'sellingPrice', '')::numeric, 0),
                  cost_price
       ), sales AS (
         SELECT sbi.product_id, sb.store_id,
                COALESCE(SUM(sbi.qty), 0) AS sold_30d,
                COALESCE(SUM(sbi.qty), 0) / 30.0 AS avg_daily_sales,
                COALESCE(SUM(sbi.qty) FILTER (WHERE sb.created_at >= NOW() - INTERVAL '7 days'), 0) AS sale_1_7,
                COALESCE(SUM(sbi.qty) FILTER (WHERE sb.created_at < NOW() - INTERVAL '7 days' AND sb.created_at >= NOW() - INTERVAL '14 days'), 0) AS sale_8_14,
                COALESCE(SUM(sbi.qty) FILTER (WHERE sb.created_at < NOW() - INTERVAL '14 days' AND sb.created_at >= NOW() - INTERVAL '21 days'), 0) AS sale_15_21,
                COALESCE(SUM(sbi.qty) FILTER (WHERE sb.created_at < NOW() - INTERVAL '21 days' AND sb.created_at >= NOW() - INTERVAL '30 days'), 0) AS sale_22_30,
                sbi.mrp,
                sbi.selling_price
         FROM sales_bill_items sbi
         JOIN sales_bills sb ON sb.id = sbi.sales_bill_id
         WHERE sb.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY sbi.product_id, sb.store_id, sbi.mrp, sbi.selling_price
       ), demands AS (
         SELECT store_id, product_id,
                COALESCE(SUM(requested_qty), 0) AS demand_qty,
                ARRAY_AGG(id ORDER BY created_at DESC) AS demand_ids
         FROM customer_demands
         WHERE product_id IS NOT NULL
           AND LOWER(COALESCE(status, 'new')) IN ('new', 'reviewed')
         GROUP BY store_id, product_id
       )
       SELECT
         p.id AS product_id,
         p.product_id AS product_code,
         p.name AS product_name,
         b.name AS brand_name,
         p.sku,
         p.barcode,
         ps.store_id,
         s.name AS store_name,
         COALESCE(stock.available_qty, 0) AS current_stock,
         COALESCE(NULLIF(ps.minimum_base_quantity, 0), 0) AS mbq,
         COALESCE(NULLIF(stock.mrp, 0), NULLIF(ps.mrp, 0), p.mrp, 0) AS mrp,
         COALESCE(NULLIF(stock.selling_price, 0), NULLIF(ps.selling_price, 0), p.selling_price, 0) AS selling_price,
         COALESCE(NULLIF(stock.cost_price, 0), NULLIF(ps.franchise_cost, 0), p.cost_price, 0) AS cost_price,
         stock.expiry_date,
         COALESCE(sales.sold_30d, 0) AS sold_30d,
         COALESCE(sales.avg_daily_sales, 0) AS avg_daily_sales,
         COALESCE(sales.sale_1_7, 0) AS sale_1_7,
         COALESCE(sales.sale_8_14, 0) AS sale_8_14,
         COALESCE(sales.sale_15_21, 0) AS sale_15_21,
         COALESCE(sales.sale_22_30, 0) AS sale_22_30,
         COALESCE(demands.demand_qty, 0) AS demand_qty,
         COALESCE(demands.demand_ids, ARRAY[]::bigint[]) AS demand_ids,
         GREATEST(
           COALESCE(NULLIF(ps.minimum_base_quantity, 0), 0) - COALESCE(stock.available_qty, 0),
           COALESCE(demands.demand_qty, 0),
           0
         ) AS suggested_qty,
         last_grn.last_grn_date,
         COALESCE(last_grn.last_grn_qty, 0) AS last_grn_qty,
         last_vendor.vendor_id,
         last_vendor.vendor_name
       FROM product_saleability ps
       JOIN products p ON p.id = ps.product_id
       LEFT JOIN brands b ON b.id = p.brand_id
       JOIN stores s ON s.id = ps.store_id
       LEFT JOIN stock ON stock.product_id = ps.product_id AND stock.store_id = ps.store_id
       LEFT JOIN sales ON sales.product_id = ps.product_id
         AND sales.store_id = ps.store_id
         AND (stock.product_id IS NULL OR (
           sales.mrp = COALESCE(NULLIF(stock.mrp, 0), NULLIF(ps.mrp, 0), p.mrp, 0)
           AND sales.selling_price = COALESCE(NULLIF(stock.selling_price, 0), NULLIF(ps.selling_price, 0), p.selling_price, 0)
         ))
       LEFT JOIN demands ON demands.product_id = ps.product_id AND demands.store_id = ps.store_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(si.confirmed_at, si.created_at)::date AS last_grn_date,
                COALESCE(sii.qty, 0) AS last_grn_qty
         FROM stock_in_items sii
         JOIN stock_in si ON si.id = sii.stock_in_id
         WHERE sii.product_id = p.id
           AND si.destination_id = ps.store_id
           AND LOWER(COALESCE(si.status, '')) = 'confirmed'
           AND (stock.expiry_date IS NULL OR sii.expiry_date = stock.expiry_date)
           AND (stock.mrp = 0 OR sii.mrp = stock.mrp)
           AND (stock.selling_price = 0 OR sii.selling_price = stock.selling_price)
         ORDER BY COALESCE(si.confirmed_at, si.created_at) DESC, sii.id DESC
         LIMIT 1
       ) last_grn ON TRUE
       LEFT JOIN LATERAL (
         SELECT si.vendor_id, COALESCE(v.name, si.vendor_name) AS vendor_name
         FROM stock_in_items sii
         JOIN stock_in si ON si.id = sii.stock_in_id
         LEFT JOIN vendors v ON v.id = si.vendor_id
         WHERE sii.product_id = p.id AND si.vendor_id IS NOT NULL
         ORDER BY si.confirmed_at DESC NULLS LAST, si.created_at DESC
         LIMIT 1
       ) last_vendor ON TRUE
       WHERE ${where.join(" AND ")}
         ${
           includeAll
             ? ""
             : `AND (
                  COALESCE(stock.available_qty, 0) < COALESCE(NULLIF(ps.minimum_base_quantity, 0), 0)
                  OR COALESCE(sales.sold_30d, 0) > 0
                  OR COALESCE(demands.demand_qty, 0) > 0
                )`
         }
       ORDER BY suggested_qty DESC, demand_qty DESC, sold_30d DESC, p.name ASC, stock.expiry_date ASC NULLS LAST
       LIMIT ${allStores ? 20000 : 500}`,
      params,
    );

    return NextResponse.json(
      res.rows.map((row) => {
        const currentStock = Number(row.current_stock || 0);
        const mbq = Number(row.mbq || 0);
        const sold30d = Number(row.sold_30d || 0);
        const demandQty = Number(row.demand_qty || 0);
        const reasons = [];
        if (currentStock < mbq) reasons.push("Below MBQ");
        if (sold30d > 0) reasons.push("Fast Moving");
        if (demandQty > 0) reasons.push("Customer Demand");
        return {
          productId: row.product_id,
          productCode: row.product_code || "",
          productName: row.product_name || "",
          sku: row.sku || "",
          barcode: row.barcode || "",
          brandName: row.brand_name || "",
          storeId: row.store_id,
          storeName: row.store_name || "",
          currentStock,
          reorderLevel: mbq,
          mbq,
          mrp: Number(row.mrp || 0),
          sellingPrice: Number(row.selling_price || 0),
          expiryDate: row.expiry_date,
          lastGrnDate: row.last_grn_date,
          lastGrnQty: Number(row.last_grn_qty || 0),
          sold30d,
          avgDailySales: Number(row.avg_daily_sales || 0),
          sale1To7: Number(row.sale_1_7 || 0),
          sale8To14: Number(row.sale_8_14 || 0),
          sale15To21: Number(row.sale_15_21 || 0),
          sale22To30: Number(row.sale_22_30 || 0),
          demandQty,
          demandIds: row.demand_ids || [],
          reasons,
          suggestedQty: Math.max(Number(row.suggested_qty || 0), 0),
          costPrice: Number(row.cost_price || 0),
          variantKey: [
            row.product_id,
            row.mrp,
            row.selling_price,
            row.expiry_date || "",
          ].join(":"),
          vendorId: row.vendor_id,
          vendorName: row.vendor_name || "",
        };
      }),
    );
  } catch (err) {
    console.error("[purchase reorder GET]", err.message);
    return NextResponse.json(
      { error: err.message || "Failed to load purchase-order products" },
      { status: err.status || 500 },
    );
  }
}

export async function POST(request) {
  const client = await getClient();
  try {
    await ensureProcurementSchema();
    await ensurePurchaseOrderSchema();
    await ensureInventoryBatchSchema();
    await ensureVendorsSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_PURCHASE_ORDERS",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const storeId = toNum(body.storeId || body.store_id, 0);
    const vendorId = toNum(body.vendorId || body.vendor_id, 0);
    const inputItems = Array.isArray(body.items) ? body.items : [];
    if (!storeId)
      return NextResponse.json({ error: "Store is required" }, { status: 400 });
    if (!vendorId)
      return NextResponse.json(
        { error: "Vendor is required" },
        { status: 400 },
      );
    if (!inputItems.length)
      return NextResponse.json(
        { error: "At least one item is required" },
        { status: 400 },
      );
    const storeCheck = requireStore(auth.user, storeId);
    if (storeCheck.error) return storeCheck.error;

    await client.query("BEGIN");
    const paymentTerms = await resolveVendorPaymentTerms(client, {
      vendorId,
      paymentDueDate: body.paymentDueDate || body.payment_due_date,
    });
    const po = await client.query(
      `INSERT INTO purchase_orders (
         destination_id, vendor_id, invoice_date, expected_delivery_date,
         payment_due_date, vendor_credit_days, shipment_mode, invoice_number,
         cc_emails, status, meta, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10::jsonb,NOW())
       RETURNING id`,
      [
        storeId,
        vendorId,
        body.invoiceDate || body.invoice_date || null,
        body.expectedDeliveryDate || body.expected_delivery_date || null,
        paymentTerms.paymentDueDate,
        paymentTerms.creditDays,
        body.shipmentMode || body.shipment_mode || null,
        body.invoiceNumber || body.invoice_number || null,
        body.ccEmails || body.cc_emails || null,
        JSON.stringify({ ...body, source: body.source || "auto_reorder" }),
      ],
    );
    const poId = po.rows[0].id;
    const transactionId = `PO-${String(poId).padStart(4, "0")}`;
    await client.query(
      "UPDATE purchase_orders SET transaction_id = $1 WHERE id = $2",
      [transactionId, poId],
    );

    let totalItems = 0;
    let totalCost = 0;
    for (const item of inputItems) {
      const productId = toNum(item.productId || item.product_id, 0);
      const qty = toNum(item.qty || item.suggestedQty || item.suggested_qty, 0);
      const inputCostPrice = toNum(item.costPrice || item.cost_price, 0);
      if (!productId || qty <= 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error:
              "Each item must have a product and quantity greater than zero",
          },
          { status: 400 },
        );
      }
      if (inputCostPrice < 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Cost price cannot be negative" },
          { status: 400 },
        );
      }
      const product = await client.query(
        "SELECT name FROM products WHERE id = $1",
        [productId],
      );
      if (!product.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: `Product ${productId} was not found` },
          { status: 404 },
        );
      }
      const vendorAllowed = await client.query(
        `SELECT CASE
           WHEN EXISTS (SELECT 1 FROM vendor_brands WHERE vendor_id = $1)
             THEN EXISTS (
               SELECT 1
               FROM products p
               JOIN vendor_brands vb ON vb.brand_id = p.brand_id
               WHERE p.id = $2 AND vb.vendor_id = $1
             )
           ELSE EXISTS (
             SELECT 1
             FROM stock_in_items sii
             JOIN stock_in si ON si.id = sii.stock_in_id
             WHERE sii.product_id = $2
               AND si.vendor_id = $1
               AND LOWER(COALESCE(si.status, '')) = 'confirmed'
           )
         END AS allowed`,
        [vendorId, productId],
      );
      if (!vendorAllowed.rows[0]?.allowed) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: `${product.rows[0].name} is not mapped to the selected vendor`,
          },
          { status: 400 },
        );
      }
      const productName =
        item.productName || item.product_name || product.rows[0]?.name || null;
      const cost = inputCostPrice;
      const mrp = toNum(item.mrp, 0);
      const sellingPrice = toNum(item.sellingPrice || item.selling_price, 0);
      const expiryDate = item.expiryDate || item.expiry_date || null;
      await client.query(
        `INSERT INTO purchase_order_items (
           purchase_order_id, product_id, product_name, qty, cost_price,
           mrp, selling_price, expiry_date, meta, tax_value
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,0)`,
        [
          poId,
          productId,
          productName,
          qty,
          cost,
          mrp,
          sellingPrice,
          expiryDate,
          JSON.stringify({
            variantKey: item.variantKey || null,
            brandName: item.brandName || "",
            barcode: item.barcode || "",
            currentStock: toNum(item.currentStock, 0),
            lastGrnDate: item.lastGrnDate || null,
            lastGrnQty: toNum(item.lastGrnQty, 0),
            avgDailySales: toNum(item.avgDailySales, 0),
            sale22To30: toNum(item.sale22To30, 0),
            sale15To21: toNum(item.sale15To21, 0),
            sale8To14: toNum(item.sale8To14, 0),
            sale1To7: toNum(item.sale1To7, 0),
            mbq: toNum(item.mbq, 0),
            requiredQty: qty,
          }),
        ],
      );
      totalItems += qty;
      totalCost += qty * cost;
    }

    const demandIds = normalizeDemandIds(inputItems);
    if (demandIds.length) {
      await client.query(
        `UPDATE customer_demands
         SET status = 'added_to_po', reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW(),
             meta = COALESCE(meta, '{}'::jsonb) || $4::jsonb
         WHERE id = ANY($1::bigint[]) AND store_id = $2`,
        [
          demandIds,
          storeId,
          auth.user.id || null,
          JSON.stringify({ purchaseOrderId: poId, transactionId }),
        ],
      );
    }

    await client.query(
      `UPDATE purchase_orders
       SET total_items = $2, total_cost = $3, total_tax = 0
       WHERE id = $1`,
      [poId, totalItems, totalCost],
    );

    await client.query("COMMIT");
    await auditLog(
      auth.user.id,
      "purchase_order.auto_reorder_create",
      "purchase_order",
      poId,
      {
        transactionId,
        storeId,
        vendorId,
        totalItems,
        totalCost,
        demandIds,
      },
    );
    return NextResponse.json(
      { id: poId, transactionId, totalItems, totalCost },
      { status: 201 },
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[purchase reorder POST]", err.message);
    return NextResponse.json(
      { error: err.message || "Failed to generate purchase order" },
      { status: err.status || 500 },
    );
  } finally {
    client.release();
  }
}
