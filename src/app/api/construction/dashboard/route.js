import { query } from "@/lib/db";
import { ensureMovementWorkflowSchema } from "@/lib/movementWorkflowSchema";
import {
  requireAuth,
  requirePermission,
  canAccessAllStores,
} from "@/lib/api-protection";
import { errorResponse, successResponse } from "@/lib/api-response";

const DAY_MS = 86400000;
const isoDate = (d) => d.toISOString().slice(0, 10);

// Previous period is the equal-length window immediately before `from`.
function resolveRange(searchParams) {
  const valid = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && !Number.isNaN(Date.parse(v));
  const today = new Date();
  let to = valid(searchParams.get("to")) ? searchParams.get("to") : isoDate(today);
  let from = valid(searchParams.get("from"))
    ? searchParams.get("from")
    : isoDate(new Date(Date.parse(to) - 30 * DAY_MS));
  if (from > to) [from, to] = [to, from];
  const lengthDays = Math.min(366, Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1);
  const prevFrom = isoDate(new Date(Date.parse(from) - lengthDays * DAY_MS));
  return { from, to, prevFrom };
}

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
  const { from, to, prevFrom } = resolveRange(new URL(request.url).searchParams);
  try {
    await ensureMovementWorkflowSchema();
    const [
      summary,
      projects,
      transfers,
      discrepancies,
      movements,
      masters,
      periodTotals,
      alertTimes,
    ] = await Promise.all([
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
        WHERE ($1::int[] IS NULL OR m.store_id=ANY($1))
          AND m.created_at >= $2::date AND m.created_at < ($3::date + 1)
        GROUP BY 1 ORDER BY 1`,
          [stores, from, to],
        ),
        query(
          `SELECT (SELECT COUNT(*)::int FROM construction_sites WHERE status='active' AND ($1::int[] IS NULL OR store_id=ANY($1))) active_sites,
        (SELECT COUNT(*)::int FROM products WHERE COALESCE(is_active,TRUE)=TRUE) materials,
        (SELECT COUNT(*)::int FROM vendors WHERE COALESCE(is_active,TRUE)=TRUE) active_vendors`,
          [stores],
        ),
        query(
          `SELECT
             COALESCE(SUM(m.qty*b.cost_price) FILTER (WHERE m.created_at >= $2::date),0) movement_value,
             COALESCE(SUM(m.qty*b.cost_price) FILTER (WHERE m.created_at < $2::date),0) movement_value_prev,
             COUNT(*) FILTER (WHERE m.created_at >= $2::date)::int movement_count,
             COUNT(*) FILTER (WHERE m.created_at < $2::date)::int movement_count_prev,
             (SELECT COUNT(*)::int FROM construction_projects p
               WHERE p.created_at >= $2::date AND p.created_at < ($3::date + 1)) projects_created,
             (SELECT COUNT(*)::int FROM construction_projects p
               WHERE p.created_at >= $4::date AND p.created_at < $2::date) projects_created_prev
           FROM inventory_batch_movements m LEFT JOIN inventory_batches b ON b.id=m.batch_id
           WHERE ($1::int[] IS NULL OR m.store_id=ANY($1))
             AND m.created_at >= $4::date AND m.created_at < ($3::date + 1)`,
          [stores, from, to, prevFrom],
        ),
        query(
          `SELECT
             (SELECT MIN(t.dispatched_at) FROM stock_transfer t
               WHERE t.workflow_version=2 AND t.workflow_status IN ('dispatched','partially_received')
                 AND ($1::int[] IS NULL OR t.source_id=ANY($1) OR t.destination_id=ANY($1))) oldest_in_transit_at,
             (SELECT MAX(e.created_at) FROM inventory_transfer_events e JOIN stock_transfer t ON t.id=e.transfer_id
               WHERE e.action IN ('approve','pick') AND t.workflow_status IN ('approved','picked')
                 AND ($1::int[] IS NULL OR t.source_id=ANY($1) OR t.destination_id=ANY($1))) latest_ready_at,
             (SELECT MAX(c.created_at) FROM construction_discrepancies c JOIN stock_transfer t ON t.id=c.transfer_id
               WHERE c.status IN ('open','under_review')
                 AND ($1::int[] IS NULL OR t.source_id=ANY($1) OR t.destination_id=ANY($1))) latest_discrepancy_at`,
          [stores],
        ),
      ]);
    return successResponse({
      ...summary.rows[0],
      ...transfers.rows[0],
      ...discrepancies.rows[0],
      ...masters.rows[0],
      ...periodTotals.rows[0],
      ...alertTimes.rows[0],
      range: { from, to, prevFrom },
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
