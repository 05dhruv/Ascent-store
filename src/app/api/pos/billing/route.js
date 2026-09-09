import { getClient, query } from '@/lib/db';
import { successResponse, errorResponse, notFoundError } from '@/lib/api-response';
import { ensureSalesBillingSchema } from '@/lib/salesBillingSchema';
import { ensureSalesReturnsSchema } from '@/lib/salesReturnsSchema';
import { ensureInvoiceSalesOrdersSchema } from '@/lib/invoiceSalesOrdersSchema';
import { allocateBatchStock, ensureInventoryBatchSchema, getInventoryIssueStrategy } from '@/lib/inventoryBatching';
import { deleteSalesBillAndRestoreStock } from '@/lib/salesBillDeletion';
import { auditLog, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';
import { validatePhoneNumber } from '@/lib/phoneValidator';
import { generateSequentialSalesBillNumber } from '@/lib/invoiceSequence';
import { validatePriceSet } from '@/lib/priceIntegrity';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function canReturnCashChangeForMethod(method) {
  return ['cash', 'upi'].includes(String(method || '').trim().toLowerCase());
}

export async function POST(req) {
  let client;
  try {
    await ensureSalesBillingSchema();
    await ensureInvoiceSalesOrdersSchema();
    await ensureInventoryBatchSchema();

    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'CREATE_POS_BILL', 'MANAGE_BILLING');
    if (permissionCheck.error) return permissionCheck.error;
    const user = auth.user;

    const body = await req.json();
    const {
      store_id,
      customer_id,
      customer_name,
      customer_mobile,
      items = [],
      payment_mode,
      payments = [],
      total_amount,
      total_tax,
      discount_amount = 0,
      round_off = 0,
      notes = '',
      invoice_number,
    } = body;

    if (!store_id || !items.length || total_amount === undefined || total_amount === null || toNumber(total_amount) < 0) {
      return errorResponse('Missing required fields', 400);
    }
    const normalizedCustomerName = String(customer_name || '').trim() || 'Walk-in Customer';
    const normalizedCustomerMobile = String(customer_mobile || '').replace(/\D/g, '').slice(0, 10);
    if (!normalizedCustomerMobile) return errorResponse('Customer mobile number is required for billing', 400);
    const phoneValidation = validatePhoneNumber(normalizedCustomerMobile);
    if (!phoneValidation.isValid) return errorResponse(phoneValidation.error, 400);

    const storeCheck = requireStore(user, store_id);
    if (storeCheck.error) return storeCheck.error;

    client = await getClient();
    await client.query('BEGIN');

    const normalizedItems = [];
    let calculatedSubtotal = 0;
    let calculatedTax = 0;
    let calculatedExclusiveTax = 0;

    for (const item of items) {
      const productId = Number(item.product_id || item.productId);
      const qty = toNumber(item.qty);
      if (!productId || qty <= 0) throw new Error('Invalid product or quantity');
      const selectedBatchId = Number(item.selectedBatchId || item.selected_batch_id || item.batchId || item.batch_id || 0) || null;
      const selectedBatchIds = (Array.isArray(item.selectedBatchIds) ? item.selectedBatchIds : [])
        .map(Number)
        .filter((id) => Number.isFinite(id) && id > 0);

      const productRes = await client.query(
        `SELECT p.id, p.name, p.sku, p.barcode, p.mrp, p.selling_price, p.cost_price,
                p.include_tax, COALESCE(t.rate, 0) AS tax_rate, t.name AS tax_name, t.tax_type
         FROM products p
         LEFT JOIN taxes t ON p.tax_id = t.id
         WHERE p.id = $1
         FOR UPDATE OF p`,
        [productId]
      );
      const product = productRes.rows[0];
      if (!product) throw new Error(`Product ${productId} not found`);

      const sellingPrice = toNumber(item.selling_price ?? item.sellingPrice, toNumber(product.selling_price));
      const priceValidation = validatePriceSet({
        mrp: item.mrp ?? product.mrp,
        sellingPrice,
        costPrice: item.cost_price ?? product.cost_price,
      });
      if (!priceValidation.valid) throw new Error(priceValidation.error);
      const taxRate = toNumber(product.tax_rate);
      const itemDiscount = toNumber(item.discount_amount ?? item.discountAmount);
      const lineSubtotal = qty * sellingPrice;
      const taxableGross = Math.max(0, lineSubtotal - itemDiscount);
      const lineTax = taxRate
        ? product.include_tax
          ? taxableGross - taxableGross / (1 + taxRate / 100)
          : (taxableGross * taxRate) / 100
        : 0;
      const lineTotal = product.include_tax ? taxableGross : Math.max(0, taxableGross + lineTax);

      calculatedSubtotal += lineSubtotal;
      calculatedTax += lineTax;
      if (!product.include_tax) calculatedExclusiveTax += lineTax;
      normalizedItems.push({ item, product, productId, qty, sellingPrice, taxRate, itemDiscount, lineTax, lineTotal, selectedBatchId, selectedBatchIds });
    }

    const clientInvoiceNumber = String(invoice_number || '').trim();
    const billNumber = await generateSequentialSalesBillNumber(client, store_id);
    const subtotal = calculatedSubtotal;
    const taxTotal = calculatedTax;
    const discountTotal = toNumber(discount_amount);
    const grandTotal = Math.max(0, subtotal - discountTotal + calculatedExclusiveTax + toNumber(round_off));
    const normalizedPayments = (Array.isArray(payments) && payments.length ? payments : [{ method: payment_mode || 'cash', amount: grandTotal, referenceNo: '' }])
      .map((payment) => ({
        method: String(payment.method || payment.payment_mode || payment_mode || 'cash').trim().toLowerCase(),
        amount: toNumber(payment.amount),
        referenceNo: String(payment.referenceNo || payment.reference_no || '').trim(),
      }))
      .filter((payment) => payment.amount > 0);
    const paidAmount = normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const changeDue = Math.max(0, Math.round((paidAmount - grandTotal) * 100) / 100);
    const paidBillAmount = Math.min(paidAmount, grandTotal);
    const changeReturnableTenderAmount = normalizedPayments.reduce(
      (sum, payment) => canReturnCashChangeForMethod(payment.method) ? sum + payment.amount : sum,
      0
    );
    const nonReturnableTenderAmount = normalizedPayments.reduce(
      (sum, payment) => canReturnCashChangeForMethod(payment.method) ? sum : sum + payment.amount,
      0
    );
    if (!normalizedPayments.length) {
      await client.query('ROLLBACK');
      return errorResponse('Add at least one payment', 400);
    }
    if (grandTotal - paidAmount > 0.01) {
      await client.query('ROLLBACK');
      return errorResponse(`Payment is short by ${Math.round((grandTotal - paidAmount) * 100) / 100}`, 400);
    }
    if (nonReturnableTenderAmount > grandTotal + 0.01) {
      await client.query('ROLLBACK');
      return errorResponse('Card, online or credit payment cannot exceed the bill total.', 400);
    }
    if (changeDue > 0.01 && changeReturnableTenderAmount < changeDue - 0.01) {
      await client.query('ROLLBACK');
      return errorResponse(`Extra payment can be accepted only for cash/UPI change return. Return ${changeDue} in cash`, 400);
    }
    const finalPaymentMode = normalizedPayments.length > 1 ? 'split' : (normalizedPayments[0]?.method || payment_mode || 'cash');
    const paymentMeta = normalizedPayments.map((payment) => ({
      ...payment,
      tenderedAmount: payment.amount,
    }));
    if (changeDue > 0.01) {
      paymentMeta.push({
        method: 'cash_change',
        amount: -changeDue,
        tenderedAmount: 0,
        referenceNo: '',
      });
    }
    const settlementPayments = normalizedPayments.map((payment) => ({ ...payment }));
    if (changeDue > 0.01) {
      settlementPayments.push({
        method: 'cash',
        amount: -changeDue,
        referenceNo: '',
        meta: { type: 'change_return', source: 'over_tender' },
      });
    }

    const billRes = await client.query(`
      INSERT INTO sales_bills (
        bill_number, store_id, customer_name, customer_mobile,
        subtotal, discount_total, tax_total, round_off, grand_total,
        paid_amount, balance_amount, payment_mode, payment_meta, remarks, user_id, status, meta,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9,
        $10, 0, $11, $12::jsonb, $13, $14, 'completed', $15::jsonb,
        NOW(), NOW()
      ) RETURNING id, bill_number, public_token, created_at
    `, [
      billNumber,
      Number(store_id),
      normalizedCustomerName,
      normalizedCustomerMobile,
      subtotal,
      discountTotal,
      taxTotal,
      toNumber(round_off),
      grandTotal,
      paidBillAmount,
      finalPaymentMode,
      JSON.stringify(paymentMeta),
      notes,
      user.id,
      JSON.stringify({
        source: 'legacy-pos-billing',
        clientInvoiceNumber: clientInvoiceNumber || null,
        customer_id: customer_id || null,
        payments: paymentMeta,
        paidTenderedAmount: paidAmount,
        changeDue,
        billed_by: {
          user_id: user.id,
          name: user.name || user.email || null,
          email: user.email || null,
          role: user.role || null,
        },
      }),
    ]);

    const bill_id = billRes.rows[0]?.id;

    const stockOutRes = await client.query(
      `INSERT INTO stock_out (
         transaction_id, method, destination_id, apply_taxes, add_products_prefill,
         status, invoice_number, total_items, total_cost, total_tax,
         reference_type, reference_id, meta, created_at, confirmed_at
       ) VALUES (
         $1, 'pos_sale', $2, true, false,
         'confirmed', $3, $4, 0, $5,
         'sales_bill', $6, $7::jsonb, NOW(), NOW()
       ) RETURNING id`,
      [
        `POS-STKO-${bill_id}`,
        Number(store_id),
        billNumber,
        normalizedItems.reduce((sum, row) => sum + row.qty, 0),
        taxTotal,
        String(bill_id),
        JSON.stringify({ source: 'legacy-pos-billing', billId: bill_id, billNumber, billedByUserId: user.id, billedBy: user.name || user.email || null }),
      ]
    );

    const stockOutId = stockOutRes.rows[0]?.id;
    const issueStrategy = getInventoryIssueStrategy();

    for (const row of normalizedItems) {
      const allocations = await allocateBatchStock(client, {
        productId: row.productId,
        storeId: Number(store_id),
        qty: row.qty,
        preferredBatchId: row.selectedBatchIds.length ? null : row.selectedBatchId,
        allowedBatchIds: row.selectedBatchIds,
        strategy: issueStrategy,
        referenceType: 'sales_bill',
        referenceId: bill_id,
        meta: { billNumber, stockOutId },
      });
      const allocatedSellingPrices = [...new Set(
        allocations
          .map((allocation) => toNumber(allocation.sellingPrice))
          .filter((price) => price > 0),
      )];
      if (
        allocatedSellingPrices.length &&
        allocatedSellingPrices.some(
          (price) => Math.abs(price - row.sellingPrice) > 0.0001,
        )
      ) {
        throw new Error(
          `${row.product.name} price changed for the selected batch. Refresh the cart and bill again.`,
        );
      }

      await client.query(`
        INSERT INTO sales_bill_items (
          sales_bill_id, product_id, product_name, barcode, sku, qty,
          selling_price, mrp, tax_rate, tax_name, tax_type, include_tax,
          taxable_amount, discount_amount, tax_amount, line_total, promotion_id, promotion_name,
          is_promotion_free, batch_allocations
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb)
      `, [
        bill_id,
        row.productId,
        row.item.product_name || row.item.name || row.product.name,
        row.item.barcode || row.product.barcode || null,
        row.item.sku || row.product.sku || null,
        row.qty,
        row.sellingPrice,
        toNumber(row.item.mrp, toNumber(row.product.mrp)),
        row.taxRate,
        row.product.tax_name || null,
        row.product.tax_type || null,
        !!row.product.include_tax,
        row.product.include_tax
          ? Math.max(0, row.qty * row.sellingPrice - row.itemDiscount - row.lineTax)
          : Math.max(0, row.qty * row.sellingPrice - row.itemDiscount),
        row.itemDiscount,
        row.lineTax,
        row.lineTotal,
        Number(row.item.promotion_id || row.item.promotionId) || null,
        row.item.promotion_name || row.item.promotionName || null,
        Boolean(row.item.promotion_free_item || row.item.promotionFreeItem),
        JSON.stringify(allocations),
      ]);

      for (const allocation of allocations) {
        await client.query(
          `INSERT INTO stock_out_items (
             stock_out_id, product_id, product_name, qty, cost_price, tax_value,
             batch_id, batch_no, expiry_date, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
          [
            stockOutId,
            row.productId,
            row.item.product_name || row.item.name || row.product.name,
            allocation.qty,
            allocation.costPrice || toNumber(row.item.cost_price, toNumber(row.product.cost_price)),
            row.taxRate,
            allocation.batchId,
            allocation.batchNo,
            allocation.expiryDate,
          ]
        );
      }
    }

    for (const payment of settlementPayments) {
      await client.query(
        `INSERT INTO sales_bill_payments (sales_bill_id, method, amount, reference_no, meta, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
        [bill_id, payment.method || finalPaymentMode, payment.amount, payment.referenceNo || '', JSON.stringify(payment.meta || {})]
      );
    }

    const invoiceRes = await client.query(`
      INSERT INTO invoice_sales_orders (
        transaction_id, sales_order_id, sales_order_type, booking_id, booking_date,
        billing_user_id, sales_bill_id, customer_name, customer_mobile, payment_mode,
        gross_bill, total_discount, invoice_id, invoice_date, status, store_id, meta
      ) VALUES (
        $1, $2, 'POS', $3, CURRENT_DATE,
        $4, $5, $6, $7, $8,
        $9, $10, $11, CURRENT_DATE, 'generated', $12, $13::jsonb
      ) RETURNING id, invoice_id
    `, [
      `INV-${bill_id}`,
      billNumber,
      billNumber,
      user.id,
      bill_id,
      normalizedCustomerName,
      normalizedCustomerMobile,
      finalPaymentMode,
      grandTotal,
      discountTotal,
      billNumber,
      Number(store_id),
      JSON.stringify({ source: 'legacy-pos-billing' }),
    ]);

    await client.query('COMMIT');
    await auditLog(user.id, 'pos_bill.create', 'sales_bill', bill_id, {
      billNumber,
      storeId: Number(store_id),
      grandTotal,
      paidBillAmount,
      itemCount: normalizedItems.length,
    });

    return successResponse({
      bill_id,
      bill_number: billRes.rows[0]?.bill_number,
      invoice_number: invoiceRes.rows[0]?.invoice_id,
      public_token: billRes.rows[0]?.public_token,
      total_amount: grandTotal,
      total_tax: taxTotal,
      status: 'completed'
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('POS billing error:', err);
    return errorResponse(err.message);
  } finally {
    if (client) client.release();
  }
}

// Get bill details
export async function GET(req) {
  try {
    await ensureSalesBillingSchema();
    await ensureSalesReturnsSchema();

    const { searchParams } = new URL(req.url);
    const bill_id = searchParams.get('bill_id');

    if (!bill_id) return errorResponse('bill_id required', 400);

    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'CREATE_POS_BILL', 'MANAGE_BILLING', 'VIEW_ORDERS', 'MANAGE_ORDERS', 'PROCESS_STORE_BILL_EXCHANGE');
    if (permissionCheck.error) return permissionCheck.error;

    const billLookup = String(bill_id).trim();
    const invoiceLookup = billLookup.toUpperCase().startsWith('INV-') ? billLookup : `INV-${billLookup}`;
    const withoutInvoicePrefix = billLookup.replace(/^INV-/i, '');
    const numericId = /^\d+$/.test(billLookup) ? Number(billLookup) : -1;
    const billRes = await query(
      `SELECT
         sb.*,
         s.name AS store_name,
         CONCAT_WS(', ', s.address_line1, s.address_line2, s.city, s.state, s.pincode) AS store_address,
         s.manager_mobile AS store_phone
       FROM sales_bills sb
       LEFT JOIN stores s ON s.id = sb.store_id
       WHERE sb.bill_number IN ($1, $2, $3)
          OR sb.id = $4
       ORDER BY
         CASE
           WHEN sb.bill_number = $1 THEN 1
           WHEN sb.bill_number = $2 THEN 2
           WHEN sb.bill_number = $3 THEN 3
           ELSE 4
         END
       LIMIT 1`,
      [billLookup, invoiceLookup, withoutInvoicePrefix, numericId]
    );

    const bill = billRes.rows[0];
    if (!bill) {
      return notFoundError('Bill not found');
    }

    const storeCheck = requireStore(auth.user, bill.store_id);
    if (storeCheck.error) return storeCheck.error;

    const itemsRes = await query(`
      SELECT
        sbi.*,
        COALESCE(sbi.product_name, p.name) AS name,
        COALESCE(sbi.sku, p.sku) AS sku,
        COALESCE(return_summary.returned_qty, 0) AS returned_qty,
        GREATEST(COALESCE(sbi.qty, 0) - COALESCE(return_summary.returned_qty, 0), 0) AS returnable_qty,
        return_state.status AS return_status,
        return_state.return_id,
        return_state.return_number,
        return_state.updated_at AS return_updated_at
      FROM sales_bill_items sbi
      JOIN products p ON sbi.product_id = p.id
      LEFT JOIN LATERAL (
        SELECT sr.status, sr.id AS return_id, sr.return_number, sr.updated_at
        FROM sales_return_items sri
        INNER JOIN sales_returns sr ON sr.id = sri.sales_return_id
        WHERE sr.original_bill_id = sbi.sales_bill_id
          AND sri.product_id = sbi.product_id
          AND sr.status <> 'declined'
        ORDER BY
          CASE sr.status
            WHEN 'completed' THEN 1
            WHEN 'approved' THEN 2
            WHEN 'pending' THEN 3
            ELSE 4
          END,
          sr.updated_at DESC
        LIMIT 1
      ) return_state ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(COALESCE(sri.qty, 0)) AS returned_qty
        FROM sales_return_items sri
        INNER JOIN sales_returns sr ON sr.id = sri.sales_return_id
        WHERE sr.original_bill_id = sbi.sales_bill_id
          AND sri.product_id = sbi.product_id
          AND sr.status <> 'declined'
      ) return_summary ON TRUE
      WHERE sbi.sales_bill_id = $1
    `, [bill.id]);
    const paymentsRes = await query(
      `SELECT method, amount, reference_no AS "referenceNo", meta, created_at AS "createdAt"
       FROM sales_bill_payments
       WHERE sales_bill_id = $1
       ORDER BY id ASC`,
      [bill.id]
    );

    return successResponse({
      bill: { ...bill, payments: paymentsRes.rows || [] },
      items: itemsRes.rows || [],
      payments: paymentsRes.rows || []
    });
  } catch (err) {
    return errorResponse(err.message);
  }
}

export async function PATCH(req) {
  let client;
  try {
    await ensureSalesBillingSchema();

    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'CREATE_POS_BILL', 'MANAGE_BILLING');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await req.json();
    const action = String(body.action || '').trim();
    if (action !== 'return_cash') return errorResponse('Unsupported billing action', 400);

    const billId = String(body.bill_id || body.billId || body.id || '').trim();
    const amount = Math.round(toNumber(body.amount) * 100) / 100;
    const reason = String(body.reason || '').trim();
    const tenderMethod = String(body.tender_method || body.tenderMethod || 'upi').trim().toLowerCase();
    const referenceNo = String(body.referenceNo || body.reference_no || '').trim();

    if (!billId) return errorResponse('bill_id required', 400);
    if (amount <= 0) return errorResponse('Return amount must be greater than zero', 400);
    if (!reason) return errorResponse('Reason is required for cash return', 400);
    if (tenderMethod === 'cash' || tenderMethod === 'cash_change') {
      return errorResponse('Select the non-cash mode where extra amount was received', 400);
    }

    const billLookup = billId;
    const invoiceLookup = billLookup.toUpperCase().startsWith('INV-') ? billLookup : `INV-${billLookup}`;
    const withoutInvoicePrefix = billLookup.replace(/^INV-/i, '');
    const numericId = /^\d+$/.test(billLookup) ? Number(billLookup) : -1;

    client = await getClient();
    await client.query('BEGIN');

    const billRes = await client.query(
      `SELECT *
       FROM sales_bills
       WHERE bill_number IN ($1, $2, $3)
          OR id = $4
       ORDER BY
         CASE
           WHEN bill_number = $1 THEN 1
           WHEN bill_number = $2 THEN 2
           WHEN bill_number = $3 THEN 3
           ELSE 4
         END
       LIMIT 1
       FOR UPDATE`,
      [billLookup, invoiceLookup, withoutInvoicePrefix, numericId]
    );
    const bill = billRes.rows[0];
    if (!bill) {
      await client.query('ROLLBACK');
      return notFoundError('Bill not found');
    }

    const storeCheck = requireStore(auth.user, bill.store_id);
    if (storeCheck.error) {
      await client.query('ROLLBACK');
      return storeCheck.error;
    }

    const adjustmentMeta = {
      type: 'post_bill_cash_return',
      source: 'manual_after_bill',
      reason,
      createdBy: auth.user.id,
      createdByName: auth.user.name || auth.user.email || null,
      linkedCashReturnAmount: amount,
    };
    const nowSql = 'NOW()';

    await client.query(
      `INSERT INTO sales_bill_payments (sales_bill_id, method, amount, reference_no, meta, created_at)
       VALUES
         ($1, $2, $3, $4, $5::jsonb, ${nowSql}),
         ($1, 'cash', $6, $4, $7::jsonb, ${nowSql})`,
      [
        bill.id,
        tenderMethod,
        amount,
        referenceNo,
        JSON.stringify({ ...adjustmentMeta, direction: 'extra_tender' }),
        -amount,
        JSON.stringify({ ...adjustmentMeta, direction: 'cash_return' }),
      ]
    );

    const currentMeta = bill.meta && typeof bill.meta === 'object' && !Array.isArray(bill.meta) ? bill.meta : {};
    const cashReturns = Array.isArray(currentMeta.cashReturns) ? currentMeta.cashReturns : [];
    const nextCashReturn = {
      amount,
      reason,
      tenderMethod,
      referenceNo,
      createdAt: new Date().toISOString(),
      createdBy: auth.user.id,
    };
    await client.query(
      `UPDATE sales_bills
       SET meta = $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [
        JSON.stringify({
          ...currentMeta,
          cashReturns: [...cashReturns, nextCashReturn],
        }),
        bill.id,
      ]
    );

    await client.query('COMMIT');
    await auditLog(auth.user.id, 'pos_bill.cash_return', 'sales_bill', bill.id, {
      billNumber: bill.bill_number,
      storeId: bill.store_id,
      amount,
      tenderMethod,
      reason,
    });

    return successResponse({
      bill_id: bill.id,
      bill_number: bill.bill_number,
      amount,
      tenderMethod,
      reason,
    }, 'Cash return recorded');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[pos billing PATCH]', err);
    return errorResponse(err.message || 'Failed to record cash return', 500);
  } finally {
    if (client) client.release();
  }
}

export async function DELETE(req) {
  let client;
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    if (auth.user?.role !== 'super_admin') {
      return errorResponse('Only super admin can delete bills', 403);
    }

    const { searchParams } = new URL(req.url);
    let billId = searchParams.get('bill_id') || searchParams.get('id') || '';
    let reason = searchParams.get('reason') || '';
    if (!billId) {
      const body = await req.json().catch(() => ({}));
      billId = body.bill_id || body.billId || body.id || '';
      reason = body.reason || reason;
    }

    client = await getClient();
    await client.query('BEGIN');
    const deleted = await deleteSalesBillAndRestoreStock(client, {
      billId,
      user: auth.user,
      reason,
    });
    if (deleted.error) {
      await client.query('ROLLBACK');
      return errorResponse(deleted.error, deleted.status || 400);
    }

    await client.query('COMMIT');
    await auditLog(auth.user.id, 'pos_bill.delete', 'sales_bill', deleted.bill.id, {
      billNumber: deleted.bill.bill_number,
      storeId: deleted.bill.store_id,
      restoredQty: deleted.restoredQty,
      restoredBatches: deleted.restoredBatches,
      reason: reason || null,
    });

    return successResponse({
      billId: Number(deleted.bill.id),
      billNumber: deleted.bill.bill_number,
      restoredQty: deleted.restoredQty,
      restoredBatches: deleted.restoredBatches,
    }, 'Bill deleted and inventory restored');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[pos billing DELETE]', err);
    return errorResponse(err.message || 'Failed to delete bill', 500);
  } finally {
    if (client) client.release();
  }
}
