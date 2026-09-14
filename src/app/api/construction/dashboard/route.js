import { query } from '@/lib/db';
import { ensureMovementWorkflowSchema } from '@/lib/movementWorkflowSchema';
import { requireAuth, requirePermission, canAccessAllStores } from '@/lib/api-protection';
import { errorResponse, successResponse } from '@/lib/api-response';

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const access = requirePermission(auth.user, 'VIEW_INVENTORY', 'MANAGE_INVENTORY', 'ACCESS_DASHBOARD');
    if (access.error) return access.error;

    const isSuperAdmin = canAccessAllStores(auth.user);
    const rawStores = isSuperAdmin ? null : (auth.user?.assigned_stores || []);
    const stores = Array.isArray(rawStores)
      ? rawStores.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : null;

    // Parameter for SQL: null if all stores allowed; otherwise integer array
    const storeParam = isSuperAdmin ? null : (stores && stores.length > 0 ? stores : [-999999]);

    // Ensure schema dependencies without crashing if concurrent lock or warning occurs
    try {
      await ensureMovementWorkflowSchema();
    } catch (schemaErr) {
      console.warn('[construction dashboard] Schema initialization warning:', schemaErr.message);
    }

    const safeQuery = async (sqlText, params = [], fallback = []) => {
      try {
        const result = await query(sqlText, params);
        return result?.rows || fallback;
      } catch (err) {
        console.error('[construction dashboard query error]', err.message);
        return fallback;
      }
    };

    const [summaryRows, projectRows, transferRows, discrepancyRows, movementRows, masterRows] = await Promise.all([
      safeQuery(
        `SELECT COUNT(*) FILTER (WHERE p.status='active')::int AS active_projects,
          COUNT(*)::int AS total_projects,
          COALESCE(SUM(p.budget) FILTER (WHERE p.status IN ('planning','active')), 0) AS project_budget
         FROM construction_projects p
         WHERE $1::int[] IS NULL OR EXISTS
           (SELECT 1 FROM construction_sites s WHERE s.project_id = p.id AND s.store_id = ANY($1::int[]))`,
        [storeParam],
        [{ active_projects: 0, total_projects: 0, project_budget: 0 }]
      ),
      safeQuery(
        `SELECT p.id, p.project_code, p.name, p.client_name, p.status, p.budget,
          (SELECT COUNT(*)::int FROM construction_sites s WHERE s.project_id = p.id AND ($1::int[] IS NULL OR s.store_id = ANY($1::int[]))) AS site_count,
          (SELECT COALESCE(SUM(cc.budget), 0) FROM construction_cost_codes cc WHERE cc.project_id = p.id) AS allocated_budget
         FROM construction_projects p
         WHERE $1::int[] IS NULL OR EXISTS
           (SELECT 1 FROM construction_sites s WHERE s.project_id = p.id AND s.store_id = ANY($1::int[]))
         ORDER BY p.created_at DESC LIMIT 8`,
        [storeParam],
        []
      ),
      safeQuery(
        `SELECT COUNT(*) FILTER (WHERE workflow_version = 2 AND workflow_status IN ('dispatched','partially_received'))::int AS in_transit,
          COUNT(*) FILTER (WHERE workflow_version = 2 AND workflow_status IN ('approved','picked'))::int AS awaiting_dispatch,
          COUNT(*) FILTER (WHERE workflow_version = 2 AND workflow_status = 'partially_received')::int AS partial_receipts,
          COUNT(*)::int AS total_transfers
         FROM stock_transfer
         WHERE $1::int[] IS NULL OR source_id = ANY($1::int[]) OR destination_id = ANY($1::int[])`,
        [storeParam],
        [{ in_transit: 0, awaiting_dispatch: 0, partial_receipts: 0, total_transfers: 0 }]
      ),
      safeQuery(
        `SELECT COUNT(*)::int AS open_discrepancies
         FROM construction_discrepancies c
         JOIN stock_transfer t ON t.id = c.transfer_id
         WHERE c.status IN ('open','under_review')
           AND ($1::int[] IS NULL OR t.source_id = ANY($1::int[]) OR t.destination_id = ANY($1::int[]))`,
        [storeParam],
        [{ open_discrepancies: 0 }]
      ),
      safeQuery(
        `SELECT CASE m.reference_type
           WHEN 'stock_transfer_dispatch' THEN 'dispatch'
           WHEN 'stock_transfer_receipt' THEN 'receipt'
           WHEN 'stock_out' THEN 'material_issue'
           ELSE m.reference_type
         END AS movement_type,
         COUNT(*)::int AS transactions,
         COALESCE(SUM(m.qty), 0) AS quantity,
         COALESCE(SUM(m.qty * b.cost_price), 0) AS value
         FROM inventory_batch_movements m
         LEFT JOIN inventory_batches b ON b.id = m.batch_id
         WHERE $1::int[] IS NULL OR m.store_id = ANY($1::int[])
         GROUP BY 1 ORDER BY 1`,
        [storeParam],
        []
      ),
      safeQuery(
        `SELECT (SELECT COUNT(*)::int FROM construction_sites WHERE status = 'active' AND ($1::int[] IS NULL OR store_id = ANY($1::int[]))) AS active_sites,
          (SELECT COUNT(*)::int FROM products WHERE COALESCE(is_active, TRUE) = TRUE) AS materials,
          (SELECT COUNT(*)::int FROM vendors WHERE COALESCE(is_active, TRUE) = TRUE) AS active_vendors`,
        [storeParam],
        [{ active_sites: 0, materials: 0, active_vendors: 0 }]
      ),
    ]);

    const sumRow = summaryRows[0] || {};
    const transferRow = transferRows[0] || {};
    const discRow = discrepancyRows[0] || {};
    const masterRow = masterRows[0] || {};

    return successResponse({
      active_projects: Number(sumRow.active_projects || 0),
      total_projects: Number(sumRow.total_projects || 0),
      project_budget: sumRow.project_budget || '0',
      in_transit: Number(transferRow.in_transit || 0),
      awaiting_dispatch: Number(transferRow.awaiting_dispatch || 0),
      partial_receipts: Number(transferRow.partial_receipts || 0),
      total_transfers: Number(transferRow.total_transfers || 0),
      open_discrepancies: Number(discRow.open_discrepancies || 0),
      active_sites: Number(masterRow.active_sites || 0),
      materials: Number(masterRow.materials || 0),
      active_vendors: Number(masterRow.active_vendors || 0),
      projects: Array.isArray(projectRows) ? projectRows : [],
      movements: Array.isArray(movementRows) ? movementRows : [],
    });
  } catch (error) {
    console.error('[construction dashboard fatal error]', error);
    return errorResponse(
      error?.message || 'Construction dashboard could not be loaded',
      500,
      process.env.NODE_ENV === 'development' ? error : null
    );
  }
}
