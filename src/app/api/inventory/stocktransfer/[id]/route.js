import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureStockTransferSchema } from "@/lib/stockTransferSchema";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import { toDateInputValue } from "@/lib/dateUtils";
import {
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";

function normalizeOptionalDate(value) {
  if (!value) return null;
  return toDateInputValue(value) || null;
}

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    await ensureStockTransferSchema();
    await ensureInventoryBatchSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "TRANSFER_VIEW",
      "TRANSFER_CREATE",
      "TRANSFER_APPROVE",
      "TRANSFER_DISPATCH",
      "TRANSFER_RECEIVE",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const res = await query(
      `SELECT
        st.id,
        st.transaction_id,
        st.source_id,
        st.destination_id,
        st.apply_taxes,
        st.status,
        COALESCE(st.invoice_number, NULLIF(st.meta->>'invoice_number', '')) AS invoice_number,
        COALESCE(
          st.invoice_date,
          CASE
            WHEN COALESCE(st.meta->>'invoice_date', '') ~ '^\\d{4}-\\d{2}-\\d{2}$'
              THEN (st.meta->>'invoice_date')::date
            ELSE NULL
          END
        ) AS invoice_date,
        st.other_charges,
        st.remarks,
        st.meta,
        source.name AS source_name,
        destination.name AS destination_name
      FROM stock_transfer st
      LEFT JOIN stores source ON source.id = st.source_id
      LEFT JOIN stores destination ON destination.id = st.destination_id
      WHERE st.id = $1`,
      [id],
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = res.rows[0];
    const storeCheck = requireStore(auth.user, row.source_id).error ? requireStore(auth.user, row.destination_id) : { error: null };
    if (storeCheck.error) return storeCheck.error;

    const itemsRes = await query(
      `SELECT
        sti.id,
        sti.product_id,
        sti.product_name,
        sti.sku,
        sti.barcode,
        sti.qty,
        sti.cost_price,
        sti.mrp,
        sti.selling_price,
        sti.destination_mrp,
        sti.tax_value,
        sti.meta,
        COALESCE(p.cost_price, 0) AS current_cost_price,
        COALESCE(
          NULLIF(sti.selling_price, 0),
          ps.selling_price,
          p.selling_price,
          0
        ) AS current_store_selling_price,
        COALESCE(
          NULLIF(sti.destination_mrp, 0),
          NULLIF(sti.mrp, 0),
          ps.mrp,
          p.mrp,
          0
        ) AS current_store_mrp,
        b.name AS brand_name,
        COALESCE(
          sti.meta->>'batchNo',
          MIN(ib.batch_no),
          source_candidate.batch_no
        ) AS batch_no,
        COALESCE(
          sti.meta->>'expiryDate',
          MIN(ib.expiry_date)::text,
          source_candidate.expiry_date::text
        ) AS expiry_date,
        source_candidate.batch_no AS source_candidate_batch_no,
        source_candidate.expiry_date::text AS source_candidate_expiry_date,
        COALESCE(
          NULLIF(sti.meta->'batchAllocations', 'null'::jsonb),
          jsonb_agg(
            jsonb_build_object(
              'batchId', ib.id,
              'batchNo', ib.batch_no,
              'expiryDate', ib.expiry_date,
              'mfgDate', ib.mfg_date,
              'qty', ibm.qty
            )
            ORDER BY ibm.id ASC
          ) FILTER (WHERE ibm.id IS NOT NULL),
          '[]'::jsonb
        ) AS batch_allocations
      FROM stock_transfer_items sti
      LEFT JOIN inventory_batch_movements ibm
        ON ibm.reference_type = 'stock_transfer'
       AND ibm.reference_id = $1::text
       AND ibm.source_item_id = sti.id
       AND ibm.direction = 'out'
      LEFT JOIN inventory_batches ib ON ib.id = ibm.batch_id
      LEFT JOIN LATERAL (
        SELECT candidate.batch_no, candidate.expiry_date
        FROM inventory_batches candidate
        WHERE candidate.store_id = $3::int
          AND candidate.product_id = sti.product_id
          AND candidate.status = 'active'
          AND candidate.available_qty > 0
          AND (candidate.expiry_date IS NULL OR candidate.expiry_date >= CURRENT_DATE)
        ORDER BY candidate.expiry_date ASC NULLS LAST, candidate.id ASC
        LIMIT 1
      ) AS source_candidate ON TRUE
      LEFT JOIN products p ON p.id = sti.product_id
      LEFT JOIN product_saleability ps
        ON ps.product_id = sti.product_id
       AND ps.store_id = $2::int
      LEFT JOIN brands b ON b.id = p.brand_id
      WHERE sti.stock_transfer_id = $1::int
      GROUP BY sti.id, b.name, p.cost_price, p.selling_price, p.mrp, ps.selling_price, ps.mrp,
               source_candidate.batch_no, source_candidate.expiry_date
      ORDER BY sti.id ASC`,
      [id, row.destination_id || 0, row.source_id || 0],
    );

    const meta = typeof row.meta === "object" ? row.meta : {};
    return NextResponse.json({
      id: row.id,
      transactionId:
        row.transaction_id || `TRN-${String(row.id).padStart(4, "0")}`,
      source: row.source_id || meta.source || "",
      sourceName: row.source_name || "",
      destination: row.destination_id || meta.destination || "",
      destinationName: row.destination_name || "",
      applyTaxes: row.apply_taxes,
      status: row.status || "draft",
      invoice_number: row.invoice_number || "",
      invoice_date: toDateInputValue(row.invoice_date),
      other_charges: row.other_charges ?? "",
      remarks: row.remarks || "",
      meta,
      items: itemsRes.rows.map((item) => {
        const itemMeta =
          typeof item.meta === "object" && item.meta ? item.meta : {};
        const batchAllocations = Array.isArray(itemMeta.batchAllocations)
          ? itemMeta.batchAllocations
          : item.batch_allocations || [];
        return {
          id: item.id,
          product_id: item.product_id,
          product_name: item.product_name,
          name: item.product_name,
          sku: item.sku,
          barcode: item.barcode,
          brand_name: item.brand_name || "",
          qty: Number(item.qty || 0),
          cost_price: Number(item.cost_price || 0),
          franchise_cost: Number(
            item.cost_price || item.current_cost_price || 0,
          ),
          mrp: Number(item.mrp || 0),
          selling_price: Number(item.selling_price || 0),
          destination_mrp: Number(item.destination_mrp || 0),
          report_mrp: Number(
            item.current_store_mrp || item.destination_mrp || item.mrp || 0,
          ),
          report_selling_price: Number(
            item.current_store_selling_price || item.selling_price || 0,
          ),
          tax_value: Number(item.tax_value || 0),
          batch_no: item.batch_no || "",
          expiry_date: item.expiry_date || "",
          meta: {
            ...itemMeta,
            batchAllocations,
            batchNo: itemMeta.batchNo || item.batch_no || "",
            expiryDate: itemMeta.expiryDate || item.expiry_date || "",
            sourceCandidateBatchNo: item.source_candidate_batch_no || "",
            sourceCandidateExpiryDate: item.source_candidate_expiry_date || "",
          },
        };
      }),
    });
  } catch (err) {
    console.error("[stocktransfer GET id]", err.message);
    return NextResponse.json(
      { error: "Failed to load stock transfer" },
      { status: 500 },
    );
  }
}

