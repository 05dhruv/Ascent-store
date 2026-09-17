import { query } from "@/lib/db";
import { ensureMovementWorkflowSchema } from "@/lib/movementWorkflowSchema";
import {
  requireAuth,
  requirePermission,
  canAccessAllStores,
} from "@/lib/api-protection";
import { errorResponse, successResponse } from "@/lib/api-response";

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const access = requirePermission(
    auth.user,
    "VIEW_INVENTORY",
    "MANAGE_INVENTORY",
    "ACCESS_DASHBOARD",
  );
  if (access.error) return access.error;
  const stores = canAccessAllStores(auth.user)
    ? null
    : auth.user.assigned_stores || [];
  try {
    await ensureMovementWorkflowSchema();
    const [summary, projects, transfers, discrepancies, movements, masters] =
      await Promise.all([
        query(
          `SELECT COUNT(*) FILTER (WHERE p.status='active')::int active_projects,
        COUNT(*)::int total_projects,COALESCE(SUM(p.budget) FILTER (WHERE p.status IN ('planning','active')),0) project_budget
        FROM construction_projects p WHERE $1::int[] IS NULL OR EXISTS
        (SELECT 1 FROM construction_sites s WHERE s.project_id=p.id AND s.store_id=ANY($1))`,
          [stores],
        ),
        query(
          `SELECT p.id,p.project_code,p.name,p.client_name,p.status,p.budget,
        (SELECT COUNT(*)::int FROM construction_sites s WHERE s.project_id=p.id AND ($1::int[] IS NULL OR s.store_id=ANY($1))) site_count,
        (SELECT COALESCE(SUM(cc.budget),0) FROM construction_cost_codes cc WHERE cc.project_id=p.id) allocated_budget
        FROM construction_projects p WHERE $1::int[] IS NULL OR EXISTS
        (SELECT 1 FROM construction_sites s WHERE s.project_id=p.id AND s.store_id=ANY($1))
        ORDER BY p.created_at DESC LIMIT 8`,
          [stores],
        ),
        query(
          `SELECT COUNT(*) FILTER (WHERE workflow_version=2 AND workflow_status IN ('dispatched','partially_received'))::int in_transit,
        COUNT(*) FILTER (WHERE workflow_version=2 AND workflow_status IN ('approved','picked'))::int awaiting_dispatch,
        COUNT(*) FILTER (WHERE workflow_version=2 AND workflow_status='partially_received')::int partial_receipts,
        COUNT(*)::int total_transfers FROM stock_transfer
        WHERE $1::int[] IS NULL OR source_id=ANY($1) OR destination_id=ANY($1)`,
          [stores],
        ),
        query(
          `SELECT COUNT(*)::int open_discrepancies FROM construction_discrepancies c JOIN stock_transfer t ON t.id=c.transfer_id
        WHERE c.status IN ('open','under_review') AND ($1::int[] IS NULL OR t.source_id=ANY($1) OR t.destination_id=ANY($1))`,
          [stores],
        ),
        query(
          `SELECT CASE m.reference_type WHEN 'stock_transfer_dispatch' THEN 'dispatch' WHEN 'stock_transfer_receipt' THEN 'receipt'
        WHEN 'stock_out' THEN 'material_issue' ELSE m.reference_type END movement_type,
        COUNT(*)::int transactions,COALESCE(SUM(m.qty),0) quantity,COALESCE(SUM(m.qty*b.cost_price),0) value
        FROM inventory_batch_movements m LEFT JOIN inventory_batches b ON b.id=m.batch_id
        WHERE $1::int[] IS NULL OR m.store_id=ANY($1) GROUP BY 1 ORDER BY 1`,
          [stores],
        ),
        query(
          `SELECT (SELECT COUNT(*)::int FROM construction_sites WHERE status='active' AND ($1::int[] IS NULL OR store_id=ANY($1))) active_sites,
        (SELECT COUNT(*)::int FROM products WHERE COALESCE(is_active,TRUE)=TRUE) materials,
        (SELECT COUNT(*)::int FROM vendors WHERE COALESCE(is_active,TRUE)=TRUE) active_vendors`,
          [stores],
        ),
      ]);
    return successResponse({
      ...summary.rows[0],
      ...transfers.rows[0],
      ...discrepancies.rows[0],
      ...masters.rows[0],
      projects: projects.rows,
      movements: movements.rows,
    });
  } catch (error) {
    console.error("[construction dashboard]", error.message);
    const retryable =
      /connection (?:terminated|timeout|timed out|reset)|socket hang up/i.test(
        error.message || "",
      );
    return errorResponse(
      retryable
        ? "Dashboard connection timed out. Please retry."
        : "Construction dashboard could not be loaded",
    );
  }
}
