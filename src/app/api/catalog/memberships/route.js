import { query, getClient } from '@/lib/db';
import { successResponse, errorResponse, validationError } from '@/lib/apiResponse';
import { ensureMembershipsSchema } from '@/lib/catalogExtrasSchema';

function toNum(v, fallback = 0) {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(v, fallback = 0) {
  return Math.floor(toNum(v, fallback));
}

function formatValidityDays(days) {
  const d = toInt(days, 0);
  if (!d) return '—';
  return d === 1 ? '1 day' : `${d} days`;
}

function formatStorePrice(row) {
  if (row.store_wise_pricing) {
    const n = toInt(row.store_price_count, 0);
    return n > 0 ? `${n} store(s)` : 'Store wise';
  }
  return `₹${Number(row.price || 0).toFixed(2)}`;
}

// ─── GET /api/catalog/memberships ────────────────────────────
export async function GET(request) {
  try {
    await ensureMembershipsSchema();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
    const offset = (page - 1) * pageSize;

    const params = [];
    let where = '';
    if (search.trim()) {
      params.push(`%${search.trim()}%`);
      where = `WHERE (
        m.name ILIKE $1
        OR COALESCE(m.membership_code, '') ILIKE $1
        OR COALESCE(m.description, '') ILIKE $1
        OR COALESCE(cat.name, '') ILIKE $1
        OR COALESCE(sc.name, '') ILIKE $1
      )`;
    }

    const count = await query(
      `SELECT COUNT(*)::int AS n FROM memberships m
       LEFT JOIN categories cat ON cat.id = m.category_id
       LEFT JOIN sub_categories sc ON sc.id = m.sub_category_id
       ${where}`,
      params
    );
    const total = count.rows[0].n;

    const limIdx = params.length + 1;
    const offIdx = params.length + 2;
    const listParams = [...params, pageSize, offset];

    const result = await query(
      `SELECT
         m.id,
         m.name,
         m.membership_code,
         m.description,
         m.appearance_type,
         m.image_url,
         m.color,
         m.category_id,
         m.sub_category_id,
         m.show_in_catalog,
         m.price,
         m.is_tax_inclusive,
         m.tax_id,
         m.charge_id,
         m.hsn_code,
         m.discount_type,
         m.discount_value,
         m.discount,
         m.quantity,
         m.validity_days,
         m.validity,
         m.auto_renew,
         m.update_existing,
         m.min_amount_required,
         m.max_customer_type,
         m.customer_group_id,
         m.store_wise_pricing,
         m.members,
         m.is_active,
         m.created_at,
         m.updated_at,
         cat.name AS category_name,
         sc.name AS sub_category_name,
         tx.name AS tax_name,
         ch.name AS charge_name,
         (SELECT COUNT(*)::int FROM membership_products mp WHERE mp.membership_id = m.id) AS product_count,
         (SELECT COUNT(*)::int FROM membership_store_prices msp WHERE msp.membership_id = m.id) AS store_price_count
       FROM memberships m
       LEFT JOIN categories cat ON cat.id = m.category_id
       LEFT JOIN sub_categories sc ON sc.id = m.sub_category_id
       LEFT JOIN taxes tx ON tx.id = m.tax_id
       LEFT JOIN charges ch ON ch.id = m.charge_id
       ${where}
       ORDER BY m.id DESC
       LIMIT $${limIdx} OFFSET $${offIdx}`,
      listParams
    );

    const records = result.rows.map((row) => ({
      ...row,
      validity_label: row.validity_days ? formatValidityDays(row.validity_days) : row.validity || '—',
      store_price_label: formatStorePrice(row),
    }));

    return successResponse({
      records,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    return errorResponse(err.message);
  }
}

// ─── POST /api/catalog/memberships ───────────────────────────
export async function POST(request) {
  let client;
  try {
    await ensureMembershipsSchema();

    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name) return validationError({ name: 'Membership name is required' });
    if (!body.category_id && !body.categoryId) {
      return validationError({ category_id: 'Category is required' });
    }
    if (body.price === '' || body.price === null || body.price === undefined) {
      return validationError({ price: 'Price is required' });
    }
    if (!body.tax_id && !body.taxId) {
      return validationError({ tax_id: 'Tax is required' });
    }
    const discountRaw = body.discount_value ?? body.discountValue ?? body.discount;
    if (discountRaw === '' || discountRaw === null || discountRaw === undefined) {
      return validationError({ discount_value: 'Discount is required' });
    }
    const validityDays = toInt(body.validity_days ?? body.validityDays, 0);
    if (!validityDays) {
      return validationError({ validity_days: 'Validity (days) is required' });
    }

    client = await getClient();

    const price = toNum(body.price, 0);
    const discountValue = toNum(body.discount_value ?? body.discountValue ?? body.discount, 0);
    const quantity = Math.max(1, toInt(body.quantity, 1));
    const minAmount = toNum(body.min_amount_required ?? body.minAmountRequired, 0);
    const showInCatalog = body.show_in_catalog !== false && body.showInCatalog !== false;
    const taxInclusive = Boolean(body.is_tax_inclusive ?? body.isTaxInclusive);
    const autoRenew = Boolean(body.auto_renew ?? body.autoRenew);
    const updateExisting = Boolean(body.update_existing ?? body.updateExisting);
    const storeWise = Boolean(body.store_wise_pricing ?? body.storeWisePricing);
    const appearanceType = body.appearance_type === 'color' || body.appearanceType === 'color' ? 'color' : 'image';
    const discountLabel =
      body.discount_type === 'Percentage' || body.discountType === 'Percentage'
        ? `${discountValue}%`
        : String(discountValue);

    const products = Array.isArray(body.products) ? body.products : [];

    await client.query('BEGIN');

    const insert = await client.query(
      `INSERT INTO memberships (
        name,
        membership_code,
        description,
        appearance_type,
        image_url,
        color,
        category_id,
        sub_category_id,
        show_in_catalog,
        price,
        is_tax_inclusive,
        tax_id,
        charge_id,
        hsn_code,
        discount_type,
        discount_value,
        discount,
        quantity,
        validity_days,
        validity,
        auto_renew,
        update_existing,
        min_amount_required,
        max_customer_type,
        customer_group_id,
        store_wise_pricing,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, TRUE,
        NOW(), NOW()
      ) RETURNING id`,
      [
        name,
        body.membership_code?.trim() || body.membershipCode?.trim() || null,
        body.description?.trim() || null,
        appearanceType,
        body.image_url || body.imageUrl || null,
        body.color?.trim() || null,
        Number(body.category_id || body.categoryId),
        body.sub_category_id || body.subCategoryId ? Number(body.sub_category_id || body.subCategoryId) : null,
        showInCatalog,
        price,
        taxInclusive,
        Number(body.tax_id || body.taxId),
        body.charge_id || body.chargeId ? Number(body.charge_id || body.chargeId) : null,
        body.hsn_code?.trim() || body.hsnCode?.trim() || null,
        body.discount_type?.trim() || body.discountType?.trim() || 'Percentage',
        discountValue,
        discountLabel,
        quantity,
        validityDays,
        formatValidityDays(validityDays),
        autoRenew,
        updateExisting,
        minAmount,
        body.max_customer_type?.trim() || body.maxCustomerType?.trim() || null,
        body.customer_group_id || body.customerGroupId ? Number(body.customer_group_id || body.customerGroupId) : null,
        storeWise,
      ]
    );

    const membershipId = insert.rows[0].id;

    for (const line of products) {
      if (!line?.product_id) continue;
      const qty = Math.max(0.001, toNum(line.quantity, 1));
      await client.query(
        `INSERT INTO membership_products (membership_id, product_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (membership_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
        [membershipId, line.product_id, qty]
      );
    }

    const storePrices = Array.isArray(body.store_prices) ? body.store_prices : [];
    for (const sp of storePrices) {
      if (!sp?.store_id) continue;
      await client.query(
        `INSERT INTO membership_store_prices (membership_id, store_id, price)
         VALUES ($1, $2, $3)
         ON CONFLICT (membership_id, store_id) DO UPDATE SET price = EXCLUDED.price`,
        [membershipId, sp.store_id, toNum(sp.price, 0)]
      );
    }

    await client.query('COMMIT');

    const row = await query(
      `SELECT m.*,
              cat.name AS category_name,
              sc.name AS sub_category_name,
              (SELECT COUNT(*)::int FROM membership_products mp WHERE mp.membership_id = m.id) AS product_count,
              (SELECT COUNT(*)::int FROM membership_store_prices msp WHERE msp.membership_id = m.id) AS store_price_count
       FROM memberships m
       LEFT JOIN categories cat ON cat.id = m.category_id
       LEFT JOIN sub_categories sc ON sc.id = m.sub_category_id
       WHERE m.id = $1`,
      [membershipId]
    );

    return successResponse(row.rows[0], 'Membership created successfully', 201);
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
    }
    if (err.code === '23505') return errorResponse('Membership already exists', 409);
    return errorResponse(err.message);
  } finally {
    if (client) client.release();
  }
}
