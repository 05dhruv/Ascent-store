// File: src/app/api/sales-order/customer-history/route.js

import { query } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-response';
import { ensureSalesBillingSchema } from '@/lib/salesBillingSchema';
import { extractAuthUser, requirePermission, requireStore } from '@/lib/api-protection';

export async function GET(request) {
  try {
    await ensureSalesBillingSchema();

    const auth = await extractAuthUser(request);
    if (auth.error || !auth.user) return errorResponse(auth.error || 'Unauthorized', 401);
    const permissionCheck = requirePermission(auth.user, 'CREATE_POS_BILL', 'MANAGE_BILLING', 'VIEW_ORDERS', 'MANAGE_ORDERS');
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const requestedStoreId = Number(searchParams.get('store_id') || 0) || null;

    if (!search.trim()) {
      return errorResponse('Search term required', 400);
    }

    const needle = `%${search.toLowerCase()}%`;
    const where = [
      `(LOWER(sb.customer_name) LIKE $1 OR LOWER(sb.customer_mobile) LIKE $1)`,
    ];
    const params = [needle];

    if (requestedStoreId) {
      const storeCheck = requireStore(auth.user, requestedStoreId);
      if (storeCheck.error) return storeCheck.error;
      params.push(requestedStoreId);
      where.push(`sb.store_id = $${params.length}`);
    } else if (auth.user.role !== 'super_admin') {
      const assignedStores = (auth.user.assigned_stores || []).map(Number).filter(Number.isFinite);
      if (assignedStores.length === 0) {
        return successResponse({
          bills: [],
          stats: { totalBills: 0, totalSpent: 0, avgBill: 0, lastPurchase: null },
        });
      }
      params.push(assignedStores);
      where.push(`sb.store_id = ANY($${params.length}::int[])`);
    }

    const whereSql = where.join(' AND ');

    // Search by customer name or mobile number
    const billsRes = await query(
      `
      SELECT
        sb.id,
        sb.bill_number AS "billNumber",
        sb.customer_name AS "customerName",
        sb.customer_mobile AS "customerMobile",
        sb.grand_total AS "grandTotal",
        sb.payment_mode AS "paymentMode",
        sb.payment_meta AS "payments",
        sb.status,
        sb.created_at AS "createdAt",
        COUNT(sbi.id) AS "itemCount",
        COALESCE(sb.discount_total, 0) AS "discountTotal",
        COALESCE(sb.tax_total, 0) AS "taxTotal"
      FROM sales_bills sb
      LEFT JOIN sales_bill_items sbi ON sb.id = sbi.sales_bill_id
      WHERE ${whereSql}
      GROUP BY sb.id
      ORDER BY sb.created_at DESC
      LIMIT 50
      `,
      params
    );

    const bills = billsRes.rows.map(row => ({
      id: row.id,
      billNumber: row.billNumber,
      customerName: row.customerName,
      customerMobile: row.customerMobile,
      grandTotal: parseFloat(row.grandTotal || 0),
      paymentMode: row.paymentMode,
      payments: Array.isArray(row.payments) ? row.payments : [],
      status: row.status,
      createdAt: row.createdAt,
      itemCount: parseInt(row.itemCount || 0),
      discountTotal: parseFloat(row.discountTotal || 0),
      taxTotal: parseFloat(row.taxTotal || 0),
    }));

    // Get summary stats
    const statsRes = await query(
      `
      SELECT
        COUNT(*) AS "totalBills",
        SUM(sb.grand_total) AS "totalSpent",
        AVG(sb.grand_total) AS "avgBill",
        MAX(sb.created_at) AS "lastPurchase"
      FROM sales_bills sb
      WHERE ${whereSql}
      `,
      params
    );

    const stats = statsRes.rows[0];

    return successResponse({
      bills,
      stats: {
        totalBills: parseInt(stats.totalBills || 0),
        totalSpent: parseFloat(stats.totalSpent || 0),
        avgBill: parseFloat(stats.avgBill || 0),
        lastPurchase: stats.lastPurchase,
      },
    });
  } catch (err) {
    console.error('Customer history error:', err);
    return errorResponse(err.message || 'Failed to load customer history');
  }
}
