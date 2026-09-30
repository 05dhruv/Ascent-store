import { requireAuth, requirePermission } from '@/lib/api-protection';
import { errorResponse, notFoundError, successResponse } from '@/lib/api-response';
import { getPagination, spreadsheetResponse } from '@/lib/pagination';
import {
  getReportDefinition,
  getReportPage,
  getReportRows,
  normalizeReportKey,
} from '@/lib/reportsService';

const CONTROL_PARAMS = ['export', 'columns', 'page', 'pageSize', 'format', 'search', 'summary'];

function filtersFromSearchParams(searchParams) {
  const filters = Object.fromEntries(searchParams.entries());
  CONTROL_PARAMS.forEach((key) => delete filters[key]);
  return filters;
}

function columnsFromSearchParams(searchParams) {
  const raw = searchParams.get('columns');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((column) => column?.key && column?.label)
      .map((column) => ({ key: String(column.key), label: String(column.label) }));
  } catch {
    return null;
  }
}

function summaryKeysFromSearchParams(searchParams) {
  return String(searchParams.get('summary') || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
}

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const params = await context.params;
    const reportKey = normalizeReportKey(params.slug);
    const permission = reportKey === 'accounting/store-wise-tax-breakup'
      ? 'VIEW_TAX_WISE_REPORTS'
      : reportKey.startsWith('accounting/')
        ? 'VIEW_STORE_ACCOUNTING'
        : reportKey === 'inventory/stock-level' || reportKey === 'stock-level' || reportKey.startsWith('inventory/')
          ? 'VIEW_STORE_PRODUCT_INVENTORY'
          : reportKey.startsWith('sales/') || ['net-sales', 'daily-sales-dsr'].includes(reportKey)
            ? 'VIEW_STORE_SALES'
            : null;
    if (!['super_admin', 'admin', 'manager'].includes(auth.user.role)) {
      const permissionCheck = permission
        ? requirePermission(auth.user, permission, 'VIEW_STORE_REPORTS', 'VIEW_FINANCIAL_REPORTS')
        : requirePermission(auth.user, 'VIEW_STORE_REPORTS', 'VIEW_FINANCIAL_REPORTS');
      if (permissionCheck.error) return permissionCheck.error;
    }
    const { searchParams } = new URL(request.url);
    const columns = columnsFromSearchParams(searchParams);
    const baseDefinition = getReportDefinition(reportKey);
    const definition = columns ? { ...baseDefinition, columns } : baseDefinition;
    if (!definition) return notFoundError('Report not found');

    const filters = filtersFromSearchParams(searchParams);
    const pagination = getPagination(searchParams, { defaultPageSize: 25, maxPageSize: 200 });
    // `export=xlsx` is the older download param (reports dashboard); treat it as a full export too.
    const exportFormat = pagination.isExport
      ? pagination.format
      : searchParams.get('export') === 'xlsx'
        ? 'xlsx'
        : null;

    if (exportFormat) {
      const { rows } = await getReportPage(reportKey, filters, auth.user, {
        mode: 'export',
        search: searchParams.get('search') || '',
      });
      return spreadsheetResponse(rows, {
        columns: definition.columns,
        filename: reportKey.replace(/[^\w-]+/g, '-'),
        format: exportFormat,
        sheetName: definition.worksheet || definition.title || 'Report',
      });
    }

    const report = {
      key: reportKey,
      title: definition.title,
      columns: definition.columns,
    };

    if (pagination.paged) {
      const { rows, total, summary } = await getReportPage(reportKey, filters, auth.user, {
        mode: 'page',
        limit: pagination.limit,
        offset: pagination.offset,
        search: searchParams.get('search') || '',
        summaryKeys: summaryKeysFromSearchParams(searchParams),
      });
      return successResponse({
        report,
        records: rows,
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
        summary,
      });
    }

    const rows = await getReportRows(reportKey, filters, auth.user);
    return successResponse({
      report,
      rows,
      total: rows.length,
    });
  } catch (err) {
    console.error('[report route]', err);
    return errorResponse(`Unable to load report: ${err.message}`);
  }
}
