import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  requireAuth,
  requirePermission,
  requireStore,
  canAccessAllStores,
} from "@/lib/api-protection";
import { ensureMovementWorkflowSchema } from "@/lib/movementWorkflowSchema";
import { parseMovementFilters } from "@/lib/movementReportFilters.mjs";
import {
  getPagination,
  limitOffsetSql,
  pagedPayload,
  spreadsheetResponse,
} from "@/lib/pagination";

const pretty = (value) => String(value || "").replaceAll("_", " ");

const VIEWS = {
  transfers: [
    { key: "transaction_id", label: "Transfer" },
    { key: "source_name", label: "Source" },
    { key: "destination_name", label: "Destination" },
    { key: "status", label: "Status", value: (r) => pretty(r.status) },
    { key: "requested", label: "Requested" },
    { key: "dispatched", label: "Sent" },
    { key: "received", label: "Received" },
    { key: "accepted", label: "Accepted" },
    { key: "in_transit", label: "In transit" },
    { key: "damaged", label: "Damaged" },
    { key: "rejected", label: "Rejected" },
    { key: "short", label: "Short" },
    { key: "excess", label: "Excess" },
    { key: "open_cases", label: "Open cases" },
    { key: "vehicle_number", label: "Vehicle" },
    { key: "challan_number", label: "Challan" },
    { key: "expected_arrival_at", label: "ETA" },
    { key: "dispatched_at", label: "Dispatched at" },
    { key: "received_at", label: "Received at" },
    { key: "created_at", label: "Created" },
  ],
  buckets: [
    { key: "location", label: "Location" },
    { key: "location_type", label: "Location type" },
    { key: "product", label: "Material" },
    { key: "sku", label: "SKU" },
    { key: "unit", label: "Unit" },
    { key: "available", label: "Usable" },
    { key: "reserved", label: "Reserved" },
    { key: "quarantine", label: "Quarantine" },
    { key: "damaged", label: "Damaged" },
    { key: "rejected", label: "Rejected" },
    { key: "expired", label: "Expired" },
    { key: "inactive", label: "Inactive" },
    { key: "physical_qty", label: "Actual physical qty" },
  ],
  ledger: [
    { key: "created_at", label: "Date / Time" },
    { key: "location", label: "Location" },
    { key: "product", label: "Material" },
    { key: "sku", label: "SKU" },
    { key: "batch_no", label: "Batch" },
    { key: "unit", label: "Unit" },
    { key: "in", label: "In", value: (r) => (r.direction === "in" ? r.qty : "") },
    { key: "out", label: "Out", value: (r) => (r.direction === "out" ? r.qty : "") },
    { key: "recorded_balance", label: "Recorded balance" },
    {
      key: "reference_type",
      label: "Document",
      value: (r) => `${pretty(r.reference_type)} ${r.meta?.transactionId || r.reference_id || ""}`.trim(),
    },
    { key: "actor", label: "Actor" },
  ],
};

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const permission = requirePermission(
    auth.user,
    "VIEW_INVENTORY",
    "MANAGE_INVENTORY",
  );
  if (permission.error) return permission.error;
  try {
    const sp = new URL(request.url).searchParams;
    let filters;
    try {
      filters = parseMovementFilters(sp);
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const { store, project, search, from, to } = filters;
    if (store) {
      const check = requireStore(auth.user, store);
      if (check.error) return check.error;
    }
    await ensureMovementWorkflowSchema();
    const scope = canAccessAllStores(auth.user)
      ? null
      : (auth.user.assigned_stores || []).map(Number);
    const params = [scope, store, project, `%${search}%`, from, to];
    const transfersSql = (tail) =>
      `SELECT t.id,t.transaction_id,t.source_id,t.destination_id,t.status,t.workflow_version,
      t.vehicle_number,t.challan_number,t.expected_arrival_at,t.dispatched_at,t.received_at,t.created_at,
      s.name source_name,d.name destination_name,
      COALESCE(SUM(i.qty),0) requested,COALESCE(SUM(i.dispatched_qty),0) dispatched,
      COALESCE(SUM(i.received_qty),0) received,COALESCE(SUM(i.accepted_qty),0) accepted,
      COALESCE(SUM(i.damaged_qty),0) damaged,COALESCE(SUM(i.rejected_qty),0) rejected,
      COALESCE(SUM(i.short_qty),0) short,COALESCE(SUM(i.excess_qty),0) excess,
      COALESCE(SUM(i.dispatched_qty-i.received_qty-i.short_qty+i.excess_qty),0) in_transit,
      (SELECT count(*) FROM construction_discrepancies c WHERE c.transfer_id=t.id AND c.status IN ('open','under_review')) open_cases,
      COUNT(*) OVER() AS __total
      FROM stock_transfer t JOIN stores s ON s.id=t.source_id JOIN stores d ON d.id=t.destination_id
      LEFT JOIN stock_transfer_items i ON i.stock_transfer_id=t.id
      WHERE ($1::int[] IS NULL OR t.source_id=ANY($1) OR t.destination_id=ANY($1))
      AND ($2::int IS NULL OR t.source_id=$2 OR t.destination_id=$2)
      AND ($3::bigint IS NULL OR EXISTS(SELECT 1 FROM construction_sites cs WHERE cs.project_id=$3 AND cs.store_id IN(t.source_id,t.destination_id)))
      AND (concat_ws(' ',t.transaction_id,t.vehicle_number,t.challan_number,s.name,d.name) ILIKE $4
        OR EXISTS(SELECT 1 FROM stock_transfer_items x WHERE x.stock_transfer_id=t.id AND concat_ws(' ',x.product_name,x.sku,x.barcode,x.meta->>'batchNo') ILIKE $4))
      AND ($5::date IS NULL OR t.created_at >= ($5::date::timestamp AT TIME ZONE 'Asia/Kolkata'))
      AND ($6::date IS NULL OR t.created_at < (($6::date+INTERVAL '1 day') AT TIME ZONE 'Asia/Kolkata'))
      GROUP BY t.id,s.name,d.name ORDER BY t.id DESC ${tail}`;
    const bucketsSql = (tail) =>
      `SELECT b.store_id,s.name location,COALESCE(NULLIF(s.meta->>'locationType',''),'Store') location_type,p.id product_id,p.name product,p.sku,p.unit,
      SUM(CASE WHEN b.status='active' AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE) THEN b.available_qty-b.reserved_qty ELSE 0 END) available,
      SUM(b.reserved_qty) reserved,
      SUM(CASE WHEN b.status IN ('quarantine','blocked') THEN b.available_qty-b.reserved_qty ELSE 0 END) quarantine,
      SUM(CASE WHEN b.status='damaged' THEN b.available_qty-b.reserved_qty ELSE 0 END) damaged,
      SUM(CASE WHEN b.status='rejected' THEN b.available_qty-b.reserved_qty ELSE 0 END) rejected,
      SUM(CASE WHEN b.status='active' AND b.expiry_date < CURRENT_DATE THEN b.available_qty-b.reserved_qty ELSE 0 END) expired,
      SUM(CASE WHEN b.status NOT IN ('active','quarantine','blocked','damaged','rejected') THEN b.available_qty-b.reserved_qty ELSE 0 END) inactive,
      SUM(b.available_qty) physical_qty,
      COUNT(*) OVER() AS __total
      FROM inventory_batches b JOIN products p ON p.id=b.product_id JOIN stores s ON s.id=b.store_id
      WHERE ($1::int[] IS NULL OR b.store_id=ANY($1)) AND ($2::int IS NULL OR b.store_id=$2)
      AND ($3::bigint IS NULL OR EXISTS(SELECT 1 FROM construction_sites cs WHERE cs.project_id=$3 AND cs.store_id=b.store_id))
      AND concat_ws(' ',p.name,p.sku,b.batch_no,s.name) ILIKE $4
      GROUP BY b.store_id,s.name,s.meta,p.id ORDER BY s.name,p.name ${tail}`;
    const ledgerSql = (tail) =>
      `WITH movements AS (
      SELECT m.*,SUM(CASE WHEN direction='in' THEN qty WHEN direction='out' THEN -qty ELSE 0 END)
        OVER(PARTITION BY store_id,product_id ORDER BY created_at,id) recorded_balance FROM inventory_batch_movements m
      ) SELECT m.id,m.created_at,m.product_id,p.name product,p.sku,p.unit,s.name location,m.store_id,m.direction,m.qty,
        m.recorded_balance,m.reference_type,m.reference_id,m.meta,b.batch_no,
        COALESCE(u.name,m.meta->>'actorId','Historical / not recorded') actor,
        COUNT(*) OVER() AS __total
      FROM movements m LEFT JOIN products p ON p.id=m.product_id LEFT JOIN stores s ON s.id=m.store_id
      LEFT JOIN inventory_batches b ON b.id=m.batch_id
      LEFT JOIN users u ON u.id=CASE WHEN m.meta->>'actorId' ~ '^[0-9]+$' THEN (m.meta->>'actorId')::bigint END
      WHERE ($1::int[] IS NULL OR m.store_id=ANY($1)) AND ($2::int IS NULL OR m.store_id=$2)
      AND ($3::bigint IS NULL OR EXISTS(SELECT 1 FROM construction_sites cs WHERE cs.project_id=$3 AND cs.store_id=m.store_id))
      AND concat_ws(' ',p.name,p.sku,b.batch_no,m.reference_id,m.meta->>'transactionId',s.name) ILIKE $4
      AND ($5::date IS NULL OR m.created_at >= ($5::date::timestamp AT TIME ZONE 'Asia/Kolkata'))
      AND ($6::date IS NULL OR m.created_at < (($6::date+INTERVAL '1 day') AT TIME ZONE 'Asia/Kolkata'))
      ORDER BY m.created_at DESC,m.id DESC ${tail}`;

    const loadLookups = () =>
      Promise.all([
        query(
          `SELECT DISTINCT p.id,p.name FROM construction_projects p JOIN construction_sites s ON s.project_id=p.id
      WHERE $1::int[] IS NULL OR s.store_id=ANY($1) ORDER BY p.name`,
          [scope],
        ),
        query(
          "SELECT id,name FROM stores WHERE $1::int[] IS NULL OR id=ANY($1) ORDER BY name",
          [scope],
        ),
      ]);

    const view = sp.get("view");
    const pagination = getPagination(sp, { defaultPageSize: 50, legacyLimit: 501 });
    if (Object.hasOwn(VIEWS, view || "") && (pagination.paged || pagination.isExport)) {
      const viewParams = view === "buckets" ? params.slice(0, 4) : [...params];
      const builder = { transfers: transfersSql, buckets: bucketsSql, ledger: ledgerSql }[view];
      const result = await query(
        builder(limitOffsetSql(pagination, viewParams)),
        viewParams,
      );
      if (pagination.isExport) {
        return spreadsheetResponse(result.rows, {
          filename: `material-movement-${view}`,
          format: pagination.format,
          columns: VIEWS[view],
        });
      }
      const [projects, stores] = await loadLookups();
      return NextResponse.json({
        success: true,
        data: pagedPayload(result.rows, pagination, {
          view,
          projects: projects.rows,
          stores: stores.rows,
        }),
      });
    }

    const transfers = await query(transfersSql("LIMIT 501"), params);
    const buckets = await query(bucketsSql("LIMIT 501"), params.slice(0, 4));
    const ledger = await query(ledgerSql("LIMIT 501"), params);
    const [projects, stores] = await loadLookups();
    const strip = (rows) => rows.slice(0, 500).map(({ __total, ...rest }) => rest);
    return NextResponse.json({
      transfers: strip(transfers.rows),
      buckets: strip(buckets.rows),
      ledger: strip(ledger.rows),
      projects: projects.rows,
      stores: stores.rows,
      truncated:
        transfers.rows.length > 500 ||
        buckets.rows.length > 500 ||
        ledger.rows.length > 500,
    });
  } catch (error) {
    console.error("[movement tracker]", error.message);
    return NextResponse.json(
      { error: "Unable to load movement reports" },
      { status: 500 },
    );
  }
}
