import { NextResponse } from 'next/server';
import { getPagination, limitOffsetSql, pagedPayload, spreadsheetResponse } from "@/lib/pagination";
import { successResponse } from '@/lib/api-response';
import { query } from '@/lib/db';
import { ensureStockInSchema } from '@/lib/stockInSchema';
import { ensureStockOutSchema } from '@/lib/stockOutSchema';
import { ensureVendorsSchema } from '@/lib/vendorsSchema';
import { validatePhoneNumber } from '@/lib/phoneValidator';
import { requireAuth, requirePermission } from '@/lib/api-protection';

function mapVendor(r) {
  return {
    id: r.id,
    name: r.name,
    company: r.company,
    business: r.business,
    address_1: r.address_1,
    address_2: r.address_2,
    city: r.city,
    state: r.state,
    pincode: r.pincode,
    country: r.country,
    email: r.email,
    mobile_number: r.mobile_number,
    gst_number: r.gst_number,
    margin: Number(r.margin || 0),
    credit_days: r.credit_days == null ? null : Number(r.credit_days),
    is_active: r.is_active !== false,
    brand_ids: Array.isArray(r.brand_ids)
      ? r.brand_ids.map((id) => String(id))
      : [],
    brands: Array.isArray(r.brands) ? r.brands.filter(Boolean) : [],
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

const LOOKUP_MAX_PAGE_SIZE = 5000;

function lookupLimit(raw, fallback = 200) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, LOOKUP_MAX_PAGE_SIZE);
}

function normalizeBrandIds(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0))];
}

async function saveVendorBrands(vendorId, brandIds) {
  await query('DELETE FROM vendor_brands WHERE vendor_id = $1', [vendorId]);
  if (!brandIds.length) return;
  await query(
    `INSERT INTO vendor_brands (vendor_id, brand_id)
     SELECT $1, id
     FROM brands
     WHERE id = ANY($2::int[])
     ON CONFLICT DO NOTHING`,
    [vendorId, brandIds],
  );
}

