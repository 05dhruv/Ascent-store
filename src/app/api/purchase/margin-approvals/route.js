import { NextResponse } from "next/server";
import { getClient, query } from "@/lib/db";
import {
  applyApprovedMarginRequest,
  ensureMarginApprovalSchema,
} from "@/lib/marginApprovalSchema";
import {
  appendStoreScope,
  auditLog,
  requireAuth,
  requirePermission,
} from "@/lib/api-protection";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function canApproveMargin(user) {
  if (!user) return false;
  return user.role === "super_admin";
}

function mapRow(row) {
  return {
    id: row.id,
    status: row.status || "pending",
    sourceType: row.source_type || "",
    sourceReference: row.source_reference || "",
    stockTransferId: row.stock_transfer_id || null,
    productId: row.product_id,
    productName: row.product_name || "",
    sku: row.sku || "",
    barcode: row.barcode || "",
    storeId: row.store_id,
    storeName: row.store_name || "",
    requestedByName: row.requested_by_name || "",
    approvedByName: row.approved_by_name || "",
    rejectedByName: row.rejected_by_name || "",
    currentCostPrice: toNumber(row.current_cost_price),
    requestedCostPrice: toNumber(row.requested_cost_price),
    currentMrp: toNumber(row.current_mrp),
    requestedMrp: toNumber(row.requested_mrp),
    currentSellingPrice: toNumber(row.current_selling_price),
    requestedSellingPrice: toNumber(row.requested_selling_price),
    currentMarginPercent: toNumber(row.current_margin_percent),
    requestedMarginPercent: toNumber(row.requested_margin_percent),
    remarks: row.remarks || "",
    rejectionReason: row.rejection_reason || "",
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
  };
}

// Older held documents can contain the approval IDs in their saved payload
// while the foreign-key columns on the approval rows are empty.  The approval
// screen then cannot find them and the document can never be released.  This
// is an idempotent metadata repair: it links only IDs explicitly saved on the
// held document; it never creates an approval or changes a price/status.
async function repairSavedMarginApprovalLinks() {
  const stockInRepair = await query(
    `UPDATE margin_approval_requests mar
     SET stock_in_id = si.id,
         updated_at = NOW()
     FROM stock_in si
     CROSS JOIN LATERAL jsonb_array_elements_text(
       COALESCE(si.meta->'pendingConfirmation'->'requestIds', '[]'::jsonb)
     ) AS saved_request(id)
     WHERE LOWER(COALESCE(si.status, '')) = 'margin_hold'
       AND saved_request.id ~ '^[0-9]+$'
       AND mar.id = saved_request.id::bigint
       AND mar.stock_in_id IS NULL
       AND LOWER(COALESCE(mar.source_type, '')) <> 'stock_transfer'`,
  );
  const transferRepair = await query(
    `UPDATE margin_approval_requests mar
     SET stock_transfer_id = st.id,
         updated_at = NOW()
     FROM stock_transfer st
     CROSS JOIN LATERAL jsonb_array_elements_text(
       COALESCE(st.meta->'pendingConfirmation'->'requestIds', '[]'::jsonb)
     ) AS saved_request(id)
     WHERE LOWER(COALESCE(st.status, '')) = 'margin_hold'
       AND saved_request.id ~ '^[0-9]+$'
       AND mar.id = saved_request.id::bigint
       AND mar.stock_transfer_id IS NULL
       AND LOWER(COALESCE(mar.source_type, '')) = 'stock_transfer'`,
  );
  return Number(stockInRepair.rowCount || 0) + Number(transferRepair.rowCount || 0);
}

