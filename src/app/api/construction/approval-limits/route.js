import { query } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-protection";
import { errorResponse, successResponse, validationError } from "@/lib/api-response";
import { ensureConstructionOpsSchema } from "@/lib/constructionOpsSchema";

/**
 * Permission keys documented for monetary approval limits:
 * SITE_RECEIVER, DISPATCHER, QC_APPROVE
 * (plus existing MANAGE_INVENTORY / VIEW_INVENTORY for API access).
 */
const DOCUMENTED_KEYS = ["SITE_RECEIVER", "DISPATCHER", "QC_APPROVE"];

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const access = requirePermission(
    auth.user,
    "VIEW_INVENTORY",
    "MANAGE_INVENTORY",
  );
  if (access.error) return access.error;
  try {
    await ensureConstructionOpsSchema();
    const result = await query(
      `SELECT * FROM construction_approval_limits ORDER BY role_name, permission_key`,
    );
    return successResponse({
      records: result.rows,
      documentedPermissionKeys: DOCUMENTED_KEYS,
    });
  } catch (error) {
    console.error("[construction approval-limits GET]", error);
    return errorResponse("Approval limits could not be loaded");
  }
}

export async function PUT(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const access = requirePermission(auth.user, "MANAGE_INVENTORY");
  if (access.error) return access.error;
  try {
    await ensureConstructionOpsSchema();
    const body = await request.json().catch(() => ({}));
    const roleName = String(body.roleName || body.role_name || "").trim();
    const permissionKey = String(
      body.permissionKey || body.permission_key || "",
    )
      .trim()
      .toUpperCase();
    const maxAmount = Number(body.maxAmount ?? body.max_amount ?? 0);
    if (!roleName || !permissionKey) {
      return validationError([
        {
          field: "limit",
          message: "role_name and permission_key are required",
        },
      ]);
    }
    if (!Number.isFinite(maxAmount) || maxAmount < 0) {
      return validationError([
        { field: "maxAmount", message: "max_amount must be >= 0" },
      ]);
    }
    const result = await query(
      `INSERT INTO construction_approval_limits (role_name, permission_key, max_amount)
       VALUES ($1,$2,$3)
       ON CONFLICT (role_name, permission_key)
       DO UPDATE SET max_amount = EXCLUDED.max_amount
       RETURNING *`,
      [roleName, permissionKey, maxAmount],
    );
    return successResponse({ record: result.rows[0] }, "Approval limit saved");
  } catch (error) {
    console.error("[construction approval-limits PUT]", error);
    return errorResponse("Approval limit could not be saved");
  }
}
