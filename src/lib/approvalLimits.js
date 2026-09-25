import { query } from "@/lib/db";
import { ensureConstructionOpsSchema } from "@/lib/constructionOpsSchema";
import { requirePermission } from "@/lib/api-protection";

/**
 * Job-role permission keys for construction movement.
 * Super_admin / * bypass. If user has the legacy inventory transfer
 * permission, that still counts. Job keys are additive tightening when
 * approval limits exist for the user's role.
 */
export const JOB_PERMISSIONS = {
  DISPATCHER: ["DISPATCHER", "TRANSFER_DISPATCH", "TRANSFER_APPROVE", "MANAGE_INVENTORY"],
  SITE_RECEIVER: ["SITE_RECEIVER", "TRANSFER_RECEIVE", "MANAGE_INVENTORY"],
  QC_APPROVE: ["QC_APPROVE", "MANAGE_INVENTORY"],
};

/**
 * Require at least one of the mapped permissions for a job role key.
 */
export function requireJobPermission(user, jobKey) {
  const mapped = JOB_PERMISSIONS[jobKey] || [jobKey];
  return requirePermission(user, ...mapped);
}

/**
 * Load max_amount for user.role + permission_key.
 * Returns null if no limit configured (unlimited).
 */
export async function getApprovalLimit(roleName, permissionKey) {
  await ensureConstructionOpsSchema();
  const role = String(roleName || "").trim().toLowerCase();
  const key = String(permissionKey || "").trim().toUpperCase();
  if (!role || !key) return null;

  const result = await query(
    `SELECT max_amount FROM construction_approval_limits
     WHERE LOWER(role_name) = $1 AND UPPER(permission_key) = $2
     LIMIT 1`,
    [role, key],
  );
  if (!result.rows.length) return null;
  const amount = Number(result.rows[0].max_amount);
  return Number.isFinite(amount) ? amount : null;
}

/**
 * Enforce monetary ceiling. Throws Error with message if over limit.
 * No limit row => allow.
 */
export async function assertWithinApprovalLimit(user, permissionKey, amount) {
  if (!user || user.role === "super_admin") return { ok: true, unlimited: true };
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  if (perms.includes("*")) return { ok: true, unlimited: true };

  const limit = await getApprovalLimit(user.role, permissionKey);
  if (limit == null) return { ok: true, unlimited: true };

  const value = Number(amount || 0);
  if (!Number.isFinite(value)) {
    throw new Error("Invalid amount for approval limit check");
  }
  if (value > limit) {
    throw new Error(
      `Amount ₹${value.toLocaleString("en-IN")} exceeds your approval limit of ₹${limit.toLocaleString("en-IN")} for ${permissionKey}`,
    );
  }
  return { ok: true, limit, amount: value };
}
