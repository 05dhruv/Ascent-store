import { query } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-response';
import { getAssignedStoreIds, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';
import { repairStockTransferSaleabilityPrices } from '@/lib/stockTransferSaleabilityRepair';

function getBatchVariantNumberSql(key, fallbackSql = '0') {
  return `
    CASE
      WHEN ib.meta ? '${key}' AND (ib.meta->>'${key}') ~ '^-?[0-9]+(\\.[0-9]+)?$'
      THEN (ib.meta->>'${key}')::numeric
      ELSE ${fallbackSql}
    END
  `.trim();
}

export async function GET(req) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'CREATE_POS_BILL', 'MANAGE_BILLING');
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(req.url);
    const barcode = searchParams.get('barcode');
    const sku = searchParams.get('sku');
    let store_id = Number(searchParams.get('store_id') || 0) || null;

    if (!barcode && !sku) {
      return errorResponse('barcode or sku required', 400);
    }

    if (!store_id && auth.user.role !== 'super_admin') {
      store_id = getAssignedStoreIds(auth.user)[0] || null;
    }
    if (store_id) {
      const storeCheck = requireStore(auth.user, store_id);
      if (storeCheck.error) return storeCheck.error;
    } else if (auth.user.role !== 'super_admin') {
      return errorResponse('Store is required', 400);
    }

    if (store_id) {
      await repairStockTransferSaleabilityPrices(store_id);
    }

    let searchQuery = `
      SELECT 
        p.id,
        p.name,
        p.sku,
        p.barcode,
        p.unit,
        COALESCE(
          batch_variant.variant_mrp,
          NULLIF(ps.mrp, 0),
          NULLIF(transfer_price.mrp, 0),
          p.mrp,
          0
        ) AS mrp,
        p.cost_price,
        COALESCE(batch_totals.qty, 0) AS stock,
        COALESCE(
          batch_variant.variant_selling_price,
          NULLIF(ps.selling_price, 0),
          NULLIF(transfer_price.selling_price, 0),
          p.selling_price,
          0
        ) AS selling_price,
        c.name as category,
        b.name as brand,
        COALESCE(t.rate, 0) as tax_rate,
        p.image_url
      FROM products p
      LEFT JOIN product_saleability ps ON ps.product_id = p.id AND ps.store_id = ${store_id ? '$1' : 'NULL'} AND ps.is_active = TRUE
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN taxes t ON p.tax_id = t.id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) AS mrp,
          sti.selling_price,
          COALESCE(st.confirmed_at, st.created_at) AS confirmed_at
        FROM stock_transfer_items sti
        INNER JOIN stock_transfer st ON st.id = sti.stock_transfer_id
        WHERE st.status = 'confirmed'
          AND st.destination_id = ${store_id ? '$1' : 'NULL'}
          AND sti.product_id = p.id
          AND (
            COALESCE(sti.selling_price, 0) > 0
            OR COALESCE(NULLIF(sti.destination_mrp, 0), sti.mrp, 0) > 0
          )
        ORDER BY COALESCE(st.confirmed_at, st.created_at) DESC, sti.id DESC
        LIMIT 1
      ) transfer_price ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          priced.variant_mrp,
          priced.variant_selling_price
        FROM (
          SELECT
            COALESCE(
              NULLIF(${getBatchVariantNumberSql('mrp', '0')}, 0),
              NULLIF(source_transfer_item.destination_mrp, 0),
              NULLIF(source_transfer_item.mrp, 0),
              NULLIF(sii_source.mrp, 0),
              NULLIF(ps.mrp, 0),
              NULLIF(transfer_price.mrp, 0),
              p.mrp,
              0
            ) AS variant_mrp,
            COALESCE(
              NULLIF(${getBatchVariantNumberSql('sellingPrice', '0')}, 0),
              NULLIF(source_transfer_item.selling_price, 0),
              NULLIF(sii_source.selling_price, 0),
              NULLIF(ps.selling_price, 0),
              NULLIF(transfer_price.selling_price, 0),
              p.selling_price,
              0
            ) AS variant_selling_price,
            ib.expiry_date,
            ib.created_at,
            ib.id
          FROM inventory_batches ib
          LEFT JOIN stock_in_items sii_source
            ON ib.source_type = 'stock_in'
           AND sii_source.id = CASE
             WHEN NULLIF(ib.source_id, '') ~ '^[0-9]+$'
               THEN NULLIF(ib.source_id, '')::BIGINT
              ELSE NULL
           END
          LEFT JOIN stock_transfer_items source_transfer_item
            ON ib.source_type = 'stock_transfer'
           AND source_transfer_item.id = CASE
             WHEN NULLIF(ib.source_id, '') ~ '^[0-9]+$'
               THEN NULLIF(ib.source_id, '')::BIGINT
             ELSE NULL
           END
          WHERE ib.product_id = p.id
            AND ib.store_id = ${store_id ? '$1' : 'NULL'}
            AND ib.status = 'active'
            AND ib.available_qty > 0
            AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)
        ) priced
        ORDER BY priced.expiry_date NULLS LAST, priced.created_at, priced.id
        LIMIT 1
      ) batch_variant ON TRUE
      LEFT JOIN (
        SELECT product_id, SUM(available_qty) AS qty
        FROM inventory_batches
        ${store_id ? `WHERE store_id = $1` : ''}
          ${store_id ? 'AND' : 'WHERE'} status = 'active'
          AND available_qty > 0
          AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
        GROUP BY product_id
      ) batch_totals ON batch_totals.product_id = p.id
      WHERE COALESCE(p.is_active, TRUE) = TRUE
        ${store_id ? 'AND (ps.is_active = TRUE OR COALESCE(batch_totals.qty, 0) > 0)' : ''}
    `;

    const params = store_id ? [store_id] : [];

    if (barcode) {
      searchQuery += ` AND p.barcode = $${params.length + 1}`;
      params.push(barcode);
    }

    if (sku) {
      searchQuery += ` AND p.sku = $${params.length + 1}`;
      params.push(sku);
    }

    searchQuery += ' ORDER BY p.name ASC LIMIT 2';

    const res = await query(searchQuery, params);

    if (!res.rows.length) {
      return errorResponse('Product not found', 404);
    }

    if (res.rows.length > 1) {
      return errorResponse(
        'Multiple products found for this barcode/SKU. Please fix duplicate barcode/SKU in product master.',
        409
      );
    }

    return successResponse(res.rows[0]);
  } catch (err) {
    return errorResponse(err.message);
  }
}
