import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureCustomersSchema } from '@/lib/customersSchema';
import { validatePhoneNumber } from '@/lib/phoneValidator';
import { ensureSalesBillingSchema } from '@/lib/salesBillingSchema';
import { ensureCustomerGroupsSchema } from '@/lib/customerGroupsSchema';
import { getAssignedStoreIds, requireAuth, requirePermission, requireStore } from '@/lib/api-protection';

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function normalizeNumber(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function mapCustomerRow(row) {
  return {
    id: row.id,
    name: row.name || [row.first_name, row.last_name].filter(Boolean).join(' ').trim(),
    first_name: row.first_name,
    last_name: row.last_name,
    customer_type: row.customer_type,
    customer_group_id: row.customer_group_id || null,
    customer_group_name: row.customer_group_name || '',
    customer_code: row.customer_code || '',
    email_address: row.email_address || '',
    birthday: row.birthday,
    mobile_number: row.mobile_number,
    address_type: row.address_type,
    city: row.city || '',
    state: row.state || '',
    country: row.country || '',
    pincode: row.pincode || '',
    address_1: row.address_1 || '',
    address_2: row.address_2 || '',
    landmark: row.landmark || '',
    anniversary: row.anniversary,
    gender: row.gender,
    gst_number: row.gst_number || '',
    pan_number: row.pan_number || '',
    aadhar_number: row.aadhar_number || '',
    contact_person_name: row.contact_person_name || '',
    contact_person_phone: row.contact_person_phone || '',
    registration_points: row.registration_points,
    credit_limit: row.credit_limit,
    enable_crm: row.enable_crm,
    notes: row.notes || '',
    total_sales: row.total_sales,
    order_count: row.order_count || 0,
    source: row.source || 'registered',
    store_names: row.store_names || '',
    status: row.status,
    created_at: row.created_at,
  };
}

function addVisibleStoreScope(user, params, requestedStoreId) {
  const storeId = Number(requestedStoreId || 0) || null;

  if (storeId) {
    const storeCheck = requireStore(user, storeId);
    if (storeCheck.error) return { error: storeCheck.error, sql: '' };
    params.push(storeId);
    return { error: null, sql: ` AND sb.store_id = $${params.length}` };
  }

  if (user.role === 'super_admin') return { error: null, sql: '' };

  const assignedStores = (user.assigned_stores || []).map(Number).filter(Number.isFinite);
  if (!assignedStores.length) return { error: null, sql: ' AND 1 = 0' };

  params.push(assignedStores);
  return { error: null, sql: ` AND sb.store_id = ANY($${params.length}::int[])` };
}

export async function GET(request) {
  try {
    await ensureCustomersSchema();
    await ensureCustomerGroupsSchema();
    await ensureSalesBillingSchema();
    await ensureCustomerGroupsSchema();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    const statusFilter = normalizeText(searchParams.get('status'));
    const search = normalizeText(searchParams.get('search'));
    const searchBy = normalizeText(searchParams.get('searchBy'));
    const store = normalizeText(searchParams.get('store'));
    const params = [];
    const where = [];
    const storeScope = addVisibleStoreScope(auth.user, params, store);
    if (storeScope.error) return storeScope.error;
    let registeredStoreScopeSql = '';
    const requestedStoreId = Number(store || 0) || null;
    if (requestedStoreId) {
      params.push(requestedStoreId);
      registeredStoreScopeSql = `WHERE c.store_id = $${params.length}`;
    } else if (auth.user.role !== 'super_admin') {
      const assignedStores = getAssignedStoreIds(auth.user);
      if (!assignedStores.length) {
        registeredStoreScopeSql = 'WHERE 1 = 0';
      } else {
        params.push(assignedStores);
        registeredStoreScopeSql = `WHERE c.store_id = ANY($${params.length}::int[])`;
      }
    }

    if (statusFilter) {
      params.push(statusFilter);
      where.push(`status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;

      if (searchBy === 'Name') {
        where.push(`name ILIKE $${idx}`);
      } else if (searchBy === 'Phone') {
        where.push(`COALESCE(mobile_number, '') ILIKE $${idx}`);
      } else if (searchBy === 'Email') {
        where.push(`COALESCE(email_address, '') ILIKE $${idx}`);
      } else if (searchBy === 'GST Number') {
        where.push(`COALESCE(gst_number, '') ILIKE $${idx}`);
      } else if (searchBy === 'PAN Number') {
        where.push(`COALESCE(pan_number, '') ILIKE $${idx}`);
      } else if (searchBy === 'ID') {
        where.push(`CAST(id AS TEXT) ILIKE $${idx}`);
      } else {
        where.push(`(
          COALESCE(name, '') ILIKE $${idx}
          OR COALESCE(customer_code, '') ILIKE $${idx}
          OR COALESCE(mobile_number, '') ILIKE $${idx}
          OR COALESCE(email_address, '') ILIKE $${idx}
        )`);
      }
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const res = await query(
      `WITH scoped_bills AS (
         SELECT sb.*, s.name AS store_name
         FROM sales_bills sb
         LEFT JOIN stores s ON s.id = sb.store_id
         WHERE sb.status IN ('paid', 'completed')${storeScope.sql}
           AND (
             NULLIF(TRIM(sb.customer_mobile), '') IS NOT NULL
             OR NULLIF(TRIM(sb.customer_name), '') IS NOT NULL
           )
       ),
       registered AS (
         SELECT
           CASE
             WHEN NULLIF(TRIM(c.mobile_number), '') IS NOT NULL THEN 'm:' || LOWER(TRIM(c.mobile_number))
             WHEN NULLIF(TRIM(c.customer_code), '') IS NOT NULL THEN 'c:' || LOWER(TRIM(c.customer_code))
             WHEN NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '') IS NOT NULL THEN 'n:' || LOWER(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')))
             ELSE 'id:' || c.id::text
           END AS customer_key,
           c.*
         FROM customers c
         ${registeredStoreScopeSql}
       ),
       billed AS (
         SELECT
           CASE
             WHEN NULLIF(TRIM(sb.customer_mobile), '') IS NOT NULL THEN 'm:' || LOWER(TRIM(sb.customer_mobile))
             WHEN NULLIF(TRIM(sb.customer_name), '') IS NOT NULL THEN 'n:' || LOWER(TRIM(sb.customer_name))
             ELSE 'bill:' || sb.id::text
           END AS customer_key,
           MAX(NULLIF(TRIM(sb.customer_name), '')) AS bill_name,
           MAX(NULLIF(TRIM(sb.customer_mobile), '')) AS bill_mobile,
           COUNT(sb.id)::int AS order_count,
           COALESCE(SUM(sb.grand_total), 0) AS billed_sales,
           STRING_AGG(DISTINCT COALESCE(sb.store_name, 'Store'), ', ' ORDER BY COALESCE(sb.store_name, 'Store')) AS store_names,
           MAX(sb.created_at) AS last_bill_at
         FROM scoped_bills sb
         GROUP BY 1
       ),
       merged AS (
         SELECT
           COALESCE(r.id::text, b.customer_key) AS id,
           COALESCE(NULLIF(TRIM(COALESCE(r.first_name, '') || ' ' || COALESCE(r.last_name, '')), ''), b.bill_name, 'Walk-in Customer') AS name,
           r.first_name,
           r.last_name,
           r.customer_group_id,
           cg.group_name AS customer_group_name,
           COALESCE(r.customer_type, CASE WHEN r.id IS NULL THEN 'BILLED' ELSE 'INDIVIDUAL' END) AS customer_type,
           COALESCE(r.customer_code, '') AS customer_code,
           COALESCE(r.email_address, '') AS email_address,
           r.birthday,
           COALESCE(r.mobile_number, b.bill_mobile, '') AS mobile_number,
           r.address_type,
           r.city,
           r.state,
           r.country,
           r.pincode,
           r.address_1,
           r.address_2,
           r.landmark,
           r.anniversary,
           r.gender,
           r.gst_number,
           r.pan_number,
           r.aadhar_number,
           r.contact_person_name,
           r.contact_person_phone,
           r.registration_points,
           r.credit_limit,
           r.enable_crm,
           r.notes,
           COALESCE(b.billed_sales, r.total_sales, 0) AS total_sales,
           COALESCE(b.order_count, 0) AS order_count,
           COALESCE(b.store_names, '') AS store_names,
           COALESCE(r.status, 'Billed') AS status,
           COALESCE(r.created_at, b.last_bill_at) AS created_at,
           CASE WHEN r.id IS NULL THEN 'billed' ELSE 'registered' END AS source
         FROM registered r
         FULL OUTER JOIN billed b ON b.customer_key = r.customer_key
         LEFT JOIN customer_groups cg ON cg.id = r.customer_group_id
       )
       SELECT *
       FROM merged
       ${whereClause}
       ORDER BY created_at DESC NULLS LAST, name ASC`
      ,
      params
    );

    return NextResponse.json(res.rows.map(mapCustomerRow));
  } catch (err) {
    console.error('[customers GET]', err.message);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await ensureCustomersSchema();

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json();
    const requestedStoreId = Number(body.store_id ?? body.storeId ?? 0) || null;
    const assignedStores = getAssignedStoreIds(auth.user);
    const customerStoreId =
      requestedStoreId ||
      (auth.user.role === 'super_admin' ? null : assignedStores[0] || null);

    if (customerStoreId) {
      const storeCheck = requireStore(auth.user, customerStoreId);
      if (storeCheck.error) return storeCheck.error;
    } else if (auth.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'No store assigned to create customer' }, { status: 403 });
    }

    const firstName = normalizeText(body.first_name ?? body.firstName);
    const mobileNumber = normalizeText(body.mobile_number ?? body.mobileNumber).replace(/\D/g, '');
    const emailAddress = normalizeText(body.email_address ?? body.emailAddress).toLowerCase();

    if (!firstName) {
      return NextResponse.json({ error: 'First name is required' }, { status: 400 });
    }

    if (!mobileNumber) {
      return NextResponse.json({ error: 'Mobile number is required' }, { status: 400 });
    }
    if (!/^\d{10}$/.test(mobileNumber)) {
      return NextResponse.json({ error: 'Mobile number must be exactly 10 digits' }, { status: 400 });
    }
    if (emailAddress && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    const phoneValidation = validatePhoneNumber(mobileNumber);
    if (!phoneValidation.isValid) {
      return NextResponse.json({ error: phoneValidation.error }, { status: 400 });
    }

    const payload = {
      first_name: firstName,
      last_name: normalizeText(body.last_name ?? body.lastName),
      customer_type: normalizeText(body.customer_type ?? body.customerType) || 'INDIVIDUAL',
      customer_group_id: body.customer_group_id ?? body.customerGroupId ?? null,
      customer_code: normalizeText(body.customer_code ?? body.customerCode),
      email_address: emailAddress,
      birthday: normalizeDate(body.birthday),
      mobile_number: mobileNumber,
      address_type: normalizeText(body.address_type ?? body.addressType) || 'Billing',
      city: normalizeText(body.city),
      state: normalizeText(body.state),
      country: normalizeText(body.country) || 'India',
      pincode: normalizeText(body.pincode),
      address_1: normalizeText(body.address_1 ?? body.address1),
      address_2: normalizeText(body.address_2 ?? body.address2),
      landmark: normalizeText(body.landmark),
      anniversary: normalizeDate(body.anniversary),
      gender: normalizeText(body.gender) || 'MALE',
      gst_number: normalizeText(body.gst_number ?? body.gstNumber),
      pan_number: normalizeText(body.pan_number ?? body.panNumber),
      aadhar_number: normalizeText(body.aadhar_number ?? body.aadharNumber),
      contact_person_name: normalizeText(body.contact_person_name ?? body.contactPersonName),
      contact_person_phone: normalizeText(body.contact_person_phone ?? body.contactPersonPhone),
      registration_points: normalizeNumber(body.registration_points ?? body.registrationPoints),
      credit_limit: normalizeNumber(body.credit_limit ?? body.creditLimit),
      enable_crm: Boolean(body.enable_crm ?? body.enableCrm),
      notes: normalizeText(body.notes),
    };

    if (payload.contact_person_phone) {
      const contactPhoneValidation = validatePhoneNumber(payload.contact_person_phone);
      if (!contactPhoneValidation.isValid) {
        return NextResponse.json({ error: `Contact person phone: ${contactPhoneValidation.error}` }, { status: 400 });
      }
    }

    const customerCode = payload.customer_code || `CUST-${Date.now()}`;
    let customerGroupId = Number(payload.customer_group_id || 0) || null;
    if (!customerGroupId) {
      const defaultGroup = await query(
        `SELECT id FROM customer_groups WHERE is_default = TRUE AND status = 'Active' ORDER BY id DESC LIMIT 1`
      );
      customerGroupId = defaultGroup.rows[0]?.id || null;
    }

    const res = await query(
      `INSERT INTO customers (
         first_name, last_name, customer_type, customer_group_id, customer_code, email_address, birthday, mobile_number,
         address_type, city, state, country, pincode, address_1, address_2, landmark, anniversary,
         gender, gst_number, pan_number, aadhar_number, contact_person_name, contact_person_phone,
         registration_points, credit_limit, enable_crm, notes, total_sales, status, store_id
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,
         $9,$10,$11,$12,$13,$14,$15,$16,$17,
         $18,$19,$20,$21,$22,$23,
         $24,$25,$26,$27,0,'Active',$28
       )
       RETURNING id, first_name, last_name, customer_type, customer_group_id, customer_code, email_address, birthday, mobile_number,
                 address_type, city, state, country, pincode, address_1, address_2, landmark, anniversary,
                 gender, gst_number, pan_number, aadhar_number, contact_person_name, contact_person_phone,
                 registration_points, credit_limit, enable_crm, notes, total_sales, status, created_at`,
      [
        payload.first_name,
        payload.last_name,
        payload.customer_type,
        customerGroupId,
        customerCode,
        payload.email_address,
        payload.birthday,
        payload.mobile_number,
        payload.address_type,
        payload.city,
        payload.state,
        payload.country,
        payload.pincode,
        payload.address_1,
        payload.address_2,
        payload.landmark,
        payload.anniversary,
        payload.gender,
        payload.gst_number,
        payload.pan_number,
        payload.aadhar_number,
        payload.contact_person_name,
        payload.contact_person_phone,
        payload.registration_points,
        payload.credit_limit,
        payload.enable_crm,
        payload.notes,
        customerStoreId,
      ]
    );

    return NextResponse.json(mapCustomerRow(res.rows[0]), { status: 201 });
  } catch (err) {
    console.error('[customers POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to create customer' }, { status: 500 });
  }
}
