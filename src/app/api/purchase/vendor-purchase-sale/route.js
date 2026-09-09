import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureStockInSchema } from "@/lib/stockInSchema";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import { ensureSalesBillingSchema } from "@/lib/salesBillingSchema";
import { getAssignedStoreIds, requireAuth, requirePermission } from "@/lib/api-protection";

function amount(value) {
  return Number(value || 0);
}

export async function GET(request) {
  try {
    await Promise.all([ensureStockInSchema(), ensureInventoryBatchSchema(), ensureSalesBillingSchema()]);
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, "MANAGE_PURCHASE_ORDERS", "MANAGE_VENDORS");
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const vendorId = Number(searchParams.get("vendorId") || 0) || null;
    const search = String(searchParams.get("search") || "").trim();
    const params = [];
    const purchaseScope = ["LOWER(COALESCE(si.status, '')) = 'confirmed'"];
    const saleScope = ["LOWER(COALESCE(sb.status, 'paid')) NOT IN ('void', 'cancelled', 'refunded')"];

    if (auth.user.role !== "super_admin") {
      const storeIds = getAssignedStoreIds(auth.user);
      if (!storeIds.length) {
        purchaseScope.push("1 = 0");
        saleScope.push("1 = 0");
      } else {
        params.push(storeIds);
        purchaseScope.push(`si.destination_id = ANY($${params.length}::int[])`);
        saleScope.push(`sb.store_id = ANY($${params.length}::int[])`);
      }
    }

    if (vendorId) {
      const vendorParams = [...params, vendorId];
      const purchaseFilters = [...purchaseScope, `si.vendor_id = $${vendorParams.length}`];
      const salesFilters = [...saleScope, `source_stock_in.vendor_id = $${vendorParams.length}`];
      const [vendorResult, purchaseResult, salesResult] = await Promise.all([
        query("SELECT id, name FROM vendors WHERE id = $1", [vendorId]),
        query(
          `SELECT si.id, si.transaction_id, si.invoice_number, si.invoice_date,
                  si.confirmed_at, COALESCE(st.name, '—') AS store_name,
                  COALESCE(si.total_cost, 0) + COALESCE(si.total_tax, 0) + COALESCE(si.other_charges, 0) AS amount
           FROM stock_in si
           LEFT JOIN stores st ON st.id = si.destination_id
           WHERE ${purchaseFilters.join(" AND ")}
           ORDER BY COALESCE(si.confirmed_at, si.created_at) DESC
           LIMIT 200`,
          vendorParams,
        ),
        query(
          `SELECT sbi.product_id, MAX(sbi.product_name) AS product_name,
                  SUM(CASE WHEN COALESCE(allocation.value->>'qty', '') ~ '^-?[0-9]+([.][0-9]+)?$'
                           THEN (allocation.value->>'qty')::numeric ELSE 0 END) AS sold_qty,
                  SUM(COALESCE(sbi.line_total, 0) * CASE
                    WHEN COALESCE(allocation.value->>'qty', '') ~ '^-?[0-9]+([.][0-9]+)?$'
                      THEN (allocation.value->>'qty')::numeric ELSE 0 END / NULLIF(sbi.qty, 0)) AS sale_amount
           FROM sales_bill_items sbi
           JOIN sales_bills sb ON sb.id = sbi.sales_bill_id
           CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(sbi.batch_allocations) = 'array' THEN sbi.batch_allocations ELSE '[]'::jsonb END) allocation(value)
           JOIN inventory_batches ib ON COALESCE(allocation.value->>'batchId', '') ~ '^[0-9]+$' AND ib.id = (allocation.value->>'batchId')::bigint
           JOIN stock_in source_stock_in ON ib.source_type = 'stock_in' AND COALESCE(ib.source_id, '') ~ '^[0-9]+$' AND source_stock_in.id = ib.source_id::bigint
           WHERE ${salesFilters.join(" AND ")}
           GROUP BY sbi.product_id
           ORDER BY sale_amount DESC NULLS LAST
           LIMIT 200`,
          vendorParams,
        ),
      ]);
      if (!vendorResult.rows.length) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
      return NextResponse.json({
        vendor: vendorResult.rows[0],
        purchases: purchaseResult.rows.map((row) => ({ ...row, amount: amount(row.amount) })),
        sales: salesResult.rows.map((row) => ({ ...row, sold_qty: amount(row.sold_qty), sale_amount: amount(row.sale_amount) })),
      });
    }

    // This is intentionally bill-level (not vendor-batch-level) so it is the
    // true consolidated POS sale for every store the user may access.
    const monthlySalesResult = await query(
      `SELECT
         DATE_TRUNC('month', sb.created_at AT TIME ZONE 'Asia/Kolkata')::date AS month_start,
         COUNT(*)::int AS bill_count,
         COALESCE(SUM(sb.grand_total), 0) AS total_sale_amount
       FROM sales_bills sb
       WHERE ${saleScope.join(" AND ")}
       GROUP BY DATE_TRUNC('month', sb.created_at AT TIME ZONE 'Asia/Kolkata')::date
       ORDER BY month_start DESC
       LIMIT 24`,
      params,
    );

    if (search) params.push(`%${search}%`);
    const searchFilter = search ? `WHERE v.name ILIKE $${params.length}` : "";
    const result = await query(
      `SELECT v.id, v.name,
              COALESCE(purchases.total_purchase_amount, 0) AS total_purchase_amount,
              COALESCE(purchases.grn_count, 0) AS grn_count,
              COALESCE(sales.total_sale_amount, 0) AS total_sale_amount
       FROM vendors v
       LEFT JOIN LATERAL (
         SELECT SUM(COALESCE(si.total_cost, 0) + COALESCE(si.total_tax, 0) + COALESCE(si.other_charges, 0)) AS total_purchase_amount,
                COUNT(*)::int AS grn_count
         FROM stock_in si WHERE ${purchaseScope.join(" AND ")} AND si.vendor_id = v.id
       ) purchases ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(COALESCE(sbi.line_total, 0) * CASE WHEN COALESCE(allocation.value->>'qty', '') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (allocation.value->>'qty')::numeric ELSE 0 END / NULLIF(sbi.qty, 0)) AS total_sale_amount
         FROM sales_bill_items sbi JOIN sales_bills sb ON sb.id = sbi.sales_bill_id
         CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(sbi.batch_allocations) = 'array' THEN sbi.batch_allocations ELSE '[]'::jsonb END) allocation(value)
         JOIN inventory_batches ib ON COALESCE(allocation.value->>'batchId', '') ~ '^[0-9]+$' AND ib.id = (allocation.value->>'batchId')::bigint
         JOIN stock_in source_stock_in ON ib.source_type = 'stock_in' AND COALESCE(ib.source_id, '') ~ '^[0-9]+$' AND source_stock_in.id = ib.source_id::bigint
         WHERE ${saleScope.join(" AND ")} AND source_stock_in.vendor_id = v.id
       ) sales ON TRUE
       ${searchFilter}
       ORDER BY total_purchase_amount DESC, v.name ASC
       LIMIT 500`,
      params,
    );
    return NextResponse.json({
      records: result.rows.map((row) => ({ vendorId: row.id, vendorName: row.name, totalPurchaseAmount: amount(row.total_purchase_amount), totalSaleAmount: amount(row.total_sale_amount), grnCount: Number(row.grn_count || 0) })),
      monthlySales: monthlySalesResult.rows.map((row) => ({
        monthStart: row.month_start,
        billCount: Number(row.bill_count || 0),
        totalSaleAmount: amount(row.total_sale_amount),
      })),
    });
  } catch (error) {
    console.error("[vendor-purchase-sale GET]", error.message);
    return NextResponse.json({ error: "Failed to load vendor purchase and sale report" }, { status: 500 });
  }
}
