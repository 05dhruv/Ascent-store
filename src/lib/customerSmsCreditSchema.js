import { query } from '@/lib/db';

const CREATE_CUSTOMER_SMS_CREDITS_SQL = `
  CREATE TABLE IF NOT EXISTS customer_sms_credit_purchases (
    id BIGSERIAL PRIMARY KEY,
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    credits_purchased NUMERIC(14, 2) NOT NULL DEFAULT 0,
    rate_per_credit NUMERIC(14, 2) NOT NULL DEFAULT 0,
    amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
    remarks TEXT,
    created_by VARCHAR(255),
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_customer_sms_credit_purchases_purchased_at ON customer_sms_credit_purchases(purchased_at);
`;

const globalForCustomerSmsCredit = globalThis;

export async function ensureCustomerSmsCreditSchema() {
  if (!globalForCustomerSmsCredit._customerSmsCreditSchemaReadyPromise) {
    globalForCustomerSmsCredit._customerSmsCreditSchemaReadyPromise = (async () => {
      await query(CREATE_CUSTOMER_SMS_CREDITS_SQL);
    })().catch((err) => {
      globalForCustomerSmsCredit._customerSmsCreditSchemaReadyPromise = null;
      throw err;
    });
  }

  await globalForCustomerSmsCredit._customerSmsCreditSchemaReadyPromise;
}

export default null;