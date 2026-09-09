import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureCustomerLoyaltySettingsSchema } from '@/lib/customerLoyaltySettingsSchema';
import { requireAuth, requirePermission } from '@/lib/api-protection';

function parseBoolean(value, fallback = false) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function parseNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function mapSettingsRow(row) {
  return {
    id: row.id,
    loyaltyName: row.loyalty_name || 'Loyalty',
    status: row.status || 'Active',
    rewardType: row.reward_type || 'Bill Amount',
    purchasePointsRate: Number(row.purchase_points_rate || 1),
    minimumPurchaseAmount: Number(row.minimum_purchase_amount || 0),
    maxPointsPerBill: Number(row.max_points_per_bill || 0),
    redemptionType: row.redemption_type || 'Percentage',
    redeemRate: Number(row.redeem_rate || 1),
    minimumRedeemPoints: Number(row.minimum_redeem_points || 0),
    maximumRedeemPoints: Number(row.maximum_redeem_points || 0),
    maximumRedeemPercentage: Number(row.maximum_redeem_percentage || 100),
    showPointsOnInvoice: Boolean(row.show_points_on_invoice),
    showPointsOnPos: Boolean(row.show_points_on_pos),
    enableSmsOnEarn: Boolean(row.enable_sms_on_earn),
    enableSmsOnRedeem: Boolean(row.enable_sms_on_redeem),
    registrationPoints: Number(row.registration_points || 0),
    birthdayPoints: Number(row.birthday_points || 0),
    anniversaryPoints: Number(row.anniversary_points || 0),
    pointsValue: Number(row.points_value || 1),
    expiryDays: Number(row.expiry_days || 365),
  };
}

const DEFAULT_SETTINGS = {
  loyaltyName: 'Loyalty',
  status: 'Active',
  rewardType: 'Bill Amount',
  purchasePointsRate: 1,
  minimumPurchaseAmount: 0,
  maxPointsPerBill: 0,
  redemptionType: 'Percentage',
  redeemRate: 1,
  minimumRedeemPoints: 0,
  maximumRedeemPoints: 0,
  maximumRedeemPercentage: 100,
  showPointsOnInvoice: true,
  showPointsOnPos: true,
  enableSmsOnEarn: false,
  enableSmsOnRedeem: false,
  registrationPoints: 0,
  birthdayPoints: 0,
  anniversaryPoints: 0,
  pointsValue: 1,
  expiryDays: 365,
};

