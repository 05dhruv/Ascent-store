import { query } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-protection";
import { errorResponse, successResponse, validationError } from "@/lib/api-response";
import { ensureConstructionOpsSchema } from "@/lib/constructionOpsSchema";
import { ensureConstructionSchema } from "@/lib/constructionSchema";

async function guard(request, write = false) {
  const auth = await requireAuth(request);
  if (auth.error) return auth;
  const access = requirePermission(
    auth.user,
    ...(write
      ? ["PROJECT_EDIT", "MANAGE_INVENTORY"]
      : ["PROJECT_VIEW", "PROJECT_EDIT", "VIEW_INVENTORY", "MANAGE_INVENTORY"]),
  );
  if (access.error) return access;
  return auth;
}

function totals(lineItems, retentionAmount) {
  const items = Array.isArray(lineItems) ? lineItems : [];
  const gross = items.reduce(
    (sum, row) => sum + Number(row.amount ?? Number(row.qty || 0) * Number(row.rate || 0)),
    0,
  );
  const retention = Number(retentionAmount || 0);
  return {
    gross_amount: gross,
    retention_amount: retention,
    net_amount: gross - retention,
  };
}

export async function GET(request) {
  const auth = await guard(request, false);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionSchema();
    await ensureConstructionOpsSchema();
    const projectId =
      Number(new URL(request.url).searchParams.get("projectId")) || null;
    const result = await query(
      `SELECT b.*, p.name AS project_name, c.name AS contractor_name, u.name AS created_by_name
       FROM construction_ra_bills b
       JOIN construction_projects p ON p.id = b.project_id
       LEFT JOIN construction_contractors c ON c.id = b.contractor_id
       LEFT JOIN users u ON u.id = b.created_by
       WHERE ($1::bigint IS NULL OR b.project_id = $1)
       ORDER BY b.created_at DESC
       LIMIT 200`,
      [projectId],
    );
    return successResponse({ records: result.rows });
  } catch (error) {
    console.error("[construction ra-bills GET]", error);
    return errorResponse("RA bills could not be loaded");
  }
}

export async function POST(request) {
  const auth = await guard(request, true);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const body = await request.json().catch(() => ({}));
    const projectId = Number(body.projectId || body.project_id);
    const billNumber = String(body.billNumber || body.bill_number || "").trim();
    if (!Number.isFinite(projectId) || projectId <= 0 || !billNumber) {
      return validationError([
        {
          field: "bill",
          message: "project_id and bill_number are required",
        },
      ]);
    }
    const lineItems = body.lineItems || body.line_items || [];
    const amounts = totals(lineItems, body.retentionAmount ?? body.retention_amount);
    const result = await query(
      `INSERT INTO construction_ra_bills
        (project_id, bill_number, bill_date, contractor_id, period_from, period_to,
         status, line_items, gross_amount, retention_amount, net_amount, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13) RETURNING *`,
      [
        projectId,
        billNumber,
        body.billDate || body.bill_date || new Date().toISOString().slice(0, 10),
        Number(body.contractorId || body.contractor_id) || null,
        body.periodFrom || body.period_from || null,
        body.periodTo || body.period_to || null,
        body.status || "draft",
        JSON.stringify(lineItems),
        amounts.gross_amount,
        amounts.retention_amount,
        amounts.net_amount,
        body.notes || null,
        auth.user.id,
      ],
    );
    return successResponse({ record: result.rows[0] }, "RA bill created", 201);
  } catch (error) {
    console.error("[construction ra-bills POST]", error);
    return errorResponse(
      error.code === "23505"
        ? "Bill number already exists for this project"
        : "RA bill could not be created",
      error.code === "23505" ? 409 : 500,
    );
  }
}

export async function PATCH(request) {
  const auth = await guard(request, true);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionOpsSchema();
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return validationError([{ field: "id", message: "id is required" }]);
    }
    const existing = await query(
      `SELECT * FROM construction_ra_bills WHERE id = $1`,
      [id],
    );
    if (!existing.rows.length) return errorResponse("RA bill not found", 404);
    const row = existing.rows[0];
    const lineItems =
      body.lineItems || body.line_items || row.line_items || [];
    const amounts = totals(
      lineItems,
      body.retentionAmount ?? body.retention_amount ?? row.retention_amount,
    );
    const result = await query(
      `UPDATE construction_ra_bills SET
         bill_date = COALESCE($2, bill_date),
         contractor_id = COALESCE($3, contractor_id),
         period_from = COALESCE($4, period_from),
         period_to = COALESCE($5, period_to),
         status = COALESCE($6, status),
         line_items = $7::jsonb,
         gross_amount = $8,
         retention_amount = $9,
         net_amount = $10,
         notes = COALESCE($11, notes),
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        id,
        body.billDate || body.bill_date || null,
        Number(body.contractorId || body.contractor_id) || null,
        body.periodFrom || body.period_from || null,
        body.periodTo || body.period_to || null,
        body.status || null,
        JSON.stringify(lineItems),
        amounts.gross_amount,
        amounts.retention_amount,
        amounts.net_amount,
        body.notes !== undefined ? body.notes : null,
      ],
    );
    return successResponse({ record: result.rows[0] }, "RA bill updated");
  } catch (error) {
    console.error("[construction ra-bills PATCH]", error);
    return errorResponse("RA bill could not be updated");
  }
}
