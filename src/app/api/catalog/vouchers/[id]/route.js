import { query } from '@/lib/db';
import { successResponse, errorResponse, notFound } from '@/lib/apiResponse';
import { ensureVouchersSchema } from '@/lib/catalogExtrasSchema';
import { requireAuth, requirePermission } from '@/lib/api-protection';

// ─── PATCH /api/catalog/vouchers/[id] — unblock voucher ──────
export async function PATCH(request, { params }) {
  try {
    await ensureVouchersSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const permissionCheck = requirePermission(auth.user, 'MANAGE_CATALOG');
    if (permissionCheck.error) return permissionCheck.error;

    const id = Number(params?.id);
    if (!id) return errorResponse('Invalid voucher id', 400);

    const body = await request.json().catch(() => ({}));
    const action = body.action || 'unblock';

    if (action === 'unblock') {
      const result = await query(
        `UPDATE vouchers
         SET is_blocked = false, is_active = true, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );
      if (!result.rows.length) return notFound('Voucher not found');
      return successResponse(result.rows[0], 'Voucher unblocked');
    }

    return errorResponse('Unknown action', 400);
  } catch (err) {
    return errorResponse(err.message);
  }
}