export async function GET(req) {
  try {
    // ensure any legacy tables used elsewhere and the vendors table
    await ensureStockInSchema();
    await ensureStockOutSchema();
    await ensureVendorsSchema();
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_VENDORS', 'MANAGE_VENDORS', 'MANAGE_PURCHASE_ORDERS', 'CREATE_STORE_PURCHASE_ORDER');
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(req.url);
    const search = String(searchParams.get('search') || '').trim();
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const pagination = getPagination(searchParams, {
      legacyLimit: lookupLimit(searchParams.get('pageSize')),
    });
    const params = [];
    const conditions = [];

    if (!includeInactive) conditions.push('COALESCE(v.is_active, TRUE) = TRUE');
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(
        v.name ILIKE $${params.length}
        OR COALESCE(v.company, '') ILIKE $${params.length}
        OR COALESCE(v.email, '') ILIKE $${params.length}
        OR COALESCE(v.mobile_number, '') ILIKE $${params.length}
        OR COALESCE(v.gst_number, '') ILIKE $${params.length}
        OR COALESCE(v.city, '') ILIKE $${params.length}
        OR COALESCE(v.state, '') ILIKE $${params.length}
      )`);
    }

    const res = await query(
          `SELECT v.id, v.name, v.company, v.business, v.address_1, v.address_2, v.city, v.state, v.pincode, v.country,
            v.email, v.mobile_number, v.gst_number, v.margin, v.credit_days, v.is_active, v.created_at, v.updated_at,
            COALESCE(ARRAY_AGG(b.id ORDER BY b.name) FILTER (WHERE b.id IS NOT NULL), '{}') AS brand_ids,
            COALESCE(ARRAY_AGG(b.name ORDER BY b.name) FILTER (WHERE b.id IS NOT NULL), '{}') AS brands,
            COUNT(*) OVER() AS __total
       FROM vendors v
       LEFT JOIN vendor_brands vb ON vb.vendor_id = v.id
       LEFT JOIN brands b ON b.id = vb.brand_id
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       GROUP BY v.id
       ORDER BY v.name
       ${limitOffsetSql(pagination, params)}`,
      params
    );

    const vendors = res.rows.map((row) => ({ ...mapVendor(row), __total: row.__total }));
    if (pagination.isExport) {
      return spreadsheetResponse(vendors, {
        filename: 'vendors',
        format: pagination.format,
        sheetName: 'Vendors',
        columns: [
          { key: 'name', label: 'Supplier / Contractor Name' },
          { key: 'company', label: 'Legal Company Name' },
          {
            key: 'business',
            label: 'Supplier Type',
            value: (v) => (String(v.business || '').trim().toLowerCase() === 'distributor' ? 'Distributor' : 'Company'),
          },
          { key: 'mobile_number', label: 'Mobile Number' },
          { key: 'email', label: 'Email Address' },
          { key: 'location', label: 'Vendor Location', value: (v) => [v.city, v.state, v.pincode].filter(Boolean).join(', ') },
          { key: 'gst_number', label: 'GST Number' },
          { key: 'margin', label: 'Rate Variance (%)' },
          { key: 'credit_days', label: 'Credit Terms (Days)', value: (v) => v.credit_days ?? '' },
          { key: 'brands', label: 'Brands / Makes Supplied', value: (v) => v.brands.join(', ') },
          {
            key: 'address',
            label: 'Address',
            value: (v) => [v.address_1, v.address_2, v.city, v.state, v.pincode, v.country].filter(Boolean).join(', '),
          },
          { key: 'address_1', label: 'Address 1' },
          { key: 'address_2', label: 'Address 2' },
          { key: 'city', label: 'City' },
          { key: 'state', label: 'State' },
          { key: 'pincode', label: 'Pincode' },
          { key: 'country', label: 'Country' },
          { key: 'is_active', label: 'Status', value: (v) => (v.is_active ? 'Active' : 'Inactive') },
        ],
      });
    }
    if (pagination.paged) {
      return successResponse(pagedPayload(vendors, pagination));
    }
    // return array of vendor objects; keeping `name` property for backward compatibility
    return NextResponse.json(vendors.map(({ __total, ...vendor }) => vendor));
  } catch (err) {
    console.error('Vendors GET error', err);
    return NextResponse.json([]);
  }
}

export async function POST(req) {
  try {
    await ensureVendorsSchema();
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_VENDORS');
    if (permissionCheck.error) return permissionCheck.error;
    const body = await req.json();
    const {
      name,
      company,
      business,
      address_1,
      address_2,
      city,
      state,
      pincode,
      country,
      email,
      mobile_number,
      gst_number,
      margin,
      credit_days,
      brand_ids,
    } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const normalizedMobile = String(mobile_number || '').replace(/\D/g, '');
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedMobile) {
      return NextResponse.json({ error: 'Mobile number is required' }, { status: 400 });
    }
    if (!/^\d{10}$/.test(normalizedMobile)) {
      return NextResponse.json({ error: 'Mobile number must be exactly 10 digits' }, { status: 400 });
    }
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    if (!String(gst_number || '').trim()) {
      return NextResponse.json({ error: 'GST number is required' }, { status: 400 });
    }
    const normalizedCreditDays = Number(credit_days);
    if (!Number.isInteger(normalizedCreditDays) || normalizedCreditDays < 1 || normalizedCreditDays > 3650) {
      return NextResponse.json({ error: 'Credit days must be a whole number between 1 and 3650' }, { status: 400 });
    }

    const selectedBrandIds = normalizeBrandIds(brand_ids);
    const res = await query(
      `INSERT INTO vendors (
         name, company, business, address_1, address_2, city, state, pincode, country,
         email, mobile_number, gst_number, margin, credit_days, is_active, created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, TRUE, NOW(), NOW())
       RETURNING id, name, company, business, address_1, address_2, city, state, pincode, country,
                 email, mobile_number, gst_number, margin, credit_days, is_active, created_at, updated_at`,
      [
        String(name).trim(),
        company || null,
        business || null,
        address_1 || null,
        address_2 || null,
        city || null,
        state || null,
        pincode || null,
        country || null,
        normalizedEmail || null,
        normalizedMobile,
        String(gst_number).trim(),
        Number(margin || 0),
        normalizedCreditDays,
      ]
    );
    await saveVendorBrands(res.rows[0].id, selectedBrandIds);

    return NextResponse.json(
      mapVendor({ ...res.rows[0], brand_ids: selectedBrandIds, brands: [] }),
      { status: 201 },
    );
  } catch (err) {
    console.error('Vendors POST error', err);
    if (err.code === '23505') {
      return NextResponse.json({ error: 'Vendor with same mobile or email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: err.message || 'Failed to create vendor' }, { status: 500 });
  }
}
