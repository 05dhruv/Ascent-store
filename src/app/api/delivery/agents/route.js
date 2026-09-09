import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureEmployeesSchema } from "@/lib/employeesSchema";
import {
  canAccessAllStores,
  getAssignedStoreIds,
  requireAuth,
} from "@/lib/api-protection";

export async function GET(request) {
  try {
    await ensureEmployeesSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const storeIds = canAccessAllStores(auth.user)
      ? null
      : getAssignedStoreIds(auth.user);
    if (storeIds && !storeIds.length) {
      return NextResponse.json({ success: true, data: { agents: [] } });
    }
    const params = [];
    const scope = storeIds
      ? `AND us.store_id = ANY($${params.push(storeIds)}::int[])`
      : "";
    const result = await query(
      `SELECT e.id, e.user_id, e.first_name, e.last_name, e.mobile_number,
              e.role_name, us.store_id, s.name AS store_name
       FROM employees e
       INNER JOIN users u ON u.id = e.user_id AND u.is_active = TRUE
       INNER JOIN user_stores us ON us.user_id = e.user_id AND us.is_active = TRUE
       INNER JOIN stores s ON s.id = us.store_id AND s.is_active = TRUE
       WHERE e.user_id IS NOT NULL
         AND LOWER(COALESCE(e.employment_status, 'active')) = 'active'
         AND (
           LOWER(COALESCE(e.role_name, '')) LIKE '%rider%'
           OR LOWER(COALESCE(e.role_name, '')) LIKE '%delivery%'
         )
         ${scope}
       ORDER BY s.name, e.first_name, e.last_name`,
      params,
    );
    return NextResponse.json({
      success: true,
      data: {
        agents: result.rows.map((row) => ({
          id: Number(row.id),
          userId: Number(row.user_id),
          name: [row.first_name, row.last_name].filter(Boolean).join(" "),
          phone: row.mobile_number || "",
          role: row.role_name || "Delivery Rider",
          storeId: Number(row.store_id),
          storeName: row.store_name,
        })),
      },
    });
  } catch (error) {
    console.error("[delivery agents]", error);
    return NextResponse.json(
      { success: false, message: "Unable to load delivery riders" },
      { status: 500 },
    );
  }
}
