import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  requireAuth,
  requirePermission,
  canAccessAllStores,
} from "@/lib/api-protection";
import { ensureConstructionSchema } from "@/lib/constructionSchema";

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

async function access(request, permissions) {
  const auth = await requireAuth(request);
  if (auth.error) return { error: auth.error };
  const allowed = requirePermission(auth.user, ...permissions);
  if (allowed.error) return { error: allowed.error };
  return { user: auth.user };
}

export async function GET(request) {
  const auth = await access(request, [
    "PROJECT_VIEW",
    "PROJECT_EDIT",
    "SITE_VIEW",
  ]);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionSchema();
    const projectId =
      Number(new URL(request.url).searchParams.get("projectId")) || null;
    const scope = canAccessAllStores(auth.user)
      ? null
      : (auth.user.assigned_stores || []).map(Number);
    const params = [scope, projectId];
    const [projects, costCodes, activities, boq, progress] = await Promise.all([
      query(
        `SELECT p.id,p.project_code,p.name,p.budget,p.status FROM construction_projects p
        WHERE ($1::int[] IS NULL OR EXISTS (SELECT 1 FROM construction_sites s WHERE s.project_id=p.id AND s.store_id=ANY($1)))
        AND ($2::bigint IS NULL OR p.id=$2) ORDER BY p.name`,
        params,
      ),
      query(
        `SELECT c.*,p.name project_name FROM construction_cost_codes c JOIN construction_projects p ON p.id=c.project_id
        WHERE ($1::int[] IS NULL OR EXISTS (SELECT 1 FROM construction_sites s WHERE s.project_id=c.project_id AND s.store_id=ANY($1)))
        AND ($2::bigint IS NULL OR c.project_id=$2) ORDER BY c.code`,
        params,
      ),
      query(
        `SELECT a.*,p.name project_name,s.name site_name,c.code cost_code FROM construction_work_activities a
        JOIN construction_projects p ON p.id=a.project_id LEFT JOIN construction_sites s ON s.id=a.site_id
        LEFT JOIN construction_cost_codes c ON c.id=a.cost_code_id
        WHERE ($1::int[] IS NULL OR EXISTS (SELECT 1 FROM construction_sites cs WHERE cs.project_id=a.project_id AND cs.store_id=ANY($1)))
        AND ($2::bigint IS NULL OR a.project_id=$2) ORDER BY a.created_at DESC`,
        params,
      ),
      query(
        `SELECT b.*,p.name project_name,c.code cost_code,a.name activity_name
        FROM construction_boq_items b JOIN construction_projects p ON p.id=b.project_id
        LEFT JOIN construction_cost_codes c ON c.id=b.cost_code_id LEFT JOIN construction_work_activities a ON a.id=b.activity_id
        WHERE ($1::int[] IS NULL OR EXISTS (SELECT 1 FROM construction_sites cs WHERE cs.project_id=b.project_id AND cs.store_id=ANY($1)))
        AND ($2::bigint IS NULL OR b.project_id=$2) ORDER BY b.created_at DESC`,
        params,
      ),
      query(
        `SELECT d.*,p.name project_name,s.name site_name,a.name activity_name,u.name submitted_by_name
        FROM construction_daily_progress d JOIN construction_projects p ON p.id=d.project_id
        LEFT JOIN construction_sites s ON s.id=d.site_id LEFT JOIN construction_work_activities a ON a.id=d.activity_id
        LEFT JOIN users u ON u.id=d.submitted_by
        WHERE ($1::int[] IS NULL OR EXISTS (SELECT 1 FROM construction_sites cs WHERE cs.project_id=d.project_id AND cs.store_id=ANY($1)))
        AND ($2::bigint IS NULL OR d.project_id=$2) ORDER BY d.progress_date DESC,d.id DESC LIMIT 100`,
        params,
      ),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        projects: projects.rows,
        costCodes: costCodes.rows,
        activities: activities.rows,
        boq: boq.rows,
        progress: progress.rows,
      },
    });
  } catch (error) {
    console.error("[construction controls GET]", error);
    return NextResponse.json(
      { error: "Unable to load project controls" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const auth = await access(request, ["PROJECT_CREATE", "PROJECT_EDIT"]);
  if (auth.error) return auth.error;
  try {
    await ensureConstructionSchema();
    const body = await request.json();
    const type = String(body.type || "");
    if (type === "cost_code") {
      const result = await query(
        `INSERT INTO construction_cost_codes (project_id,code,name,category,budget)
        VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          Number(body.projectId),
          String(body.code || "")
            .trim()
            .toUpperCase(),
          String(body.name || "").trim(),
          body.category || null,
          number(body.budget),
        ],
      );
      return NextResponse.json(
        { success: true, data: result.rows[0] },
        { status: 201 },
      );
    }
    if (type === "activity") {
      const result = await query(
        `INSERT INTO construction_work_activities (project_id,site_id,cost_code_id,name,block_name,floor_name,contractor_name,status,start_date,end_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'planned',$8,$9) RETURNING *`,
        [
          Number(body.projectId),
          Number(body.siteId) || null,
          Number(body.costCodeId) || null,
          String(body.name || "").trim(),
          body.blockName || null,
          body.floorName || null,
          body.contractorName || null,
          body.startDate || null,
          body.endDate || null,
        ],
      );
      return NextResponse.json(
        { success: true, data: result.rows[0] },
        { status: 201 },
      );
    }
    if (type === "boq") {
      const qty = number(body.plannedQty);
      const rate = number(body.rate);
      const result = await query(
        `INSERT INTO construction_boq_items (project_id,cost_code_id,activity_id,item_code,description,unit,planned_qty,rate,budget_amount,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          Number(body.projectId),
          Number(body.costCodeId) || null,
          Number(body.activityId) || null,
          body.itemCode || null,
          String(body.description || "").trim(),
          body.unit || "NOS",
          qty,
          rate,
          qty * rate,
          auth.user.id,
        ],
      );
      return NextResponse.json(
        { success: true, data: result.rows[0] },
        { status: 201 },
      );
    }
    if (type === "progress") {
      const result = await query(
        `INSERT INTO construction_daily_progress (project_id,site_id,activity_id,progress_date,work_done,progress_percent,labour_count,labour_hours,equipment,remarks,submitted_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) RETURNING *`,
        [
          Number(body.projectId),
          Number(body.siteId) || null,
          Number(body.activityId) || null,
          body.progressDate || new Date().toISOString().slice(0, 10),
          String(body.workDone || "").trim(),
          number(body.progressPercent),
          number(body.labourCount),
          number(body.labourHours),
          JSON.stringify(body.equipment || []),
          body.remarks || null,
          auth.user.id,
        ],
      );
      return NextResponse.json(
        { success: true, data: result.rows[0] },
        { status: 201 },
      );
    }
    if (type === "approve_progress") {
      const result = await query(
        `UPDATE construction_daily_progress SET approval_status=$2,approved_by=$3,approved_at=NOW() WHERE id=$1 RETURNING *`,
        [
          Number(body.progressId),
          body.approved ? "approved" : "rejected",
          auth.user.id,
        ],
      );
      if (!result.rows.length)
        return NextResponse.json(
          { error: "Progress entry not found" },
          { status: 404 },
        );
      return NextResponse.json({ success: true, data: result.rows[0] });
    }
    return NextResponse.json(
      { error: "Unsupported project control action" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[construction controls POST]", error);
    return NextResponse.json(
      {
        error:
          error.code === "23505"
            ? "This code already exists for the project"
            : "Unable to save project control",
      },
      { status: 500 },
    );
  }
}
