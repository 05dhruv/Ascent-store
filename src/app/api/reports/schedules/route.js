import { successResponse, errorResponse, validationError } from '@/lib/api-response';
import { query } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/api-protection';

async function ensureReportSchedulesSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS report_schedules (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
      report_href VARCHAR(255) NOT NULL,
      report_label VARCHAR(255) NOT NULL,
      frequency VARCHAR(40) NOT NULL DEFAULT 'daily',
      format VARCHAR(20) NOT NULL DEFAULT 'xlsx',
      email VARCHAR(190),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_report_schedules_user
      ON report_schedules(user_id, is_active, created_at DESC);
  `);
}

export async function GET(request) {
  try {
    await ensureReportSchedulesSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const roleCheck = requireRole(auth.user, 'super_admin', 'admin', 'manager');
    if (roleCheck.error) return roleCheck.error;

    const res = await query(
      `SELECT id, report_href, report_label, frequency, format, email, created_at
       FROM report_schedules
       WHERE user_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 25`,
      [auth.user.id]
    );

    return successResponse({ records: res.rows.map((row) => ({
      id: String(row.id),
      reportHref: row.report_href,
      reportLabel: row.report_label,
      frequency: row.frequency,
      format: row.format,
      email: row.email || '',
      createdAt: row.created_at,
    })) }, 'Schedules fetched');
  } catch (err) {
    console.error('[report schedules GET]', err);
    return errorResponse('Failed to fetch report schedules');
  }
}

export async function POST(request) {
  try {
    await ensureReportSchedulesSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const roleCheck = requireRole(auth.user, 'super_admin', 'admin', 'manager');
    if (roleCheck.error) return roleCheck.error;

    const body = await request.json().catch(() => ({}));
    const reportHref = String(body.reportHref || '').trim();
    const reportLabel = String(body.reportLabel || '').trim();
    const frequency = String(body.frequency || 'daily').trim();
    const format = String(body.format || 'xlsx').trim();
    const email = String(body.email || '').trim();
    if (!reportHref || !reportLabel) return validationError([{ field: 'reportHref', message: 'Report is required' }]);

    const res = await query(
      `INSERT INTO report_schedules (user_id, report_href, report_label, frequency, format, email, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,true,NOW(),NOW())
       RETURNING id, report_href, report_label, frequency, format, email, created_at`,
      [auth.user.id, reportHref, reportLabel, frequency, format, email || null]
    );

    const row = res.rows[0];
    return successResponse({
      schedule: {
        id: String(row.id),
        reportHref: row.report_href,
        reportLabel: row.report_label,
        frequency: row.frequency,
        format: row.format,
        email: row.email || '',
        createdAt: row.created_at,
      },
    }, 'Schedule saved', 201);
  } catch (err) {
    console.error('[report schedules POST]', err);
    return errorResponse('Failed to save report schedule');
  }
}
