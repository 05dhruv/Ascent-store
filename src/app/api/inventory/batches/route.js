import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureStockInSchema } from '@/lib/stockInSchema';
import { ensureInventoryBatchSchema } from '@/lib/inventoryBatching';
import { appendStoreScope, requireAuth, requirePermission } from '@/lib/api-protection';

function barcodeFromId(id) {
  const numeric = String(id || 0).replace(/\D/g, '');
  return `84${numeric.padStart(10, '0').slice(-10)}`;
}

function formatDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value);
}

export async function GET(request) {
  try {
    await ensureStockInSchema();
    await ensureInventoryBatchSchema();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'VIEW_INVENTORY', 'MANAGE_INVENTORY');
    if (permissionCheck.error) return permissionCheck.error;

    const params = [];
    const whereClauses = [];
    const scope = appendStoreScope(whereClauses, params, 'ib.store_id', auth.user);
    if (scope.error) return scope.error;
    const { searchParams } = new URL(request.url);
    const selectedStoreId = Number(searchParams.get('store_id') || 0) || null;
    if (selectedStoreId) {
      params.push(selectedStoreId);
      whereClauses.push(`ib.store_id = $${params.length}`);
    }
    const storeWhere = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const res = await query(
      `SELECT
        ib.id,
        ib.batch_no,
        ib.mfg_date,
        ib.expiry_date,
        ib.received_qty,
        ib.available_qty,
        ib.cost_price,
        ib.status,
        ib.source_type,
        ib.source_id,
        ib.created_at,
        p.name AS product_name,
        p.sku,
        s.name AS store_name,
        COALESCE(s.meta->>'locationType', 'Warehouse') AS location_type,
        CASE
          WHEN ib.available_qty <= 0 OR ib.status = 'depleted' THEN 'Depleted'
          WHEN ib.expiry_date IS NOT NULL AND ib.expiry_date < CURRENT_DATE THEN 'Expired'
          WHEN ib.expiry_date IS NOT NULL AND ib.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'Expiring Soon'
          ELSE 'Active'
        END AS expiry_status,
        CASE
          WHEN ib.expiry_date IS NULL THEN NULL
          ELSE (ib.expiry_date - CURRENT_DATE)
        END AS days_to_expiry
      FROM inventory_batches ib
      LEFT JOIN products p ON p.id = ib.product_id
      LEFT JOIN stores s ON s.id = ib.store_id
      ${storeWhere}
      ORDER BY ib.expiry_date ASC NULLS LAST, ib.created_at DESC
      -- The Batches page has its own client-side pagination. Do not truncate
      -- store data here, otherwise it disagrees with Store Wise Batch Report.
      LIMIT 10000`,
      params
    );

    const rows = res.rows.map((row) => {
      return {
        id: row.id,
        batchName: row.batch_no || `Batch-${String(row.id).padStart(4, '0')}`,
        barcode: barcodeFromId(row.id),
        timestamp: row.created_at,
        cost: Number(row.available_qty || 0) * Number(row.cost_price || 0),
        items: Number(row.available_qty || 0),
        receivedItems: Number(row.received_qty || 0),
        product: row.product_name || 'Product',
        sku: row.sku || '',
        store: row.store_name || '',
        locationType: row.location_type || '',
        expiryDate: formatDateOnly(row.expiry_date),
        mfgDate: formatDateOnly(row.mfg_date),
        status: row.status,
        expiryStatus: row.expiry_status,
        daysToExpiry: row.days_to_expiry === null ? null : Number(row.days_to_expiry),
        user: row.source_type || 'System',
        remarks: row.expiry_date ? `Expires ${formatDateOnly(row.expiry_date)}` : 'No expiry',
      };
    });

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[inventory batches GET]', err.message);
    return NextResponse.json([]);
  }
}
