import { query } from '@/lib/db';
import { makeSchemaEnsurer } from '@/lib/schemaGuard';

export const ensureCustomersSchema = makeSchemaEnsurer('customers', () => query(`
    CREATE TABLE IF NOT EXISTS customers (
      id BIGSERIAL PRIMARY KEY,
      first_name VARCHAR(120) NOT NULL,
      last_name VARCHAR(120),
      customer_type VARCHAR(50) NOT NULL DEFAULT 'INDIVIDUAL',
      customer_group_id BIGINT,
      customer_code VARCHAR(80) UNIQUE,
      email_address VARCHAR(255),
      birthday DATE,
      mobile_number VARCHAR(50) NOT NULL,
      address_type VARCHAR(50) NOT NULL DEFAULT 'Billing',
      city VARCHAR(120),
      state VARCHAR(120),
      country VARCHAR(120) NOT NULL DEFAULT 'India',
      pincode VARCHAR(20),
      address_1 TEXT,
      address_2 TEXT,
      landmark TEXT,
      anniversary DATE,
      gender VARCHAR(20) NOT NULL DEFAULT 'MALE',
      gst_number VARCHAR(100),
      pan_number VARCHAR(100),
      aadhar_number VARCHAR(100),
      contact_person_name VARCHAR(120),
      contact_person_phone VARCHAR(50),
      registration_points NUMERIC(14, 2) NOT NULL DEFAULT 0,
      credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 0,
      enable_crm BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT,
      total_sales NUMERIC(14, 2) NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'Active',
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_customers_first_name ON customers(first_name);
    CREATE INDEX IF NOT EXISTS idx_customers_mobile_number ON customers(mobile_number);
    CREATE INDEX IF NOT EXISTS idx_customers_email_address ON customers(email_address);
    CREATE INDEX IF NOT EXISTS idx_customers_customer_type ON customers(customer_type);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_group_id BIGINT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_id BIGINT;
    CREATE INDEX IF NOT EXISTS idx_customers_customer_group_id ON customers(customer_group_id);
    CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers(store_id);
`));

export default null;