export async function GET(request) {
  try {
    await ensureCustomerLoyaltySettingsSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;
    const res = await query(
      `SELECT * FROM customer_loyalty_settings WHERE settings_key = 'default' ORDER BY id DESC LIMIT 1`
    );

    if (!res.rows?.length) {
      return NextResponse.json({ ...DEFAULT_SETTINGS, id: null });
    }

    return NextResponse.json(mapSettingsRow(res.rows[0]));
  } catch (err) {
    console.error('[customer-loyalty-settings GET]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to load loyalty settings' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await ensureCustomerLoyaltySettingsSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_CUSTOMERS');
    if (permissionCheck.error) return permissionCheck.error;

    const body = await request.json().catch(() => ({}));
    const payload = {
      loyaltyName: normalizeText(body.loyaltyName, DEFAULT_SETTINGS.loyaltyName),
      status: normalizeText(body.status, DEFAULT_SETTINGS.status),
      rewardType: normalizeText(body.rewardType, DEFAULT_SETTINGS.rewardType),
      purchasePointsRate: parseNumber(body.purchasePointsRate, DEFAULT_SETTINGS.purchasePointsRate),
      minimumPurchaseAmount: parseNumber(body.minimumPurchaseAmount, DEFAULT_SETTINGS.minimumPurchaseAmount),
      maxPointsPerBill: parseNumber(body.maxPointsPerBill, DEFAULT_SETTINGS.maxPointsPerBill),
      redemptionType: normalizeText(body.redemptionType, DEFAULT_SETTINGS.redemptionType),
      redeemRate: parseNumber(body.redeemRate, DEFAULT_SETTINGS.redeemRate),
      minimumRedeemPoints: parseNumber(body.minimumRedeemPoints, DEFAULT_SETTINGS.minimumRedeemPoints),
      maximumRedeemPoints: parseNumber(body.maximumRedeemPoints, DEFAULT_SETTINGS.maximumRedeemPoints),
      maximumRedeemPercentage: parseNumber(body.maximumRedeemPercentage, DEFAULT_SETTINGS.maximumRedeemPercentage),
      showPointsOnInvoice: parseBoolean(body.showPointsOnInvoice, DEFAULT_SETTINGS.showPointsOnInvoice),
      showPointsOnPos: parseBoolean(body.showPointsOnPos, DEFAULT_SETTINGS.showPointsOnPos),
      enableSmsOnEarn: parseBoolean(body.enableSmsOnEarn, DEFAULT_SETTINGS.enableSmsOnEarn),
      enableSmsOnRedeem: parseBoolean(body.enableSmsOnRedeem, DEFAULT_SETTINGS.enableSmsOnRedeem),
      registrationPoints: parseNumber(body.registrationPoints, DEFAULT_SETTINGS.registrationPoints),
      birthdayPoints: parseNumber(body.birthdayPoints, DEFAULT_SETTINGS.birthdayPoints),
      anniversaryPoints: parseNumber(body.anniversaryPoints, DEFAULT_SETTINGS.anniversaryPoints),
      pointsValue: parseNumber(body.pointsValue, DEFAULT_SETTINGS.pointsValue),
      expiryDays: Math.max(0, Math.trunc(parseNumber(body.expiryDays, DEFAULT_SETTINGS.expiryDays))),
    };

    const result = await query(
      `
        INSERT INTO customer_loyalty_settings (
          settings_key,
          loyalty_name,
          status,
          reward_type,
          purchase_points_rate,
          minimum_purchase_amount,
          max_points_per_bill,
          redemption_type,
          redeem_rate,
          minimum_redeem_points,
          maximum_redeem_points,
          maximum_redeem_percentage,
          show_points_on_invoice,
          show_points_on_pos,
          enable_sms_on_earn,
          enable_sms_on_redeem,
          registration_points,
          birthday_points,
          anniversary_points,
          points_value,
          expiry_days
        ) VALUES (
          'default',
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
        )
        ON CONFLICT (settings_key)
        DO UPDATE SET
          loyalty_name = EXCLUDED.loyalty_name,
          status = EXCLUDED.status,
          reward_type = EXCLUDED.reward_type,
          purchase_points_rate = EXCLUDED.purchase_points_rate,
          minimum_purchase_amount = EXCLUDED.minimum_purchase_amount,
          max_points_per_bill = EXCLUDED.max_points_per_bill,
          redemption_type = EXCLUDED.redemption_type,
          redeem_rate = EXCLUDED.redeem_rate,
          minimum_redeem_points = EXCLUDED.minimum_redeem_points,
          maximum_redeem_points = EXCLUDED.maximum_redeem_points,
          maximum_redeem_percentage = EXCLUDED.maximum_redeem_percentage,
          show_points_on_invoice = EXCLUDED.show_points_on_invoice,
          show_points_on_pos = EXCLUDED.show_points_on_pos,
          enable_sms_on_earn = EXCLUDED.enable_sms_on_earn,
          enable_sms_on_redeem = EXCLUDED.enable_sms_on_redeem,
          registration_points = EXCLUDED.registration_points,
          birthday_points = EXCLUDED.birthday_points,
          anniversary_points = EXCLUDED.anniversary_points,
          points_value = EXCLUDED.points_value,
          expiry_days = EXCLUDED.expiry_days,
          updated_at = NOW()
        RETURNING *
      `,
      [
        payload.loyaltyName,
        payload.status,
        payload.rewardType,
        payload.purchasePointsRate,
        payload.minimumPurchaseAmount,
        payload.maxPointsPerBill,
        payload.redemptionType,
        payload.redeemRate,
        payload.minimumRedeemPoints,
        payload.maximumRedeemPoints,
        payload.maximumRedeemPercentage,
        payload.showPointsOnInvoice,
        payload.showPointsOnPos,
        payload.enableSmsOnEarn,
        payload.enableSmsOnRedeem,
        payload.registrationPoints,
        payload.birthdayPoints,
        payload.anniversaryPoints,
        payload.pointsValue,
        payload.expiryDays,
      ]
    );

    return NextResponse.json({ ok: true, settings: mapSettingsRow(result.rows[0]) });
  } catch (err) {
    console.error('[customer-loyalty-settings POST]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to save loyalty settings' }, { status: 500 });
  }
}

export default null;
