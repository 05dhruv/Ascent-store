import { NextResponse } from 'next/server';
import { appendStoreScope, requireAuth, requirePermission } from '@/lib/api-protection';
import { query } from '@/lib/db';
import { ensureInventoryBatchSchema } from '@/lib/inventoryBatching';
import { ensureStockInSchema } from '@/lib/stockInSchema';

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

function getAction(daysToExpiry, isExpired) {
  if (daysToExpiry === null) return 'Add expiry date to this batch';
  if (isExpired) return 'Remove from sale / return to vendor';
  if (daysToExpiry <= 3) return 'Sell first using FEFO shelf priority';
  if (daysToExpiry <= 7) return 'Move to priority shelf and monitor daily';
  if (daysToExpiry <= 15) return 'Keep visible and review replenishment';
  return 'Monitor';
}

function getRiskScore({ daysToExpiry, isExpired, availableQty, stockValue }) {
  if (daysToExpiry === null) return 80;
  const expiryScore = isExpired ? 100 : Math.max(0, 70 - Math.min(daysToExpiry, 70));
  const qtyScore = Math.min(15, Math.ceil(Number(availableQty || 0) / 10));
  const valueScore = Math.min(15, Math.ceil(Number(stockValue || 0) / 1000));
  return Math.min(100, expiryScore + qtyScore + valueScore);
}

