import { getClient, query } from '@/lib/db';
import { ensureConstructionSchema } from '@/lib/constructionSchema';
import { requireAuth, requirePermission, canAccessAllStores } from '@/lib/api-protection';
import { errorResponse, successResponse, validationError } from '@/lib/api-response';

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const access=requirePermission(auth.user,'VIEW_INVENTORY','MANAGE_INVENTORY','MANAGE_STORES');
  if(access.error)return access.error;
  try {
    await ensureConstructionSchema();
    const result = await query(`
      SELECT p.*, COUNT(s.id)::int AS site_count
      FROM construction_projects p
      LEFT JOIN construction_sites s ON s.project_id = p.id
      WHERE ($1::int[] IS NULL OR s.store_id=ANY($1))
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `,[canAccessAllStores(auth.user)?null:(auth.user.assigned_stores||[])]);
    return successResponse({ records: result.rows });
  } catch (error) {
    console.error('[construction projects GET]', error);
    return errorResponse('Projects could not be loaded');
  }
}

export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const access=requirePermission(auth.user,'MANAGE_STORES');
  if(access.error)return access.error;
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const projectCode = String(body.projectCode || '').trim().toUpperCase();
  if (!name || !projectCode) {
    return validationError([{ field: 'project', message: 'Project code and name are required' }]);
  }

  const client = await getClient();
  try {
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
      const siteCode = String(body.siteCode || `${projectCode}-SITE`).trim().toUpperCase();
      const store = await client.query(
        `INSERT INTO stores (name, location_type, created_at)
         VALUES ($1, 'construction_site', NOW()) RETURNING id`,
        [siteName],
      );
      const siteResult = await client.query(
        `INSERT INTO construction_sites (project_id, site_code, name, address, store_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [project.rows[0].id, siteCode, siteName, body.siteAddress || body.address || null, store.rows[0].id],
      );
      site = siteResult.rows[0];
      await client.query('UPDATE stores SET construction_site_id=$1 WHERE id=$2', [site.id, store.rows[0].id]);
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
