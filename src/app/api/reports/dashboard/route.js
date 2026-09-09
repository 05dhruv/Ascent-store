import { requireAuth, requirePermission } from '@/lib/api-protection';
import { successResponse, errorResponse } from '@/lib/api-response';
import { getLiveReportsDashboard, getStoresForUser } from '@/lib/reportsService';

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    if (!['super_admin', 'admin', 'manager'].includes(auth.user.role)) {
      const permissionCheck = requirePermission(
        auth.user,
        'VIEW_STORE_REPORTS', 'VIEW_FINANCIAL_REPORTS', 'VIEW_STORE_SALES',
        'VIEW_STORE_PRODUCT_INVENTORY', 'VIEW_STORE_ACCOUNTING', 'VIEW_TAX_WISE_REPORTS',
      );
      if (permissionCheck.error) return permissionCheck.error;
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get('scope') === 'stores') {
      const stores = await getStoresForUser(auth.user);
      return successResponse({ stores });
    }

    const dashboard = await getLiveReportsDashboard(auth.user);
    return successResponse(dashboard);
  } catch (err) {
    console.error('[reports dashboard]', err);
    return errorResponse('Unable to load reports dashboard');
  }
}
