import { query } from '@/lib/db';
import { ensureInvoiceSalesOrdersSchema } from '@/lib/invoiceSalesOrdersSchema';

const CREATE_CUSTOMER_ORDER_SETTLEMENTS_SQL = `
  CREATE TABLE IF NOT EXISTS customer_order_settlements (
    id BIGSERIAL PRIMARY KEY,
    invoice_sales_order_id BIGINT NOT NULL REFERENCES invoice_sales_orders(id) ON DELETE CASCADE,
    settled_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    payment_type VARCHAR(50) NOT NULL DEFAULT 'Cash',
    reference_id VARCHAR(120),
    remarks TEXT,
    settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    settled_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_customer_order_settlements_order_id
    ON customer_order_settlements(invoice_sales_order_id);
  CREATE INDEX IF NOT EXISTS idx_customer_order_settlements_date
    ON customer_order_settlements(settlement_date);
`;

const globalForCustomerOrderSettlements = globalThis;

export async function ensureCustomerOrderSettlementsSchema() {
  if (!globalForCustomerOrderSettlements._customerOrderSettlementsSchemaReadyPromise) {
    globalForCustomerOrderSettlements._customerOrderSettlementsSchemaReadyPromise = (async () => {
      await ensureInvoiceSalesOrdersSchema();
      await query(CREATE_CUSTOMER_ORDER_SETTLEMENTS_SQL);
    })().catch((err) => {
      globalForCustomerOrderSettlements._customerOrderSettlementsSchemaReadyPromise = null;
      throw err;
    });
  }

  await globalForCustomerOrderSettlements._customerOrderSettlementsSchemaReadyPromise;
}

export default null;