import { ensureInventoryBatchSchema, restoreBatchStock } from '@/lib/inventoryBatching';
import { ensureInvoiceSalesOrdersSchema } from '@/lib/invoiceSalesOrdersSchema';
import { ensureSalesBillingSchema } from '@/lib/salesBillingSchema';
import { ensureSalesReturnsSchema } from '@/lib/salesReturnsSchema';
import { setRecycleBinContext } from '@/lib/recycleBin';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function resolveBillLookup(value) {
  const lookup = String(value || '').trim();
  const numericId = /^\d+$/.test(lookup) ? Number(lookup) : -1;
  const invoiceLookup = lookup.toUpperCase().startsWith('INV-') ? lookup : `INV-${lookup}`;
  const withoutInvoicePrefix = lookup.replace(/^INV-/i, '');
  return { lookup, numericId, invoiceLookup, withoutInvoicePrefix };
}

async function getRestoreAllocations(client, billId) {
  const itemsRes = await client.query(
    `SELECT
       sbi.id AS bill_item_id,
       sbi.product_id,
       sbi.product_name,
       sbi.qty,
       sbi.selling_price,
       sbi.mrp,
       sbi.batch_allocations
     FROM sales_bill_items sbi
     WHERE sbi.sales_bill_id = $1
     ORDER BY sbi.id`,
    [billId],
  );

  const allocations = [];
  for (const item of itemsRes.rows) {
    for (const allocation of parseJsonArray(item.batch_allocations)) {
      const batchId = Number(allocation.batchId || allocation.batch_id);
      const qty = toNumber(allocation.qty);
      if (!batchId || qty <= 0) continue;
      allocations.push({
        batchId,
        productId: Number(item.product_id),
        productName: item.product_name || 'Product',
        billItemId: Number(item.bill_item_id),
        qty,
        costPrice: toNumber(allocation.costPrice),
        mrp: toNumber(allocation.mrp, toNumber(item.mrp)),
        sellingPrice: toNumber(allocation.sellingPrice, toNumber(item.selling_price)),
      });
    }
  }

  if (allocations.length) return allocations;

  const stockOutItemsRes = await client.query(
    `SELECT
       soi.batch_id,
       soi.product_id,
       soi.product_name,
       soi.qty,
       soi.cost_price
     FROM stock_out_items soi
     INNER JOIN stock_out so ON so.id = soi.stock_out_id
     WHERE so.reference_type = 'sales_bill'
       AND so.reference_id = $1
       AND soi.batch_id IS NOT NULL
     ORDER BY soi.id`,
    [String(billId)],
  );

  return stockOutItemsRes.rows
    .map((item) => ({
      batchId: Number(item.batch_id),
      productId: Number(item.product_id),
      productName: item.product_name || 'Product',
      billItemId: null,
      qty: toNumber(item.qty),
      costPrice: toNumber(item.cost_price),
      mrp: 0,
      sellingPrice: 0,
    }))
    .filter((item) => item.batchId && item.productId && item.qty > 0);
}

export async function deleteSalesBillAndRestoreStock(client, { billId, user, reason = '' }) {
  await ensureSalesBillingSchema();
  await ensureSalesReturnsSchema();
  await ensureInvoiceSalesOrdersSchema();
  await ensureInventoryBatchSchema();

  const { lookup, numericId, invoiceLookup, withoutInvoicePrefix } = resolveBillLookup(billId);
  if (!lookup) return { error: 'bill_id is required', status: 400 };

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
    [lookup, invoiceLookup, withoutInvoicePrefix, numericId],
  );
  const bill = billRes.rows[0];
  if (!bill) return { error: 'Bill not found', status: 404 };

  const activeReturns = await client.query(
    `SELECT id, status
     FROM sales_returns
     WHERE original_bill_id = $1
       AND COALESCE(status, '') <> 'declined'
     LIMIT 1`,
    [bill.id],
  );
  if (activeReturns.rows.length) {
    return {
      error: 'This bill has an active return/exchange record. Decline or settle the return before deleting the bill.',
      status: 409,
    };
  }

  await setRecycleBinContext(
    client,
    user?.id,
    reason || `Sales bill ${bill.bill_number || bill.id} deleted`,
  );

  const allocations = await getRestoreAllocations(client, bill.id);
  if (!allocations.length) {
    return {
      error: 'Unable to delete bill because no batch allocation records were found to restore inventory.',
      status: 409,
    };
  }

  let restoredQty = 0;
  for (const allocation of allocations) {
    const restored = await restoreBatchStock(client, {
      batchId: allocation.batchId,
      productId: allocation.productId,
      storeId: bill.store_id,
      qty: allocation.qty,
      referenceType: 'sales_bill_delete',
      referenceId: bill.id,
      sourceItemId: allocation.billItemId,
      meta: {
        source: 'sales_bill_delete',
        billId: Number(bill.id),
        billNumber: bill.bill_number,
        deletedBy: user?.id || null,
        productName: allocation.productName,
        costPrice: allocation.costPrice,
        mrp: allocation.mrp,
        sellingPrice: allocation.sellingPrice,
      },
    });
    if (restored) restoredQty += allocation.qty;
  }

  await client.query(
    `DELETE FROM invoice_sales_orders
     WHERE sales_bill_id = $1
        OR invoice_id = $2
        OR sales_order_id = $2`,
    [bill.id, bill.bill_number],
  );
  await client.query(
    `DELETE FROM stock_out
     WHERE reference_type = 'sales_bill'
       AND reference_id = $1`,
    [String(bill.id)],
  );
  await client.query(`DELETE FROM sales_bills WHERE id = $1`, [bill.id]);

  return {
    bill,
    restoredQty,
    restoredBatches: allocations.length,
  };
}
