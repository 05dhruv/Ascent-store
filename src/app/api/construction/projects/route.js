import { getClient, query } from '@/lib/db';
import { ensureConstructionSchema } from '@/lib/constructionSchema';
import { ensureUsersTable } from '@/lib/userAuth';
import { requireAuth, requirePermission, canAccessAllStores } from '@/lib/api-protection';
import { errorResponse, successResponse, validationError } from '@/lib/api-response';

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const access = requirePermission(
    auth.user,
    'PROJECT_VIEW',
    'PROJECT_CREATE',
    'PROJECT_EDIT',
    'SITE_VIEW',
    'SITE_CREATE',
    'SITE_EDIT',
  );
  if (access.error) return access.error;
  try {
    await ensureUsersTable();
    await ensureConstructionSchema();
    const result = await query(
      `
      WITH site_stock AS (
        SELECT store_id, SUM(available_qty) AS current_stock, COUNT(DISTINCT product_id) AS items_count
        FROM inventory_batches
        WHERE status = 'active'
        GROUP BY store_id
      ),
      site_transfers_in AS (
        SELECT st.destination_id AS store_id, SUM(COALESCE(NULLIF(sti.accepted_qty, 0), NULLIF(sti.received_qty, 0), sti.qty)) AS total_transferred
        FROM stock_transfer_items sti
        JOIN stock_transfer st ON st.id = sti.stock_transfer_id
        WHERE st.status IN ('confirmed', 'completed', 'received', 'partially_received')
        GROUP BY st.destination_id
      ),
      site_consumed AS (
        SELECT COALESCE(so.source_id, so.destination_id) AS store_id, SUM(soi.qty) AS total_consumed
        FROM stock_out_items soi
        JOIN stock_out so ON so.id = soi.stock_out_id
        WHERE so.status = 'confirmed'
        GROUP BY COALESCE(so.source_id, so.destination_id)
      ),
      site_in_transit AS (
        SELECT st.destination_id AS store_id, COUNT(DISTINCT st.id) AS in_transit_count
        FROM stock_transfer st
        WHERE st.status IN ('dispatched', 'in_transit')
        GROUP BY st.destination_id
      ),
      enriched_sites AS (
        SELECT
          s.id,
          s.project_id,
          s.site_code,
          s.name,
          s.address,
          s.status,
          s.store_id,
          COALESCE(st.name, s.name) AS store_name,
          s.site_engineer_id,
          u.name AS site_engineer_name,
          u.email AS site_engineer_email,
          COALESCE(ss.current_stock, 0)::numeric AS current_stock,
          COALESCE(ss.items_count, 0)::int AS items_count,
          COALESCE(sti.total_transferred, 0)::numeric AS total_transferred,
          COALESCE(sc.total_consumed, 0)::numeric AS total_consumed,
          COALESCE(sit.in_transit_count, 0)::int AS in_transit_count
        FROM construction_sites s
        LEFT JOIN stores st ON st.id = s.store_id
        LEFT JOIN users u ON u.id = s.site_engineer_id
        LEFT JOIN site_stock ss ON ss.store_id = s.store_id
        LEFT JOIN site_transfers_in sti ON sti.store_id = s.store_id
        LEFT JOIN site_consumed sc ON sc.store_id = s.store_id
        LEFT JOIN site_in_transit sit ON sit.store_id = s.store_id
      )
      SELECT
        p.*,
        COUNT(es.id)::int AS site_count,
        COALESCE(SUM(es.current_stock), 0)::numeric AS total_site_stock,
        COALESCE(SUM(es.total_transferred), 0)::numeric AS total_transferred_in,
        COALESCE(SUM(es.total_consumed), 0)::numeric AS total_consumed,
        COALESCE(SUM(es.in_transit_count), 0)::int AS total_in_transit,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', es.id,
              'site_code', es.site_code,
              'name', es.name,
              'address', es.address,
              'status', es.status,
              'store_id', es.store_id,
              'store_name', es.store_name,
              'site_engineer_id', es.site_engineer_id,
              'site_engineer_name', es.site_engineer_name,
              'site_engineer_email', es.site_engineer_email,
              'current_stock', es.current_stock,
              'items_count', es.items_count,
              'total_transferred', es.total_transferred,
              'total_consumed', es.total_consumed,
              'in_transit_count', es.in_transit_count
            )
          ) FILTER (WHERE es.id IS NOT NULL),
          '[]'::jsonb
        ) AS sites
      FROM construction_projects p
      LEFT JOIN enriched_sites es ON es.project_id = p.id
      WHERE ($1::int[] IS NULL OR es.store_id = ANY($1))
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `,
      [canAccessAllStores(auth.user) ? null : auth.user.assigned_stores || []],
    );
    return successResponse({ records: result.rows });
  } catch (error) {
    console.error('[construction projects GET]', error);
    return errorResponse('Projects could not be loaded');
  }
}

export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const access=requirePermission(auth.user,'PROJECT_CREATE');
  if(access.error)return access.error;
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const projectCode = String(body.projectCode || '').trim().toUpperCase();
  if (!name || !projectCode) {
    return validationError([{ field: 'project', message: 'Project code and name are required' }]);
  }

  const client = await getClient();
  try {
    await ensureUsersTable();
    await ensureConstructionSchema();
    await client.query('BEGIN');
    const project = await client.query(
      `INSERT INTO construction_projects
        (project_code, name, client_name, address, start_date, expected_end_date, budget, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [projectCode, name, body.clientName || null, body.address || null, body.startDate || null,
       body.expectedEndDate || null, Number(body.budget || 0), body.status || 'planning', auth.user.id],
    );
    let site = null;
    const siteName = String(body.siteName || '').trim();
    if (siteName) {
      const siteAccess = requirePermission(auth.user, 'SITE_CREATE');
      if (siteAccess.error) return siteAccess.error;
      const siteCode = String(body.siteCode || `${projectCode}-SITE`).trim().toUpperCase();
      const store = await client.query(
        `INSERT INTO stores (name, meta, location_type, created_at)
         VALUES ($1, jsonb_build_object('locationType', 'construction_site', 'siteCode', $2), 'construction_site', NOW())
         RETURNING id`,
        [siteName, siteCode],
      );
      const siteResult = await client.query(
        `INSERT INTO construction_sites (project_id, site_code, name, address, store_id, site_engineer_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [project.rows[0].id, siteCode, siteName, body.siteAddress || body.address || null, store.rows[0].id,
          Number(body.siteEngineerId) || null],
      );
      site = siteResult.rows[0];
      await client.query('UPDATE stores SET construction_site_id=$1 WHERE id=$2', [site.id, store.rows[0].id]);
      const siteEngineerId = Number(body.siteEngineerId);
      if (Number.isInteger(siteEngineerId) && siteEngineerId > 0) {
        await client.query(
          `INSERT INTO user_stores (user_id, store_id, is_active, created_at, updated_at)
           VALUES ($1, $2, TRUE, NOW(), NOW())
           ON CONFLICT (user_id, store_id) DO UPDATE
           SET is_active = TRUE, updated_at = NOW()`,
          [siteEngineerId, store.rows[0].id],
        );
      }
    }
    await client.query('COMMIT');
    return successResponse({ project: project.rows[0], site }, 'Construction project created', 201);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[construction projects POST]', error);
    return errorResponse(error.code === '23505' ? 'Project or site code already exists' : 'Project could not be created', error.code === '23505' ? 409 : 500);
  } finally {
    client.release();
  }
}
