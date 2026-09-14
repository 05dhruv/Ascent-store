import { NextResponse } from "next/server";
import { getClient, query } from "@/lib/db";
import { ensureStockValidationSchema } from "@/lib/stockValidationSchema";
import {
  appendStoreScope,
  canAccessAllStores,
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";

export async function GET(request) {
  try {
    await ensureStockValidationSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_STOCK_VALIDATION",
      "STOCK_VIEW",
      "STOCK_AUDIT",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const params = [];
    const whereClauses = [`sv.status IN ('draft', 'confirmed')`];
    const scope = appendStoreScope(
      whereClauses,
      params,
      "sv.destination_id",
      auth.user,
    );
    if (scope.error) return scope.error;
    if (!canAccessAllStores(auth.user)) {
      params.push(Number(auth.user.id));
      whereClauses.push(`sv.created_by = $${params.length}`);
    }

    const res = await query(
      `SELECT
        sv.id,
        sv.transaction_id,
        sv.rack_no,
        sv.invoice_number,
        TO_CHAR(sv.invoice_date, 'YYYY-MM-DD') AS invoice_date,
        sv.other_charges,
        sv.total_items,
        sv.total_cost,
        sv.total_tax,
        sv.status,
        sv.created_at,
        sv.confirmed_at,
        stores.name AS source_name,
        COALESCE(SUM(svi.qty), 0) AS item_qty_sum,
        COALESCE(SUM(svi.qty * svi.cost_price), 0) AS items_cost_sum
      FROM stock_validation sv
      LEFT JOIN stores ON stores.id = sv.destination_id
      LEFT JOIN stock_validation_items svi ON svi.stock_validation_id = sv.id
      WHERE ${whereClauses.join(" AND ")}
      GROUP BY sv.id, stores.name
      ORDER BY
        CASE WHEN sv.status = 'draft' THEN 0 ELSE 1 END,
        sv.confirmed_at DESC NULLS LAST,
        sv.created_at DESC
      LIMIT 200`,
      params,
    );

    return NextResponse.json(
      res.rows.map((row) => ({
        id: row.id,
        transactionId:
          row.transaction_id || `AUD-${String(row.id).padStart(4, "0")}`,
        invoiceNumber: row.invoice_number || "-",
        rackNo: row.rack_no || "",
        sourceName: row.source_name || "None",
        invoiceDate: row.invoice_date,
        status: row.status || "draft",
        totalItems: Number(row.total_items || row.item_qty_sum || 0),
        cost: Number(
          row.total_cost ||
            Number(row.items_cost_sum || 0) + Number(row.other_charges || 0),
        ),
        totalTax: Number(row.total_tax || 0),
        createdAt: row.created_at,
      })),
    );
  } catch (err) {
    console.error("[stockvalidation GET]", err.message);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request) {
  try {
    await ensureStockValidationSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_STOCK_VALIDATION",
      "STOCK_AUDIT",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const payload = await request.json();
    const destinationId =
      payload.destination && payload.destination !== "none"
        ? Number(payload.destination)
        : null;
    if (!destinationId && auth.user.role !== "super_admin") {
      return NextResponse.json(
        { error: "Store destination is required for your account" },
        { status: 403 },
      );
    }
    if (destinationId) {
      const storeCheck = requireStore(auth.user, destinationId);
      if (storeCheck.error) return storeCheck.error;
    }

    const client = await getClient();

    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO stock_validation (
          destination_id, apply_taxes, rack_no, created_by, meta, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'draft', NOW())
        RETURNING id`,
        [
          destinationId,
          payload.applyTaxes ?? true,
          payload.rack_no || payload.rackNo || null,
          Number(auth.user.id),
          JSON.stringify(payload),
        ],
      );

      const id = res.rows[0].id;
      const transactionId = `AUD-${String(id).padStart(4, "0")}`;
      await client.query(
        "UPDATE stock_validation SET transaction_id = $1 WHERE id = $2",
        [transactionId, id],
      );
      await client.query("COMMIT");
      return NextResponse.json({ id, transactionId }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[stockvalidation POST]", err.message);
    return NextResponse.json(
      { error: "Failed to create stock validation" },
      { status: 500 },
    );
  }
}