export async function GET(request) {
  try {
    await ensureMarginApprovalSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(
      auth.user,
      "MANAGE_PURCHASE_ORDERS",
      "MANAGE_VENDORS",
      "MANAGE_BILLING",
      "MANAGE_CATALOG",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const repairedLinks = await repairSavedMarginApprovalLinks();

    const { searchParams } = new URL(request.url);
    const status = String(searchParams.get("status") || "pending")
      .trim()
      .toLowerCase();
    const search = String(searchParams.get("search") || "").trim();
    const params = [];
    const where = [];

    if (status && status !== "all") {
      params.push(status);
      where.push(`LOWER(mar.status) = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        mar.id::text ILIKE $${params.length}
        OR mar.status ILIKE $${params.length}
        OR mar.source_type ILIKE $${params.length}
        OR mar.source_reference ILIKE $${params.length}
        OR mar.remarks ILIKE $${params.length}
        OR mar.rejection_reason ILIKE $${params.length}
        OR mar.current_cost_price::text ILIKE $${params.length}
        OR mar.requested_cost_price::text ILIKE $${params.length}
        OR mar.current_mrp::text ILIKE $${params.length}
        OR mar.requested_mrp::text ILIKE $${params.length}
        OR mar.current_selling_price::text ILIKE $${params.length}
        OR mar.requested_selling_price::text ILIKE $${params.length}
        OR mar.current_margin_percent::text ILIKE $${params.length}
        OR mar.requested_margin_percent::text ILIKE $${params.length}
        OR mar.product_id::text ILIKE $${params.length}
        OR mar.store_id::text ILIKE $${params.length}
        OR p.name ILIKE $${params.length}
        OR p.sku ILIKE $${params.length}
        OR p.barcode ILIKE $${params.length}
        OR s.name ILIKE $${params.length}
        OR requested_by.name ILIKE $${params.length}
        OR approved_by.name ILIKE $${params.length}
        OR rejected_by.name ILIKE $${params.length}
      )`);
    }

    const scope = appendStoreScope(where, params, "mar.store_id", auth.user);
    if (scope.error) return scope.error;
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const res = await query(
      `SELECT
         mar.*,
         p.name AS product_name,
         p.sku,
         p.barcode,
         s.name AS store_name,
         requested_by.name AS requested_by_name,
         approved_by.name AS approved_by_name,
         rejected_by.name AS rejected_by_name
       FROM margin_approval_requests mar
       LEFT JOIN products p ON p.id = mar.product_id
       LEFT JOIN stores s ON s.id = mar.store_id
       LEFT JOIN users requested_by ON requested_by.id = mar.requested_by
       LEFT JOIN users approved_by ON approved_by.id = mar.approved_by
       LEFT JOIN users rejected_by ON rejected_by.id = mar.rejected_by
       ${whereSql}
       ORDER BY mar.created_at DESC
       LIMIT 200`,
      params,
    );

    return NextResponse.json({
      canApprove: canApproveMargin(auth.user),
      records: res.rows.map(mapRow),
      repairedLinks,
    });
  } catch (err) {
    console.error("[margin-approvals GET]", err.message);
    return NextResponse.json(
      { error: err.message || "Failed to load margin approvals" },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  let client;
  try {
    await ensureMarginApprovalSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    if (!canApproveMargin(auth.user)) {
      return NextResponse.json(
        { error: "Only super admin can approve margin changes" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const id = Number(body.id || body.requestId);
    const ids = Array.isArray(body.ids)
      ? body.ids.map(Number).filter(Boolean)
      : null;
    const action = String(body.action || "")
      .trim()
      .toLowerCase();

    if (!id && (!ids || ids.length === 0)) {
      return NextResponse.json(
        { error: "Request id or ids list is required" },
        { status: 400 },
      );
    }
    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Action must be approve or reject" },
        { status: 400 },
      );
    }

    const targetIds = ids || [id];
    const origin = new URL(request.url).origin;
    const cookieHeader = request.headers.get("cookie") || "";
    const authorizationHeader = request.headers.get("authorization") || "";

    client = await getClient();
    await client.query("BEGIN");

    if (action === "approve") {
      const appliedRows = [];
      for (const tId of targetIds) {
        const applied = await applyApprovedMarginRequest(
          client,
          tId,
          auth.user.id,
        );
        appliedRows.push(applied);
      }
      await client.query("COMMIT");

      const stockInIds = [
        ...new Set(
          appliedRows.map((row) => Number(row.stock_in_id)).filter(Boolean),
        ),
      ];
      const stockTransferIds = [
        ...new Set(
          appliedRows
            .map((row) => Number(row.stock_transfer_id))
            .filter(Boolean),
        ),
      ];
      const autoConfirmed = [];
      const autoConfirmErrors = [];
      for (const stockInId of stockInIds) {
        const pendingRes = await query(
          `SELECT COUNT(*)::int AS pending_count
           FROM margin_approval_requests
           WHERE stock_in_id = $1 AND status = 'pending'`,
          [stockInId],
        );
        if (Number(pendingRes.rows[0]?.pending_count || 0) > 0) continue;

        const stockInRes = await query(
          `SELECT meta, status
           FROM stock_in
           WHERE id = $1
           LIMIT 1`,
          [stockInId],
        );
        const stockIn = stockInRes.rows[0];
        if (String(stockIn?.status || "").toLowerCase() !== "margin_hold")
          continue;
        const pendingConfirmation = stockIn?.meta?.pendingConfirmation;
        if (!pendingConfirmation?.items?.length) continue;

        try {
          const headers = { "Content-Type": "application/json" };
          if (cookieHeader) headers.cookie = cookieHeader;
          if (authorizationHeader) headers.authorization = authorizationHeader;
          const confirmRes = await fetch(
            `${origin}/api/inventory/stockin/${stockInId}/confirm`,
            {
              method: "POST",
              headers,
              body: JSON.stringify(pendingConfirmation),
            },
          );
          const confirmJson = await confirmRes.json().catch(() => ({}));
          if (!confirmRes.ok || !confirmJson.success) {
            throw new Error(
              confirmJson.error ||
                confirmJson.message ||
                "Auto confirmation failed",
            );
          }
          autoConfirmed.push(stockInId);
        } catch (autoErr) {
          await query(
            `UPDATE stock_in
             SET meta = COALESCE(meta, '{}'::jsonb) || $1::jsonb
             WHERE id = $2 AND LOWER(COALESCE(status, '')) = 'margin_hold'`,
            [
              JSON.stringify({
                marginHoldReleaseError: autoErr.message || "Auto confirmation failed",
                marginHoldReleaseCheckedAt: new Date().toISOString(),
              }),
              stockInId,
            ],
          ).catch(() => {});
          autoConfirmErrors.push({ stockInId, error: autoErr.message });
        }
      }
      for (const stockTransferId of stockTransferIds) {
        const pendingRes = await query(
          `SELECT COUNT(*)::int AS pending_count
           FROM margin_approval_requests
           WHERE stock_transfer_id = $1 AND status = 'pending'`,
          [stockTransferId],
        );
        if (Number(pendingRes.rows[0]?.pending_count || 0) > 0) continue;

        const transferRes = await query(
          `SELECT meta, status
           FROM stock_transfer
           WHERE id = $1
           LIMIT 1`,
          [stockTransferId],
        );
        const transfer = transferRes.rows[0];
        if (String(transfer?.status || "").toLowerCase() !== "margin_hold")
          continue;
        const pendingConfirmation = transfer?.meta?.pendingConfirmation;
        if (!pendingConfirmation?.items?.length) continue;

        try {
          const headers = { "Content-Type": "application/json" };
          if (cookieHeader) headers.cookie = cookieHeader;
          if (authorizationHeader) headers.authorization = authorizationHeader;
          const confirmRes = await fetch(
            `${origin}/api/inventory/stocktransfer/${stockTransferId}/confirm`,
            {
              method: "POST",
              headers,
              body: JSON.stringify(pendingConfirmation),
            },
          );
          const confirmJson = await confirmRes.json().catch(() => ({}));
          if (!confirmRes.ok || !confirmJson.success) {
            throw new Error(
              confirmJson.error ||
                confirmJson.message ||
                "Auto transfer confirmation failed",
            );
          }
          autoConfirmed.push(`transfer:${stockTransferId}`);
        } catch (autoErr) {
          await query(
            `UPDATE stock_transfer
             SET meta = COALESCE(meta, '{}'::jsonb) || $1::jsonb
             WHERE id = $2 AND LOWER(COALESCE(status, '')) = 'margin_hold'`,
            [
              JSON.stringify({
                marginHoldReleaseError:
                  autoErr.message || "Auto transfer confirmation failed",
                marginHoldReleaseCheckedAt: new Date().toISOString(),
              }),
              stockTransferId,
            ],
          ).catch(() => {});
          autoConfirmErrors.push({ stockTransferId, error: autoErr.message });
        }
      }

      for (const applied of appliedRows) {
        await auditLog(
          auth.user.id,
          "margin_approval.approve",
          "margin_approval_requests",
          applied.id,
          {
            productId: applied.product_id,
            storeId: applied.store_id,
          },
        );
      }
      return NextResponse.json({
        success: true,
        status: "approved",
        count: targetIds.length,
        autoConfirmed,
        autoConfirmErrors,
      });
    }

    // Action is reject
    const rowsToReject = [];
    for (const tId of targetIds) {
      const reqRes = await client.query(
        `SELECT id, status, product_id, store_id
         FROM margin_approval_requests
         WHERE id = $1
         FOR UPDATE`,
        [tId],
      );
      const row = reqRes.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: `Approval request ${tId} not found` },
          { status: 404 },
        );
      }
      if (String(row.status || "").toLowerCase() !== "pending") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: `Only pending requests can be rejected (Request ID: ${tId})`,
          },
          { status: 409 },
        );
      }
      rowsToReject.push(row);

      await client.query(
        `UPDATE margin_approval_requests
         SET status = 'rejected',
             rejected_by = $2,
             rejected_at = NOW(),
             rejection_reason = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [tId, auth.user.id, body.reason || body.rejectionReason || null],
      );
    }

    await client.query("COMMIT");
    for (const row of rowsToReject) {
      await auditLog(
        auth.user.id,
        "margin_approval.reject",
        "margin_approval_requests",
        row.id,
        {
          productId: row.product_id,
          storeId: row.store_id,
          reason: body.reason || body.rejectionReason || null,
        },
      );
    }
    return NextResponse.json({
      success: true,
      status: "rejected",
      count: targetIds.length,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[margin-approvals PATCH]", err.message);
    return NextResponse.json(
      { error: err.message || "Failed to update margin approval" },
      { status: 500 },
    );
  } finally {
    if (client) client.release();
  }
}
