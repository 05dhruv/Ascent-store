import { query } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-protection";
import { errorResponse, successResponse, validationError } from "@/lib/api-response";
import { ensureConstructionOpsSchema } from "@/lib/constructionOpsSchema";

export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const access = requirePermission(auth.user, "MANAGE_INVENTORY");
  if (access.error) return access.error;
  try {
    await ensureConstructionOpsSchema();
    const body = await request.json().catch(() => ({}));
    const stockOutId = Number(body.stockOutId || body.stock_out_id);
    const activityId = Number(body.activityId || body.activity_id);
    const qty = Number(body.qty ?? 0);
    if (!Number.isFinite(stockOutId) || stockOutId <= 0) {
      return validationError([
        { field: "stockOutId", message: "stock_out_id is required" },
      ]);
    }
    if (!Number.isFinite(activityId) || activityId <= 0) {
      return validationError([
        { field: "activityId", message: "activity_id is required" },
      ]);
    }
    const result = await query(
      `INSERT INTO construction_activity_issues
        (stock_out_id, activity_id, cost_code_id, project_id, site_id, qty, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        stockOutId,
        activityId,
        Number(body.costCodeId || body.cost_code_id) || null,
        Number(body.projectId || body.project_id) || null,
        Number(body.siteId || body.site_id) || null,
        Number.isFinite(qty) && qty >= 0 ? qty : 0,
        body.notes || null,
      ],
    );
    return successResponse(
      { record: result.rows[0] },
      "Material issue linked to activity",
      201,
    );
  } catch (error) {
    console.error("[construction activity-issue POST]", error);
    return errorResponse("Activity issue link could not be saved");
  }
}
