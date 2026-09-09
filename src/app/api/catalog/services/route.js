import { query } from '@/lib/db';
import { successResponse, errorResponse, validationError } from '@/lib/api-response';
import { ensureCatalogExtrasSchema } from '@/lib/catalogExtrasSchema';

export async function GET(request) {
  try {
    await ensureCatalogExtrasSchema();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const offset = (page - 1) * pageSize;

    const params = [];
    const where = search ? `WHERE s.name ILIKE $1 OR COALESCE(sg.name, '') ILIKE $1 OR COALESCE(sd.name, '') ILIKE $1` : '';
    if (search) params.push(`%${search}%`);

    const count = await query(
      `SELECT COUNT(*) FROM services s
       LEFT JOIN service_groups sg ON s.service_group_id = sg.id
       LEFT JOIN service_departments sd ON s.service_department_id = sd.id
       ${where}`,
      params
    );
    params.push(pageSize, offset);
    const result = await query(
      `SELECT s.id, s.name, s.price, s.duration_minutes, s.is_active, s.created_at,
              sg.name AS service_group_name,
              sd.name AS service_department_name
       FROM services s
       LEFT JOIN service_groups sg ON s.service_group_id = sg.id
       LEFT JOIN service_departments sd ON s.service_department_id = sd.id
       ${where}
       ORDER BY s.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return successResponse({
      records: result.rows,
      total: parseInt(count.rows[0].count),
      page,
      pageSize,
      totalPages: Math.ceil(parseInt(count.rows[0].count) / pageSize),
    });
  } catch (err) {
    return errorResponse(err.message);
  }
}

export async function POST(request) {
  try {
    await ensureCatalogExtrasSchema();
    const body = await request.json();
    if (!body.name?.trim()) return validationError({ name: 'Name is required' });
    // normalize duration fields
    const duration_minutes = Number(body.duration_minutes || 0);
    const extra_time_minutes = Number(body.extra_time_minutes || 0);

    const result = await query(
      `INSERT INTO services (
         name, service_group_id, service_department_id, income_head_id, price, duration_minutes, hsn_code, sku,
         is_active, image_url, description, sub_category_id, show_in_receipt, dynamic_pricing, variable_pricing,
         tax_id, barcode, extra_time_minutes, manage_inventory, security_amount, reclaim_type, reclaim_value, includes_tax, metadata
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
       ) RETURNING *`,
      [
        body.name.trim(),
        body.service_group_id || null,
        body.service_department_id || null,
        body.income_head_id || null,
        body.price || 0,
        duration_minutes,
        body.hsn_code || null,
        body.sku || null,
        body.is_active ?? true,
        body.image_url || null,
        body.description || null,
        body.sub_category_id || null,
        body.show_in_receipt ?? true,
        body.dynamic_pricing ?? false,
        body.variable_pricing ?? false,
        body.tax_id || null,
        body.barcode || null,
        extra_time_minutes,
        body.manage_inventory ?? false,
        body.security_amount || 0,
        body.reclaim_type || null,
        body.reclaim_value || 0,
        body.includes_tax ?? false,
        body.metadata || null,
      ]
    );

    const created = result.rows[0];

    // handle per-store prices if provided
    if (Array.isArray(body.storePrices) && body.storePrices.length) {
      for (const sp of body.storePrices) {
        try {
          await query(
            `INSERT INTO service_saleability (service_id, store_id, price, is_active) VALUES ($1,$2,$3,COALESCE($4,true))
             ON CONFLICT (service_id, store_id) DO UPDATE SET price = EXCLUDED.price, is_active = EXCLUDED.is_active, updated_at = NOW()`,
            [created.id, sp.store_id, sp.price || 0, sp.is_active ?? true]
          );
        } catch (err) {
          // ignore individual store price errors
        }
      }
    }

    return successResponse(created, 'Service created successfully', 201);
  } catch (err) {
    if (err.code === '23505') return errorResponse('Service already exists', 409);
    return errorResponse(err.message);
  }
}