export async function GET(request) {
  try {
    await ensureStockInSchema();
    await ensureInventoryBatchSchema();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'VIEW_EXPIRY_ALERTS', 'VIEW_STORE_EXPIRY', 'VIEW_INVENTORY', 'MANAGE_INVENTORY');
    if (permissionCheck.error) return permissionCheck.error;

    const url = new URL(request.url);
    const days = Math.min(toPositiveInt(url.searchParams.get('days'), 30), 365);
    const storeId = String(url.searchParams.get('store_id') || '').trim();
    const status = String(url.searchParams.get('status') || 'all').toLowerCase();
    const search = String(url.searchParams.get('search') || '').trim();

    const params = [];
    const where = [
      "ib.status = 'active'",
      'ib.available_qty > 0',
    ];
    const storeOnlyViewer = auth.user.permissions?.includes('VIEW_STORE_EXPIRY')
      && !auth.user.permissions?.some((permission) => ['VIEW_INVENTORY', 'MANAGE_INVENTORY', '*'].includes(permission));
    if (storeOnlyViewer) where.push("LOWER(COALESCE(s.meta->>'locationType', 'Store')) = 'store'");

    const scope = appendStoreScope(where, params, 'ib.store_id', auth.user);
    if (scope.error) return scope.error;

    if (storeId) {
      params.push(storeId);
      where.push(`ib.store_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        p.name ILIKE $${params.length}
        OR COALESCE(p.sku, '') ILIKE $${params.length}
        OR COALESCE(p.barcode, '') ILIKE $${params.length}
        OR COALESCE(ib.batch_no, '') ILIKE $${params.length}
        OR COALESCE(s.name, '') ILIKE $${params.length}
      )`);
    }

    const effectiveExpiryDate = 'COALESCE(ib.expiry_date, sii.expiry_date, legacy_expiry.expiry_date)';

    if (status === 'expired') {
      where.push(`${effectiveExpiryDate} < CURRENT_DATE`);
    } else if (status === 'urgent') {
      where.push(`${effectiveExpiryDate} >= CURRENT_DATE AND ${effectiveExpiryDate} <= CURRENT_DATE + INTERVAL '7 days'`);
    } else if (status === 'upcoming') {
      params.push(days);
      where.push(`${effectiveExpiryDate} >= CURRENT_DATE AND ${effectiveExpiryDate} <= CURRENT_DATE + ($${params.length}::INT * INTERVAL '1 day')`);
    } else if (status === 'missing') {
      where.push(`${effectiveExpiryDate} IS NULL`);
    } else {
      params.push(days);
      where.push(`(
        ${effectiveExpiryDate} IS NULL
        OR ${effectiveExpiryDate} <= CURRENT_DATE + ($${params.length}::INT * INTERVAL '1 day')
      )`);
    }
    where.push(`NOT (ib.source_type = 'legacy_migration' AND ${effectiveExpiryDate} IS NULL)`);

    const result = await query(
      `SELECT
        ib.id,
        ib.batch_no,
        ${effectiveExpiryDate} AS expiry_date,
        ib.available_qty,
        ib.received_qty,
        ib.cost_price,
        p.id AS product_id,
        p.name AS product_name,
        p.sku,
        p.barcode,
        COALESCE(b.name, '') AS brand_name,
        COALESCE(c.name, '') AS category_name,
        s.id AS store_id,
        s.name AS store_name,
        COALESCE(s.meta->>'locationType', 'Store') AS location_type,
        CASE
          WHEN ${effectiveExpiryDate} IS NULL THEN NULL
          ELSE (${effectiveExpiryDate} - CURRENT_DATE)
        END AS days_to_expiry,
        (ib.available_qty * ib.cost_price) AS stock_value
      FROM inventory_batches ib
      LEFT JOIN stock_in_items sii
        ON ib.source_type = 'stock_in'
       AND sii.id = CASE
         WHEN NULLIF(ib.source_id, '') ~ '^[0-9]+$' THEN NULLIF(ib.source_id, '')::BIGINT
         ELSE NULL
       END
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          MIN(legacy_item.expiry_date) FILTER (WHERE legacy_item.expiry_date >= CURRENT_DATE),
          MIN(legacy_item.expiry_date)
        ) AS expiry_date
        FROM stock_in_items legacy_item
        INNER JOIN stock_in legacy_stock_in
          ON legacy_stock_in.id = legacy_item.stock_in_id
         AND legacy_stock_in.status = 'confirmed'
         AND legacy_stock_in.destination_id = ib.store_id
        WHERE ib.source_type = 'legacy_migration'
          AND legacy_item.product_id = ib.product_id
          AND legacy_item.expiry_date IS NOT NULL
      ) legacy_expiry ON TRUE
      LEFT JOIN products p ON p.id = ib.product_id
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN stores s ON s.id = ib.store_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${effectiveExpiryDate} ASC NULLS LAST, ib.available_qty DESC, p.name ASC
      LIMIT 500`,
      params
    );

    const stockInParams = [];
    const stockInWhere = [
      "COALESCE(si.status, 'confirmed') NOT IN ('cancelled', 'void', 'rejected', 'deleted')",
      'sii.qty > 0',
      `NOT EXISTS (
        SELECT 1
        FROM inventory_batches existing
        WHERE existing.product_id = sii.product_id
          AND existing.store_id = si.destination_id
          AND existing.status = 'active'
          AND existing.available_qty > 0
      )`,
    ];

    const stockInScope = appendStoreScope(stockInWhere, stockInParams, 'si.destination_id', auth.user);
    if (stockInScope.error) return stockInScope.error;

    if (storeId) {
      stockInParams.push(storeId);
      stockInWhere.push(`si.destination_id = $${stockInParams.length}`);
    }

    if (search) {
      stockInParams.push(`%${search}%`);
      stockInWhere.push(`(
        COALESCE(sii.product_name, p.name, '') ILIKE $${stockInParams.length}
        OR COALESCE(p.sku, '') ILIKE $${stockInParams.length}
        OR COALESCE(p.barcode, '') ILIKE $${stockInParams.length}
        OR COALESCE(sii.batch_no, '') ILIKE $${stockInParams.length}
        OR COALESCE(s.name, '') ILIKE $${stockInParams.length}
      )`);
    }

    if (status === 'expired') {
      stockInWhere.push('sii.expiry_date < CURRENT_DATE');
    } else if (status === 'urgent') {
      stockInWhere.push("sii.expiry_date >= CURRENT_DATE AND sii.expiry_date <= CURRENT_DATE + INTERVAL '7 days'");
    } else if (status === 'upcoming') {
      stockInParams.push(days);
      stockInWhere.push(`sii.expiry_date >= CURRENT_DATE AND sii.expiry_date <= CURRENT_DATE + ($${stockInParams.length}::INT * INTERVAL '1 day')`);
    } else if (status === 'missing') {
      stockInWhere.push('sii.expiry_date IS NULL');
    } else {
      stockInParams.push(days);
      stockInWhere.push(`(
        sii.expiry_date IS NULL
        OR sii.expiry_date <= CURRENT_DATE + ($${stockInParams.length}::INT * INTERVAL '1 day')
      )`);
    }

    let stockInRows = [];
    try {
      const stockInResult = await query(
        `SELECT
          sii.id,
          COALESCE(sii.batch_no, si.transaction_id, CONCAT('STK-', si.id::text)) AS batch_no,
          sii.expiry_date,
          sii.qty AS available_qty,
          sii.qty AS received_qty,
          sii.cost_price,
          p.id AS product_id,
          COALESCE(sii.product_name, p.name) AS product_name,
          p.sku,
          p.barcode,
          COALESCE(b.name, '') AS brand_name,
          COALESCE(c.name, '') AS category_name,
          s.id AS store_id,
          s.name AS store_name,
          COALESCE(s.meta->>'locationType', 'Store') AS location_type,
          CASE
            WHEN sii.expiry_date IS NULL THEN NULL
            ELSE (sii.expiry_date - CURRENT_DATE)
          END AS days_to_expiry,
          (sii.qty * sii.cost_price) AS stock_value
        FROM stock_in_items sii
        INNER JOIN stock_in si ON si.id = sii.stock_in_id
        LEFT JOIN products p ON p.id = sii.product_id
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN stores s ON s.id = si.destination_id
        WHERE ${stockInWhere.join(' AND ')}
        ORDER BY sii.expiry_date ASC NULLS LAST, sii.qty DESC, COALESCE(sii.product_name, p.name) ASC
        LIMIT 500`,
        stockInParams
      );
      stockInRows = stockInResult.rows;
    } catch (fallbackErr) {
      console.error('[inventory expiry-alerts stock-in fallback]', fallbackErr.message);
    }

    const records = [...result.rows, ...stockInRows].map((row) => {
      const daysToExpiry = row.days_to_expiry === null ? null : Number(row.days_to_expiry);
      const isExpired = daysToExpiry !== null && daysToExpiry < 0;
      const bucket = daysToExpiry === null
        ? 'Missing Expiry'
        : isExpired
        ? 'Expired'
        : daysToExpiry <= 3
          ? 'Critical'
          : daysToExpiry <= 7
            ? 'Urgent'
            : daysToExpiry <= 15
              ? 'Soon'
              : 'Upcoming';

      const stockValue = Number(row.stock_value || 0);
      const availableQty = Number(row.available_qty || 0);
      return {
        id: Number(row.id),
        productId: Number(row.product_id),
        productName: row.product_name || 'Product',
        sku: row.sku || '',
        barcode: row.barcode || '',
        brandName: row.brand_name || '',
        categoryName: row.category_name || '',
        storeId: row.store_id ? Number(row.store_id) : null,
        storeName: row.store_name || '',
        locationType: row.location_type || '',
        batchNo: row.batch_no || '',
        expiryDate: formatDateOnly(row.expiry_date),
        daysToExpiry,
        availableQty,
        receivedQty: Number(row.received_qty || 0),
        costPrice: Number(row.cost_price || 0),
        stockValue,
        bucket,
        riskScore: getRiskScore({ daysToExpiry, isExpired, availableQty, stockValue }),
        suggestedAction: getAction(daysToExpiry, isExpired),
      };
    }).sort((a, b) => {
      if (a.bucket === 'Missing Expiry' && b.bucket !== 'Missing Expiry') return -1;
      if (b.bucket === 'Missing Expiry' && a.bucket !== 'Missing Expiry') return 1;
      return b.riskScore - a.riskScore || (a.daysToExpiry ?? 9999) - (b.daysToExpiry ?? 9999);
    }).map((row, index) => ({
      ...row,
      sellOrder: row.bucket === 'Missing Expiry' ? 'Fix date first' : row.bucket === 'Expired' ? 'Do not sell' : `FEFO #${index + 1}`,
    }));

    const summary = records.reduce(
      (acc, row) => {
        acc.totalBatches += 1;
        acc.totalQty += row.availableQty;
        acc.totalValue += row.stockValue;
        if (row.bucket === 'Missing Expiry') acc.missing += 1;
        else if (row.bucket === 'Expired') acc.expired += 1;
        else if (row.bucket === 'Critical') acc.critical += 1;
        else if (row.bucket === 'Urgent') acc.urgent += 1;
        if (['Critical', 'Urgent'].includes(row.bucket)) {
          acc.weeklyRiskQty += row.availableQty;
          acc.weeklyRiskValue += row.stockValue;
        }
        if (!acc.storeBreakdown[row.storeId || 'unknown']) {
          acc.storeBreakdown[row.storeId || 'unknown'] = {
            storeId: row.storeId,
            storeName: row.storeName || 'Unknown store',
            batches: 0,
            qty: 0,
            value: 0,
            critical: 0,
            urgent: 0,
            missing: 0,
          };
        }
        const store = acc.storeBreakdown[row.storeId || 'unknown'];
        store.batches += 1;
        store.qty += row.availableQty;
        store.value += row.stockValue;
        if (row.bucket === 'Critical') store.critical += 1;
        if (row.bucket === 'Urgent') store.urgent += 1;
        if (row.bucket === 'Missing Expiry') store.missing += 1;
        return acc;
      },
      {
        totalBatches: 0,
        totalQty: 0,
        totalValue: 0,
        missing: 0,
        expired: 0,
        critical: 0,
        urgent: 0,
        weeklyRiskQty: 0,
        weeklyRiskValue: 0,
        storeBreakdown: {},
      }
    );
    summary.storeBreakdown = Object.values(summary.storeBreakdown)
      .sort((a, b) => b.value - a.value || b.batches - a.batches)
      .slice(0, 8);
    summary.topStore = summary.storeBreakdown[0] || null;

    return NextResponse.json({ success: true, data: { records, summary, days } });
  } catch (err) {
    console.error('[inventory expiry-alerts GET]', err.message);
    return NextResponse.json({ success: false, message: 'Failed to load expiry alerts', data: { records: [], summary: {} } }, { status: 500 });
  }
}
