import { query } from '@/lib/db';

const CREATE_CUSTOMER_LOYALTY_SETTINGS_SQL = `
  CREATE TABLE IF NOT EXISTS customer_loyalty_settings (
    id BIGSERIAL PRIMARY KEY,
    settings_key VARCHAR(50) NOT NULL UNIQUE DEFAULT 'default',
    loyalty_name VARCHAR(190) NOT NULL DEFAULT 'Loyalty',
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    reward_type VARCHAR(30) NOT NULL DEFAULT 'Bill Amount',
    purchase_points_rate NUMERIC(14, 2) NOT NULL DEFAULT 1,
    minimum_purchase_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    max_points_per_bill NUMERIC(14, 2) NOT NULL DEFAULT 0,
    redemption_type VARCHAR(30) NOT NULL DEFAULT 'Percentage',
    redeem_rate NUMERIC(14, 2) NOT NULL DEFAULT 1,
    minimum_redeem_points NUMERIC(14, 2) NOT NULL DEFAULT 0,
    maximum_redeem_points NUMERIC(14, 2) NOT NULL DEFAULT 0,
    maximum_redeem_percentage NUMERIC(14, 2) NOT NULL DEFAULT 100,
    show_points_on_invoice BOOLEAN NOT NULL DEFAULT TRUE,
    show_points_on_pos BOOLEAN NOT NULL DEFAULT TRUE,
    enable_sms_on_earn BOOLEAN NOT NULL DEFAULT FALSE,
    enable_sms_on_redeem BOOLEAN NOT NULL DEFAULT FALSE,
    registration_points NUMERIC(14, 2) NOT NULL DEFAULT 0,
    birthday_points NUMERIC(14, 2) NOT NULL DEFAULT 0,
    anniversary_points NUMERIC(14, 2) NOT NULL DEFAULT 0,
    points_value NUMERIC(14, 2) NOT NULL DEFAULT 1,
    expiry_days INTEGER NOT NULL DEFAULT 365,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_customer_loyalty_settings_key ON customer_loyalty_settings(settings_key);
`;

const globalForCustomerLoyaltySettings = globalThis;

export async function ensureCustomerLoyaltySettingsSchema() {
  if (!globalForCustomerLoyaltySettings._customerLoyaltySettingsSchemaReadyPromise) {
    globalForCustomerLoyaltySettings._customerLoyaltySettingsSchemaReadyPromise = (async () => {
      await query(CREATE_CUSTOMER_LOYALTY_SETTINGS_SQL);
    })().catch((err) => {
      globalForCustomerLoyaltySettings._customerLoyaltySettingsSchemaReadyPromise = null;
      throw err;
    });
  }

  await globalForCustomerLoyaltySettings._customerLoyaltySettingsSchemaReadyPromise;
}

export default null;