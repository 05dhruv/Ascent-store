import { query } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/apiResponse';

export async function POST(req) {
  try {
    const body = await req.json();
    const rows = body.rows || [];

    const matched = [];
    for (const r of rows) {
      const groupId = r.group_id !== undefined && r.group_id !== null && String(r.group_id).trim() !== '' ? String(r.group_id).trim() : null;
      const groupName = r.group_name !== undefined && r.group_name !== null && String(r.group_name).trim() !== '' ? String(r.group_name).trim() : null;
      const storeId = r.store_id !== undefined && r.store_id !== null && String(r.store_id).trim() !== '' ? String(r.store_id).trim() : null;

      const res = await query(
        `SELECT id, name
         FROM product_groups
         WHERE ($1::text IS NOT NULL AND id::text = $1::text)
            OR ($2::text IS NOT NULL AND name ILIKE $2::text)
         LIMIT 1`,
        [groupId, groupName]
      );

      if (res.rows.length) {
        matched.push({ ...res.rows[0], store_id: storeId });
      }
    }

    return successResponse({ records: matched }, 'Preview generated');
  } catch (err) {
    console.error(err);
    return errorResponse('Preview failed');
  }
}
