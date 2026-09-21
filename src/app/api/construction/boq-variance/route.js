import { query } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-protection";
import { errorResponse, successResponse } from "@/lib/api-response";
import { ensureConstructionOpsSchema } from "@/lib/constructionOpsSchema";
import { ensureConstructionSchema } from "@/lib/constructionSchema";

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const access = requirePermission(
    auth.user,
    "PROJECT_VIEW",
    "PROJECT_EDIT",
    "VIEW_INVENTORY",
    "MANAGE_INVENTORY",
  );
  if (access.error) return access.error;
  try {
    await ensureConstructionSchema();
    await ensureConstructionOpsSchema();
    const projectId =
      Number(new URL(request.url).searchParams.get("projectId")) || null;

    const result = await query(
      `
      SELECT
        b.id AS boq_id,
        b.project_id,
        p.name AS project_name,
        b.item_code,
        b.description,
        b.unit,
        b.planned_qty,
        b.consumed_qty AS boq_consumed_qty,
        b.rate,
        b.budget_amount,
        COALESCE(mov.movement_qty, 0)::numeric AS movement_qty,
        COALESCE(iss.issue_qty, 0)::numeric AS activity_issue_qty,
        (COALESCE(mov.movement_qty, 0) + COALESCE(iss.issue_qty, 0))::numeric AS actual_qty,
        (b.planned_qty - (COALESCE(mov.movement_qty, 0) + COALESCE(iss.issue_qty, 0)))::numeric AS variance_qty,
        CASE
          WHEN b.planned_qty = 0 THEN NULL
          ELSE ROUND(
            ((COALESCE(mov.movement_qty, 0) + COALESCE(iss.issue_qty, 0)) / b.planned_qty) * 100,
            2
          )
        END AS consumption_pct
      FROM construction_boq_items b
      JOIN construction_projects p ON p.id = b.project_id
      LEFT JOIN LATERAL (
        SELECT SUM(m.quantity) AS movement_qty
        FROM construction_inventory_movements m
        WHERE m.project_id = b.project_id
          AND (b.activity_id IS NULL OR m.activity_id = b.activity_id)
          AND (b.cost_code_id IS NULL OR m.cost_code_id = b.cost_code_id)
          AND m.movement_type IN ('material_issue', 'dispatch', 'receipt')
      ) mov ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(ai.qty) AS issue_qty
        FROM construction_activity_issues ai
        WHERE ai.project_id = b.project_id
          AND (b.activity_id IS NULL OR ai.activity_id = b.activity_id)
          AND (b.cost_code_id IS NULL OR ai.cost_code_id = b.cost_code_id)
      ) iss ON TRUE
      WHERE ($1::bigint IS NULL OR b.project_id = $1)
      ORDER BY p.name, b.item_code NULLS LAST, b.id
      `,
      [projectId],
    );
    return successResponse({ records: result.rows, projectId });
  } catch (error) {
    console.error("[construction boq-variance GET]", error);
    return errorResponse("BOQ variance could not be loaded");
  }
}
