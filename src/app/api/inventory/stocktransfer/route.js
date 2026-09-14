import { NextResponse } from "next/server";
import { getClient, query } from "@/lib/db";
import { ensureStockTransferSchema } from "@/lib/stockTransferSchema";
import { ensureMarginApprovalSchema } from "@/lib/marginApprovalSchema";
import { toDateInputValue } from "@/lib/dateUtils";
import {
  appendStoreScope,
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";

function toNumericId(value) {
  const raw = String(value ?? "").trim();
  const leading = raw.match(/^\d+/)?.[0];
  return Number(leading || raw || 0);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(
    String(value ?? "")
      .replace(/,/g, "")
      .trim(),
  );
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBatchId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parts = raw.match(/\d+/g) || [];
  const id = Number(parts.length > 1 ? parts[parts.length - 1] : parts[0]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizeOptionalDate(value) {
  if (!value) return null;
  return toDateInputValue(value) || null;
}

export async function GET(request) {
  try {
    await ensureStockTransferSchema();
    await ensureMarginApprovalSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "TRANSFER_VIEW",
      "TRANSFER_CREATE",
      "TRANSFER_DISPATCH",
      "TRANSFER_RECEIVE",
    );
    if (permissionCheck.error) return permissionCheck.error;



    const params = [];
    const whereClauses = ["TRUE"];
    const url = new URL(request.url);
    const filterOptionsOnly = url.searchParams.get("filterOptions") === "1";
    const sourceId = Number(url.searchParams.get("sourceId") || 0);
    if (sourceId) {
      params.push(sourceId);
      whereClauses.push(`st.source_id = $${params.length}`);
    }
    const destinationId = Number(url.searchParams.get("destinationId") || 0);
    if (destinationId) {
      params.push(destinationId);
      whereClauses.push(`st.destination_id = $${params.length}`);
    }
    const scope = appendStoreScope(
      whereClauses,
      params,
      "st.destination_id",
      auth.user,
    );
    if (scope.error) return scope.error;

    if (filterOptionsOnly) {
      const optionsRes = await query(
        `SELECT DISTINCT
           st.source_id,
           source.name AS source_name,
           st.destination_id,
           destination.name AS destination_name
         FROM stock_transfer st
         LEFT JOIN stores source ON source.id = st.source_id
         LEFT JOIN stores destination ON destination.id = st.destination_id
         WHERE ${whereClauses.join(" AND ")}`,
        params,
      );
      const uniqueLocations = (idKey, nameKey) =>
        Array.from(
          new Map(
            optionsRes.rows
              .filter((row) => row[idKey] && row[nameKey])
              .map((row) => [
                String(row[idKey]),
                { id: row[idKey], name: row[nameKey] },
              ]),
          ).values(),
        ).sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json({
        sources: uniqueLocations("source_id", "source_name"),
        destinations: uniqueLocations("destination_id", "destination_name"),
      });
    }
    const limitSql = sourceId || destinationId ? "" : "LIMIT 200";

    const res = await query(
      `SELECT
        st.id,
        st.transaction_id,
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
        st.total_items,
        st.total_cost,
        st.total_tax,
        st.status,
        st.meta->>'marginHoldReleaseError' AS margin_hold_release_error,
        st.created_at,
        st.reverted_at,
        st.source_id,
        st.destination_id,
        source.name AS source_name,
        destination.name AS destination_name,
        STRING_AGG(DISTINCT b.name, ', ' ORDER BY b.name) FILTER (WHERE b.name IS NOT NULL) AS brand_names,
        COUNT(sti.id) AS transfer_item_count,
        COUNT(DISTINCT sti.product_id)::int AS item_count,
        COALESCE(SUM(sti.qty), 0) AS item_qty_sum,
        COALESCE(SUM(sti.qty * sti.cost_price), 0) AS items_cost_sum
      FROM stock_transfer st
      LEFT JOIN stores source ON source.id = st.source_id
      LEFT JOIN stores destination ON destination.id = st.destination_id
      LEFT JOIN stock_transfer_items sti ON sti.stock_transfer_id = st.id
      LEFT JOIN products p ON p.id = sti.product_id
      LEFT JOIN brands b ON b.id = p.brand_id
      WHERE ${whereClauses.join(" AND ")}
      GROUP BY st.id, source.name, destination.name
      ORDER BY st.id DESC
      ${limitSql}`,
      params,
    );

    return NextResponse.json(
      res.rows.map((row) => ({
        id: row.id,
        transactionId:
          row.transaction_id || `TRN-${String(row.id).padStart(4, "0")}`,
        invoiceNumber: row.invoice_number || "-",
        sourceId: row.source_id,
        sourceName: row.source_name || "-",
        destinationId: row.destination_id,
        destinationName: row.destination_name || "-",
        brandNames: row.brand_names || "",
        invoiceDate: row.invoice_date,
        totalItems: Number(row.total_items || row.item_qty_sum || 0),
        itemCount: Number(row.item_count || 0),
        // A transfer with items must always show the exact sum of its saved
        // line CPs. This is the same authority used by the preview and avoids
        // an old rounded header total masking precise item values.
        cost:
          Number(row.transfer_item_count || 0) > 0
            ? Number(row.items_cost_sum || 0) + Number(row.other_charges || 0)
            : Number(row.total_cost || 0),
        totalTax: Number(row.total_tax || 0),
        revertedAt: row.reverted_at,
        createdAt: row.created_at,
        status: row.status || "confirmed",
        marginHoldReleaseError: row.margin_hold_release_error || "",
      })),
    );
  } catch (err) {
    console.error("[stocktransfer GET]", err.message);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request) {
  try {
    await ensureStockTransferSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, "TRANSFER_CREATE");
    if (permissionCheck.error) return permissionCheck.error;

    const payload = await request.json();
    const requestKey = String(payload.requestKey || "").trim() || null;
    const sourceId = payload.source ? Number(payload.source) : null;
    const destinationId = payload.destination
      ? Number(payload.destination)
      : null;
    if (!sourceId || !destinationId || sourceId === destinationId) {
      return NextResponse.json({ error: 'Distinct source and destination locations are required' }, { status: 400 });
    }
    if ((!sourceId || !destinationId) && auth.user.role !== "super_admin") {
      return NextResponse.json(
        {
          error: "Source and destination stores are required for your account",
        },
        { status: 403 },
      );
    }
    for (const storeId of [sourceId, destinationId].filter(Boolean)) {
      const storeCheck = requireStore(auth.user, storeId);
      if (storeCheck.error) return storeCheck.error;
    }

    const client = await getClient();

    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO stock_transfer (
          source_id, destination_id, apply_taxes, meta, request_key, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'draft', NOW())
        ON CONFLICT (request_key) WHERE request_key IS NOT NULL
        DO UPDATE SET request_key = EXCLUDED.request_key
        RETURNING id, transaction_id`,
        [
          sourceId,
          destinationId,
          payload.applyTaxes ?? true,
          JSON.stringify(payload),
          requestKey,
        ],
      );

      const id = res.rows[0].id;
      const transactionId =
        res.rows[0].transaction_id || `TRN-${String(id).padStart(4, "0")}`;
      if (!res.rows[0].transaction_id) {
        await client.query(
          "UPDATE stock_transfer SET transaction_id = $1 WHERE id = $2",
          [transactionId, id],
        );
      }
      await client.query("COMMIT");
      return NextResponse.json({ id, transactionId }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[stocktransfer POST]", err.message);
    return NextResponse.json(
      {
        error: /Selling price cannot be greater than MRP/i.test(err.message || "")
          ? err.message
          : "Failed to create stock transfer",
      },
      { status: /Selling price cannot be greater than MRP/i.test(err.message || "") ? 400 : 500 },
    );
  }
}