export async function PUT(request, { params }) {
  const { id } = await params;
  try {
    await ensureStockTransferSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, "TRANSFER_CREATE");
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const invoiceDate = normalizeOptionalDate(
      body.invoice_date || body.invoiceDate,
    );
    if ((body.invoice_date || body.invoiceDate) && !invoiceDate) {
      return NextResponse.json(
        { error: "Invalid invoice date" },
        { status: 400 },
      );
    }
    const invoiceNumber =
      String(body.invoice_number || body.invoiceNumber || "").trim() || null;
    const currentRes = await query(
      `SELECT id, source_id, destination_id, status, reverted_at
      FROM stock_transfer
      WHERE id = $1`,
      [id],
    );
    if (currentRes.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const current = currentRes.rows[0];
    const visibleStoreId = current.destination_id || current.source_id;
    const storeCheck = requireStore(auth.user, visibleStoreId);
    if (storeCheck.error) return storeCheck.error;
    if (!['draft','margin_hold'].includes(current.status)) {
      return NextResponse.json({error:'Posted or submitted transfers cannot be edited. Use the movement workflow.'},{status:409});
    }
    if (current.reverted_at) {
      return NextResponse.json(
        { error: "Reverted stock transfers cannot be edited" },
        { status: 400 },
      );
    }

    const otherCharges = Number(body.other_charges || 0);
    if (!Number.isFinite(otherCharges) || otherCharges < 0) {
      return NextResponse.json(
        { error: "Other charges must be a valid amount" },
        { status: 400 },
      );
    }

    const itemTotals = await query(
      `SELECT
        COALESCE(SUM(qty), 0) AS total_items,
        COALESCE(SUM(qty * cost_price), 0) AS items_cost,
        COALESCE(SUM(qty * tax_value), 0) AS total_tax
      FROM stock_transfer_items
      WHERE stock_transfer_id = $1`,
      [id],
    );
    const totals = itemTotals.rows[0] || {};

    const updated = await query(
      `UPDATE stock_transfer SET
        invoice_date = $1,
        invoice_number = $2,
        other_charges = $3,
        remarks = $4,
        total_items = $5,
        total_cost = $6,
        total_tax = $7,
        meta = meta || $8::jsonb
      WHERE id = $9 AND status IN ('draft','margin_hold')
      RETURNING id`,
      [
        invoiceDate,
        invoiceNumber,
        otherCharges,
        body.remarks || null,
        Number(totals.total_items || 0),
        Number(totals.items_cost || 0) + otherCharges,
        Number(totals.total_tax || 0),
        JSON.stringify({
          invoice_date: invoiceDate,
          invoice_number: invoiceNumber,
          other_charges: otherCharges,
          remarks: body.remarks || null,
        }),
        id,
      ],
    );

    if (!updated.rows.length) return NextResponse.json({error:'Transfer state changed; reload and retry'},{status:409});
    return NextResponse.json({ success: true, id: updated.rows[0].id });
  } catch (err) {
    console.error("[stocktransfer PUT id]", err.message);
    return NextResponse.json(
      { error: "Failed to update stock transfer" },
      { status: 500 },
    );
  }
}
