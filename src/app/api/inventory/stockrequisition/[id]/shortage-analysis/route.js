import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureStockRequisitionSchema } from '@/lib/stockRequisitionSchema';
import { ensureVendorsSchema } from '@/lib/vendorsSchema';
import { ensureInventoryBatchSchema } from '@/lib/inventoryBatching';
import { requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

export async function GET(request, { params }) {
  try {
    await Promise.allSettled([
      ensureStockRequisitionSchema(),
      ensureVendorsSchema(),
      ensureInventoryBatchSchema(),
    ]);

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      'MANAGE_INVENTORY',
      'STOCK_REQUISITION_VIEW',
      'STOCK_REQUISITION_CREATE',
      'STOCK_REQUISITION_APPROVE',
      'MANAGE_PURCHASE_ORDERS'
    );
    if (permissionCheck.error) return permissionCheck.error;

    const resolvedParams = await params;
    const requisitionId = Number(resolvedParams?.id);
    if (!Number.isFinite(requisitionId)) {
      return NextResponse.json({ error: 'Invalid requisition id' }, { status: 400 });
    }

    // 1. Fetch Requisition with Store & User details
    const reqRes = await query(
      `SELECT
        sr.id,
        sr.transaction_id,
        sr.source_id,
        sr.destination_id,
        sr.requested_by,
        sr.requested_by_user_id,
        sr.mail_to,
        sr.remarks,
        sr.status,
        sr.fulfillment_status,
        sr.approval_status,
        sr.shortage_status,
        sr.total_shortage_qty,
        sr.purchase_order_id,
        sr.stock_transfer_id,
        sr.vendor_id,
        sr.vendor_email,
        sr.po_emailed_at,
        sr.created_at,
        sr.approved_at,
        sr.approved_by_user_id,
        s_src.name AS source_name,
        s_src.address AS source_address,
        s_dest.name AS destination_name,
        s_dest.address AS destination_address,
        u_req.name AS requester_user_name,
        u_req.email AS requester_user_email,
        u_app.name AS approved_by_user_name,
        po.transaction_id AS po_transaction_id,
        v.name AS linked_vendor_name,
        v.email AS linked_vendor_email
       FROM stock_requisitions sr
       LEFT JOIN stores s_src ON s_src.id = sr.source_id
       LEFT JOIN stores s_dest ON s_dest.id = sr.destination_id
       LEFT JOIN users u_req ON u_req.id = sr.requested_by_user_id
       LEFT JOIN users u_app ON u_app.id = sr.approved_by_user_id
       LEFT JOIN purchase_orders po ON po.id = sr.purchase_order_id
       LEFT JOIN vendors v ON v.id = sr.vendor_id
       WHERE sr.id = $1`,
      [requisitionId]
    );

    if (!reqRes.rows.length) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
    }

    const requisition = reqRes.rows[0];
    const sourceStoreId = requisition.source_id;

    // 2. Fetch Requisition Items with Product & Dimensions details
    const itemsRes = await query(
      `SELECT
        sri.id AS item_id,
        sri.product_id,
        COALESCE(sri.product_name, p.name) AS product_name,
        sri.qty AS requested_qty,
        COALESCE(sri.unit, p.unit, 'PCS') AS unit,
        COALESCE(sri.dimensions, p.dimensions, '') AS dimensions,
        COALESCE(NULLIF(sri.cost_price, 0), p.cost_price, 0) AS cost_price,
        p.mrp,
        p.brand_id,
        b.name AS brand_name,
        p.category_id,
        c.name AS category_name
       FROM stock_requisition_items sri
       LEFT JOIN products p ON p.id = sri.product_id
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE sri.requisition_id = $1
       ORDER BY sri.id ASC`,
      [requisitionId]
    );

    // 3. Fetch All Active Vendors for matching (capped)
    const allVendorsRes = await query(
      `SELECT id, name, company, email, mobile_number, margin, credit_days, address_1, city, state
       FROM vendors
       WHERE is_active = TRUE
       ORDER BY name ASC
       LIMIT 200`
    );
    const allVendors = allVendorsRes.rows;

    const productIds = itemsRes.rows.map((item) => item.product_id).filter(Boolean);
    const brandIds = [
      ...new Set(itemsRes.rows.map((item) => item.brand_id).filter(Boolean)),
    ];

    // 4. Batched stock + vendor lookups (avoid N+1)
    const [stockRes, pastPoVendorsRes, brandVendorsRes] = await Promise.all([
      sourceStoreId && productIds.length
        ? query(
            `SELECT product_id, COALESCE(SUM(available_qty), 0) AS available_qty
             FROM inventory_batches
             WHERE product_id = ANY($1::int[])
               AND store_id = $2
               AND status = 'active'
               AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
             GROUP BY product_id`,
            [productIds, sourceStoreId],
          )
        : Promise.resolve({ rows: [] }),
      productIds.length
        ? query(
            `SELECT DISTINCT ON (poi.product_id, v.id)
               poi.product_id, v.id, v.name, v.company, v.email, v.mobile_number,
               poi.cost_price AS last_purchase_rate, 'past_supplier' AS match_type
             FROM purchase_order_items poi
             JOIN purchase_orders po ON po.id = poi.purchase_order_id
             JOIN vendors v ON v.id = po.vendor_id
             WHERE poi.product_id = ANY($1::int[]) AND v.is_active = TRUE
             ORDER BY poi.product_id, v.id, poi.cost_price ASC`,
            [productIds],
          )
        : Promise.resolve({ rows: [] }),
      brandIds.length
        ? query(
            `SELECT vb.brand_id, v.id, v.name, v.company, v.email, v.mobile_number,
                    0 AS last_purchase_rate, 'authorized_brand_vendor' AS match_type
             FROM vendors v
             JOIN vendor_brands vb ON vb.vendor_id = v.id
             WHERE vb.brand_id = ANY($1::int[]) AND v.is_active = TRUE`,
            [brandIds],
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const stockByProduct = new Map(
      (stockRes.rows || []).map((row) => [String(row.product_id), Number(row.available_qty || 0)]),
    );
    const pastVendorsByProduct = new Map();
    for (const row of pastPoVendorsRes.rows || []) {
      const key = String(row.product_id);
      if (!pastVendorsByProduct.has(key)) pastVendorsByProduct.set(key, []);
      const list = pastVendorsByProduct.get(key);
      if (list.length < 3) list.push(row);
    }
    const brandVendorsByBrand = new Map();
    for (const row of brandVendorsRes.rows || []) {
      const key = String(row.brand_id);
      if (!brandVendorsByBrand.has(key)) brandVendorsByBrand.set(key, []);
      const list = brandVendorsByBrand.get(key);
      if (list.length < 3) list.push(row);
    }

    const analyzedItems = itemsRes.rows.map((item) => {
      const reqQty = Number(item.requested_qty || 0);
      const availableQty = stockByProduct.get(String(item.product_id)) || 0;
      const shortageQty = Math.max(0, reqQty - availableQty);
      const fulfilledFromStock = Math.min(reqQty, availableQty);
      const isShortage = shortageQty > 0;

      const vendorMap = new Map();
      for (const v of pastVendorsByProduct.get(String(item.product_id)) || []) {
        vendorMap.set(v.id, { ...v, reason: 'Previous supplier for this material' });
      }
      for (const v of brandVendorsByBrand.get(String(item.brand_id)) || []) {
        if (!vendorMap.has(v.id)) {
          vendorMap.set(v.id, {
            ...v,
            reason: `Authorized vendor for brand ${item.brand_name || ''}`,
          });
        }
      }

      const matchedVendors = Array.from(vendorMap.values());
      const primaryVendor =
        matchedVendors[0] ||
        (allVendors.length ? { ...allVendors[0], reason: 'Active vendor' } : null);

      return {
        ...item,
        requested_qty: reqQty,
        available_qty: availableQty,
        shortage_qty: shortageQty,
        fulfilled_from_stock: fulfilledFromStock,
        is_shortage: isShortage,
        recommended_vendors: matchedVendors,
        primary_vendor: primaryVendor,
      };
    });

    const totalRequestedQty = analyzedItems.reduce((sum, item) => sum + item.requested_qty, 0);
    const totalAvailableQty = analyzedItems.reduce((sum, item) => sum + item.fulfilled_from_stock, 0);
    const totalShortageQty = analyzedItems.reduce((sum, item) => sum + item.shortage_qty, 0);
    const hasShortage = totalShortageQty > 0;

    const vendorFrequency = {};
    for (const item of analyzedItems) {
      if (item.is_shortage && item.primary_vendor) {
        vendorFrequency[item.primary_vendor.id] =
          (vendorFrequency[item.primary_vendor.id] || 0) + 1;
      }
    }
    const bestVendorId = Object.keys(vendorFrequency).sort(
      (a, b) => vendorFrequency[b] - vendorFrequency[a],
    )[0];
    const topRecommendedVendor =
      allVendors.find((v) => String(v.id) === String(bestVendorId)) ||
      allVendors[0] ||
      null;

    return NextResponse.json({
      success: true,
      data: {
        requisition: {
          ...requisition,
          has_shortage: hasShortage,
          total_requested_qty: totalRequestedQty,
          total_available_qty: totalAvailableQty,
          total_shortage_qty: totalShortageQty,
          shortage_level:
            totalAvailableQty === 0
              ? 'full_shortage'
              : hasShortage
                ? 'partial_shortage'
                : 'no_shortage',
        },
        items: analyzedItems,
        all_vendors: allVendors,
        top_recommended_vendor: topRecommendedVendor,
      },
    });
  } catch (err) {
    console.error('[shortage-analysis]', err);
    return NextResponse.json(
      { error: err.message || 'Failed to perform shortage analysis' },
      { status: 500 }
    );
  }
}
