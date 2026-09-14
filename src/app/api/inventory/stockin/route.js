import { NextResponse } from "next/server";
import { query, getClient } from "@/lib/db";
import * as XLSX from "xlsx";
import { ensureStockInSchema } from "@/lib/stockInSchema";
import { ensureInventoryBatchSchema } from "@/lib/inventoryBatching";
import { ensureCatalogExtrasSchema } from "@/lib/catalogExtrasSchema";
import { ensureVendorsSchema } from "@/lib/vendorsSchema";
import { ensureMarginApprovalSchema } from "@/lib/marginApprovalSchema";
import {
  appendStoreScope,
  requireAuth,
  requirePermission,
  requireStore,
} from "@/lib/api-protection";

function isWarehouseMeta(meta) {
  return (
    String(meta?.locationType || "")
      .trim()
      .toLowerCase() === "warehouse"
  );
}

export async function GET(request) {
  try {
    await ensureStockInSchema();
    await ensureInventoryBatchSchema();
    await ensureCatalogExtrasSchema();
    await ensureVendorsSchema();
    await ensureMarginApprovalSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(
      auth.user,
      "STOCK_VIEW",
      "GRN_CREATE",
      "GRN_APPROVE",
    );
    if (permissionCheck.error) return permissionCheck.error;

    const { searchParams } = new URL(request.url);
    if (searchParams.get("template") === "products") {
      const templateParams = [];
      const templateWhere = [`COALESCE(p.is_active, TRUE) = TRUE`];
      const brandId = String(searchParams.get("brand_id") || "").trim();
      const brandIds = String(searchParams.get("brand_ids") || "")
        .split(",")
        .map((id) => Number(id))
        .filter(Number.isFinite);
      const categoryId = String(searchParams.get("category_id") || "").trim();

      let selectedBrandNames = [];
      let selectedCategoryName = "";
      if (brandIds.length) {
        const brandNamesRes = await query(
          `SELECT name FROM brands WHERE id = ANY($1::int[])`,
          [brandIds],
        ).catch(() => ({ rows: [] }));
        selectedBrandNames = brandNamesRes.rows
          .map((row) =>
            String(row.name || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean);
      }
      if (categoryId) {
        const categoryNameRes = await query(
          `SELECT name FROM categories WHERE id = $1 LIMIT 1`,
          [Number(categoryId)],
        ).catch(() => ({ rows: [] }));
        selectedCategoryName = String(categoryNameRes.rows[0]?.name || "")
          .trim()
          .toLowerCase();
      }

      if (brandIds.length) {
        templateParams.push(brandIds);
        const brandIdParam = templateParams.length;
        if (selectedBrandNames.length) {
          templateParams.push(selectedBrandNames);
          templateWhere.push(`(
            p.brand_id = ANY($${brandIdParam}::int[])
            OR LOWER(COALESCE(b.name, '')) = ANY($${templateParams.length}::text[])
          )`);
        } else {
          templateWhere.push(`p.brand_id = ANY($${brandIdParam}::int[])`);
        }
      } else if (brandId) {
        templateParams.push(Number(brandId));
        templateWhere.push(`p.brand_id = $${templateParams.length}`);
      }
      if (categoryId) {
        templateParams.push(Number(categoryId));
        const categoryIdParam = templateParams.length;
        if (selectedCategoryName) {
          templateParams.push(selectedCategoryName);
          templateWhere.push(`(
            p.category_id = $${categoryIdParam}
            OR LOWER(COALESCE(c.name, '')) = $${templateParams.length}
          )`);
        } else {
          templateWhere.push(`p.category_id = $${categoryIdParam}`);
        }
      }

      const selectTemplateProducts = (whereParts, params) =>
        query(
          `SELECT
           p.id,
           p.product_id,
           p.name,
           p.barcode,
           p.sku,
           p.unit,
           p.stock_item_type,
           COALESCE(p.cost_price, 0) AS cost_price,
           COALESCE(p.mrp, 0) AS mrp,
           COALESCE(p.selling_price, 0) AS selling_price,
           b.id AS brand_id,
           c.name AS category_name,
           b.name AS brand_name,
           COALESCE(batch_expiry.expiry_date, item_expiry.expiry_date) AS expiry_date
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN LATERAL (
           SELECT MIN(ib.expiry_date) AS expiry_date
           FROM inventory_batches ib
           WHERE ib.product_id = p.id
             AND ib.available_qty > 0
             AND ib.status = 'active'
             AND ib.expiry_date IS NOT NULL
             AND ib.expiry_date >= CURRENT_DATE
         ) batch_expiry ON TRUE
         LEFT JOIN LATERAL (
           SELECT MIN(sii.expiry_date) AS expiry_date
           FROM stock_in_items sii
           INNER JOIN stock_in si ON si.id = sii.stock_in_id
           WHERE sii.product_id = p.id
             AND si.status = 'confirmed'
             AND sii.expiry_date IS NOT NULL
             AND sii.expiry_date >= CURRENT_DATE
         ) item_expiry ON TRUE
         WHERE ${whereParts.join(" AND ")}
         ORDER BY p.id ASC
         LIMIT 10000`,
          params,
        );

      let productsRes = await selectTemplateProducts(
        templateWhere,
        templateParams,
      );
      if (!productsRes.rows.length && categoryId && brandIds.length) {
        const fallbackWhere = templateWhere.filter(
          (part) => !part.includes("p.category_id"),
        );
        const fallbackParams = templateParams.slice(
          0,
          selectedBrandNames.length ? 2 : 1,
        );
        productsRes = await selectTemplateProducts(
          fallbackWhere,
          fallbackParams,
        );
      }

      const records = productsRes.rows.map((row) => ({
          id: row.id,
          productId: row.product_id || row.id,
          productName: row.name || "",
          sizeId: row.id,
          sizeName: "",
          category: row.category_name || "",
          brandId: row.brand_id || "",
          brand: row.brand_name || "",
          barcode: row.barcode || "",
          sku: row.sku || "",
          unit: row.unit || "Piece",
          stockItemsType: String(
            row.stock_item_type || "BATCHED",
          ).toUpperCase(),
          quantity: "",
          costPerUnit: Number(row.cost_price || 0),
          mrp: Number(row.mrp || 0),
          sellingPrice: Number(row.selling_price || 0),
          expiryDate: row.expiry_date
            ? String(row.expiry_date).slice(0, 10)
            : "",
          serialNumberLabel: "",
          serialNumber: "",
          remarks: "",
        }));

      if (searchParams.get("format") === "xlsx") {
        const headers = [
          "Material ID", "Material Name", "Specification ID", "Specification / Grade", "Material Category", "Brand / Make",
          "Barcode", "Material Code", "Unit of Measure", "Traceability Type", "Received Quantity", "Purchase Rate / Unit",
          "Reference Rate", "Issue Rate", "Warranty / Expiry Date", "Lot / Batch No",
          "Serial / Heat No", "Inspection Remarks",
        ];
        const rows = records.map((product) => ({
          "Material ID": String(product.id),
          "Material Name": product.productName,
          "Specification ID": String(product.sizeId),
          "Specification / Grade": product.sizeName,
          "Material Category": product.category,
          "Brand / Make": product.brand,
          Barcode: String(product.barcode || ""),
          "Material Code": String(product.sku || ""),
          "Unit of Measure": product.unit || "Piece",
          "Traceability Type": product.stockItemsType || "BATCHED",
          "Received Quantity": "",
          "Purchase Rate / Unit": product.costPerUnit,
          "Reference Rate": product.mrp,
          "Issue Rate": product.sellingPrice,
          "Warranty / Expiry Date": "",
          "Lot / Batch No": "",
          "Serial / Heat No": "",
          "Inspection Remarks": "",
        }));
        const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
        // IDs, barcodes and SKUs must remain text. Excel otherwise converts long
        // barcodes into scientific notation and changes the value on upload.
        const textHeaders = ["Material ID", "Specification ID", "Barcode", "Material Code", "Lot / Batch No", "Serial / Heat No"];
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          for (const header of textHeaders) {
            const columnIndex = headers.indexOf(header);
            const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex });
            const value = String(rows[rowIndex][header] ?? "");
            worksheet[cellRef] = { t: "s", v: value, z: "@" };
          }
        }
        worksheet["!cols"] = headers.map((header) => ({
          wch: header === "Barcode" ? 20 : Math.max(12, Math.min(28, header.length + 2)),
        }));
        worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Bulk Stock In");
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
        const filename = `Stock-In-Template-${new Date().toISOString().slice(0, 10)}.xlsx`;
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
          },
        });
      }

      return NextResponse.json({ records });
    }

    const params = [];
    const whereClauses = [`s.status IN ('confirmed', 'margin_hold')`];
    const scope = appendStoreScope(
      whereClauses,
      params,
      "s.destination_id",
      auth.user,
    );
    if (scope.error) return scope.error;
    const search = String(searchParams.get("search") || "").trim();
    const dateFrom = String(searchParams.get("date_from") || "").trim();
    const dateTo = String(searchParams.get("date_to") || "").trim();
    const source = String(searchParams.get("source") || "").trim();
    const destination = String(searchParams.get("destination") || "").trim();
    const brand = String(searchParams.get("brand") || "").trim();

    if (search) {
      params.push(`%${search}%`);
      const textSearchParam = params.length;
      const amountSearch = search.replace(/[₹,\s]/g, "");
      const normalizedAmountSearch = search
        .replace(/\u20b9/g, "")
        .replace(/[,\s]/g, "");
      let amountPatternParam = null;
      if (normalizedAmountSearch) {
        params.push(`%${normalizedAmountSearch}%`);
        amountPatternParam = params.length;
      }
      const amountDigitsSearch = normalizedAmountSearch.replace(/\D/g, "");
      let amountDigitsPatternParam = null;
      if (amountDigitsSearch) {
        params.push(`%${amountDigitsSearch}%`);
        amountDigitsPatternParam = params.length;
      }
      const isAmountSearch = /^-?\d+(\.\d+)?$/.test(
        normalizedAmountSearch,
      );
      let amountValueParam = null;
      if (isAmountSearch) {
        params.push(normalizedAmountSearch);
        amountValueParam = params.length;
      }
      const amountSearchClause = normalizedAmountSearch
        ? `
        OR REPLACE(COALESCE(s.total_cost, 0)::text, ',', '') ILIKE $${amountPatternParam}
        OR TO_CHAR(ROUND(COALESCE(s.total_cost, 0)::numeric, 2), 'FM999999999999990.00') ILIKE $${amountPatternParam}
        ${
          amountDigitsPatternParam
            ? `OR REGEXP_REPLACE(TO_CHAR(ROUND(COALESCE(s.total_cost, 0)::numeric, 2), 'FM999999999999990.00'), '[^0-9]', '', 'g') ILIKE $${amountDigitsPatternParam}`
            : ""
        }
        ${
          amountValueParam
            ? `OR ROUND(COALESCE(s.total_cost, 0)::numeric, 2) = ROUND($${amountValueParam}::numeric, 2)`
            : ""
        }
        OR REPLACE(COALESCE((
          SELECT SUM(amount_sii.qty * amount_sii.cost_price)
          FROM stock_in_items amount_sii
          WHERE amount_sii.stock_in_id = s.id
        ), 0)::text, ',', '') ILIKE $${amountPatternParam}
        OR TO_CHAR(ROUND(COALESCE((
          SELECT SUM(amount_sii.qty * amount_sii.cost_price)
          FROM stock_in_items amount_sii
          WHERE amount_sii.stock_in_id = s.id
        ), 0)::numeric, 2), 'FM999999999999990.00') ILIKE $${amountPatternParam}
        ${
          amountDigitsPatternParam
            ? `OR REGEXP_REPLACE(TO_CHAR(ROUND(COALESCE((
          SELECT SUM(amount_sii.qty * amount_sii.cost_price)
          FROM stock_in_items amount_sii
          WHERE amount_sii.stock_in_id = s.id
        ), 0)::numeric, 2), 'FM999999999999990.00'), '[^0-9]', '', 'g') ILIKE $${amountDigitsPatternParam}`
            : ""
        }
        ${
          amountValueParam
            ? `OR ROUND(COALESCE((
          SELECT SUM(amount_sii.qty * amount_sii.cost_price)
          FROM stock_in_items amount_sii
          WHERE amount_sii.stock_in_id = s.id
        ), 0)::numeric, 2) = ROUND($${amountValueParam}::numeric, 2)`
            : ""
        }
        OR REPLACE((COALESCE((
          SELECT SUM(amount_sii.qty * amount_sii.cost_price)
          FROM stock_in_items amount_sii
          WHERE amount_sii.stock_in_id = s.id
        ), 0) + COALESCE(s.other_charges, 0))::text, ',', '') ILIKE $${amountPatternParam}
        OR TO_CHAR(ROUND((COALESCE((
          SELECT SUM(amount_sii.qty * amount_sii.cost_price)
          FROM stock_in_items amount_sii
          WHERE amount_sii.stock_in_id = s.id
        ), 0) + COALESCE(s.other_charges, 0))::numeric, 2), 'FM999999999999990.00') ILIKE $${amountPatternParam}
        ${
          amountDigitsPatternParam
            ? `OR REGEXP_REPLACE(TO_CHAR(ROUND((COALESCE((
          SELECT SUM(amount_sii.qty * amount_sii.cost_price)
          FROM stock_in_items amount_sii
          WHERE amount_sii.stock_in_id = s.id
        ), 0) + COALESCE(s.other_charges, 0))::numeric, 2), 'FM999999999999990.00'), '[^0-9]', '', 'g') ILIKE $${amountDigitsPatternParam}`
            : ""
        }
        ${
          amountValueParam
            ? `OR ROUND((COALESCE((
          SELECT SUM(amount_sii.qty * amount_sii.cost_price)
          FROM stock_in_items amount_sii
          WHERE amount_sii.stock_in_id = s.id
        ), 0) + COALESCE(s.other_charges, 0))::numeric, 2) = ROUND($${amountValueParam}::numeric, 2)`
            : ""
        }
        `
        : "";
      whereClauses.push(`(
        COALESCE(s.transaction_id, '') ILIKE $${textSearchParam}
        OR ('STK-' || LPAD(s.id::text, 4, '0')) ILIKE $${textSearchParam}
        OR s.id::text ILIKE $${textSearchParam}
        OR COALESCE(s.invoice_number, '') ILIKE $${textSearchParam}
        OR COALESCE(s.vendor_name, '') ILIKE $${textSearchParam}
        OR COALESCE(st.name, '') ILIKE $${textSearchParam}
        OR COALESCE(stock_in_user.name, '') ILIKE $${textSearchParam}
        OR COALESCE(stock_in_user.email, '') ILIKE $${textSearchParam}
        OR COALESCE(s.meta->>'createdByName', '') ILIKE $${textSearchParam}
        OR COALESCE(s.meta->>'createdByEmail', '') ILIKE $${textSearchParam}
        OR COALESCE(s.meta->>'created_by_name', '') ILIKE $${textSearchParam}
        OR COALESCE(s.meta->>'created_by_email', '') ILIKE $${textSearchParam}
        OR COALESCE(s.reference_type, '') ILIKE $${textSearchParam}
        OR REPLACE(COALESCE(s.reference_type, ''), '_', ' ') ILIKE $${textSearchParam}
        OR COALESCE(s.reference_id, '') ILIKE $${textSearchParam}
        OR COALESCE(s.status, '') ILIKE $${textSearchParam}
        OR REPLACE(COALESCE(s.status, ''), '_', ' ') ILIKE $${textSearchParam}
        OR CASE
             WHEN s.status = 'margin_hold' THEN 'Margin Hold'
             WHEN s.status = 'confirmed' THEN 'Confirmed'
             ELSE COALESCE(s.status, '')
           END ILIKE $${textSearchParam}
        OR TO_CHAR(COALESCE(s.invoice_date::date, s.created_at::date), 'DD/MM/YY') ILIKE $${textSearchParam}
        OR TO_CHAR(COALESCE(s.invoice_date::date, s.created_at::date), 'DD/MM/YYYY') ILIKE $${textSearchParam}
        OR TO_CHAR(COALESCE(s.invoice_date::date, s.created_at::date), 'DD-MM-YY') ILIKE $${textSearchParam}
        OR TO_CHAR(COALESCE(s.invoice_date::date, s.created_at::date), 'YYYY-MM-DD') ILIKE $${textSearchParam}
        OR COALESCE(NULLIF(s.total_items, 0), (
          SELECT SUM(item_count_sii.qty)
          FROM stock_in_items item_count_sii
          WHERE item_count_sii.stock_in_id = s.id
        ), 0)::text ILIKE $${textSearchParam}
        OR EXISTS (
          SELECT 1
          FROM stock_in_items search_sii
          INNER JOIN products search_p ON search_p.id = search_sii.product_id
          LEFT JOIN brands search_b ON search_b.id = search_p.brand_id
          WHERE search_sii.stock_in_id = s.id
            AND COALESCE(search_b.name, '') ILIKE $${textSearchParam}
        )
        ${amountSearchClause}
      )`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      whereClauses.push(
        `COALESCE(s.invoice_date::date, s.created_at::date) >= $${params.length}::date`,
      );
    }
    if (dateTo) {
      params.push(dateTo);
      whereClauses.push(
        `COALESCE(s.invoice_date::date, s.created_at::date) <= $${params.length}::date`,
      );
    }
    if (source) {
      params.push(source);
      whereClauses.push(`COALESCE(s.reference_type, '') = $${params.length}`);
    }
    if (destination) {
      params.push(Number(destination));
      whereClauses.push(`s.destination_id = $${params.length}`);
    }
    if (brand) {
      params.push(`%${brand}%`);
      whereClauses.push(`EXISTS (
        SELECT 1
        FROM stock_in_items brand_sii
        INNER JOIN products brand_p ON brand_p.id = brand_sii.product_id
        LEFT JOIN brands brand_b ON brand_b.id = brand_p.brand_id
        WHERE brand_sii.stock_in_id = s.id
          AND COALESCE(brand_b.name, '') ILIKE $${params.length}
      )`);
    }

    const res = await query(
      `SELECT
        s.id,
        s.transaction_id,
        s.invoice_number,
        s.invoice_date,
        s.vendor_name,
        s.other_charges,
        s.total_items,
        s.total_cost,
        s.total_tax,
        s.reference_type,
        s.reference_id,
        s.status,
        s.created_at,
        COALESCE(
          s.created_by,
          CASE
            WHEN COALESCE(s.meta->>'createdBy', '') ~ '^[0-9]+$'
            THEN (s.meta->>'createdBy')::bigint
            ELSE NULL
          END
        ) AS stock_in_by_id,
        stock_in_user.name AS stock_in_by_name,
        stock_in_user.email AS stock_in_by_email,
        s.meta,
        s.destination_id,
        (
          SELECT COUNT(*)::int
          FROM margin_approval_requests mar
          WHERE mar.stock_in_id = s.id
            AND LOWER(COALESCE(mar.status, '')) = 'pending'
        ) AS pending_margin_approval_count,
        (
          SELECT COUNT(*)::int
          FROM margin_approval_requests mar
          WHERE mar.stock_in_id = s.id
            AND LOWER(COALESCE(mar.status, '')) = 'rejected'
        ) AS rejected_margin_approval_count,
        st.name AS destination_name,
        STRING_AGG(DISTINCT b.name, ', ' ORDER BY b.name)
          FILTER (WHERE b.name IS NOT NULL) AS brand_names,
        COUNT(DISTINCT si.product_id)::int AS item_count,
        COALESCE(SUM(si.qty), 0) AS item_qty_sum,
        COALESCE(SUM(si.qty * si.cost_price), 0) AS items_cost_sum
      FROM stock_in s
      LEFT JOIN stores st ON st.id = s.destination_id
      LEFT JOIN users stock_in_user ON stock_in_user.id = COALESCE(
        s.created_by,
        CASE
          WHEN COALESCE(s.meta->>'createdBy', '') ~ '^[0-9]+$'
          THEN (s.meta->>'createdBy')::bigint
          ELSE NULL
        END
      )
      LEFT JOIN stock_in_items si ON si.stock_in_id = s.id
      LEFT JOIN products p ON p.id = si.product_id
      LEFT JOIN brands b ON b.id = p.brand_id
      WHERE ${whereClauses.join(" AND ")}
      GROUP BY s.id, st.name, stock_in_user.name, stock_in_user.email
      ORDER BY s.id DESC
      LIMIT 200`,
      params,
    );

    const records = res.rows.map((row) => {
      const totalItems = Number(row.total_items || row.item_qty_sum || 0);
      const pendingMarginApprovalCount = Number(
        row.pending_margin_approval_count || 0,
      );
      const status = row.status || "confirmed";
      const totalCost = Number(
        row.total_cost ||
          Number(row.items_cost_sum || 0) + Number(row.other_charges || 0),
      );
      const meta = typeof row.meta === "object" && row.meta ? row.meta : {};
      const stockInByName =
        row.stock_in_by_name ||
        meta.createdByName ||
        meta.created_by_name ||
        "";
      const stockInByEmail =
        row.stock_in_by_email ||
        meta.createdByEmail ||
        meta.created_by_email ||
        "";
      return {
        id: row.id,
        transactionId:
          row.transaction_id || `#STK-${String(row.id).padStart(3, "0")}`,
        invoiceNumber: row.invoice_number || "—",
        destination: row.destination_name || "—",
        invoiceDate: row.invoice_date,
        totalItems,
        itemCount: Number(row.item_count || 0),
        cost: totalCost,
        referenceType: row.reference_type || "—",
        referenceId: row.reference_id || "—",
        vendorName: row.vendor_name,
        brandNames: row.brand_names || "",
        stockInBy:
          stockInByName ||
          stockInByEmail ||
          (row.stock_in_by_id ? `User #${row.stock_in_by_id}` : ""),
        stockInByEmail,
        stockInById: row.stock_in_by_id,
        status,
        pendingMarginApprovalCount,
        totalTax: Number(row.total_tax || 0),
        createdAt: row.created_at,
      };
    });

    return NextResponse.json(records);
  } catch (err) {
    console.error("[stockin GET]", err.message);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request) {
  try {
    await ensureStockInSchema();
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const permissionCheck = requirePermission(auth.user, "GRN_CREATE");
    if (permissionCheck.error) return permissionCheck.error;

    const payload = await request.json();
    const sourceType = String(
      payload.sourceType || payload.source_type || "warehouse",
    ).toLowerCase();
    const isWarehouseSource = sourceType === "warehouse";
    const destinationId = payload.destination
      ? Number(payload.destination)
      : null;
    if (!destinationId && auth.user.role !== "super_admin") {
      return NextResponse.json(
        { error: "Store destination is required for your account" },
        { status: 403 },
      );
    }
    if (destinationId) {
      const storeCheck = requireStore(auth.user, destinationId);
      if (storeCheck.error) return storeCheck.error;

      const destinationRes = await query(
        `SELECT meta
         FROM stores
         WHERE id = $1
         LIMIT 1`,
        [destinationId],
      );
      const destinationMeta = destinationRes.rows[0]?.meta || {};
      const locationType = String(destinationMeta.locationType || "")
        .trim()
        .toLowerCase();
      const method = payload.method || "new";
      const referenceType =
        payload.referenceType ||
        payload.reference_type ||
        (method === "purchase_order" ? "purchase_order" : "stock_in");

      if (
        sourceType === "vendor" &&
        method !== "purchase_order" &&
        referenceType !== "purchase_order"
      ) {
        if (locationType !== "warehouse") {
          return NextResponse.json(
            {
              error:
                "Direct stock-in to stores is not allowed. Stock must first be received at a warehouse, then transferred to the store.",
            },
            { status: 400 },
          );
        }
      } else if (
        sourceType === "warehouse" &&
        method !== "purchase_order" &&
        referenceType !== "purchase_order"
      ) {
        if (locationType === "warehouse") {
          return NextResponse.json(
            {
              error:
                "Destination must be a store when transferring/stocking in from a warehouse.",
            },
            { status: 400 },
          );
        }
      }
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const method = payload.method || "new";
      const referenceType =
        payload.referenceType ||
        payload.reference_type ||
        (method === "purchase_order" ? "purchase_order" : "stock_in");
      const referenceId =
        payload.referenceId ||
        payload.reference_id ||
        payload.purchaseOrderId ||
        payload.purchase_order_id ||
        null;
      if (
        destinationId &&
        method !== "purchase_order" &&
        !isWarehouseSource &&
        sourceType !== "vendor"
      ) {
        const previousStockIn = await client.query(
          `SELECT id
             FROM stock_in
            WHERE destination_id = $1
              AND COALESCE(status, 'draft') <> 'cancelled'
            LIMIT 1`,
          [destinationId],
        );
        if (previousStockIn.rowCount > 0) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            {
              error:
                "Only first stock in can be created without PO. Please use Purchase Order.",
            },
            { status: 400 },
          );
        }
      }
      const createdById = Number(auth.user?.id) || null;
      const insertText = `
        INSERT INTO stock_in (method, destination_id, apply_taxes, add_products_prefill, reference_type, reference_id, invoice_number, meta, created_by, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', NOW())
        RETURNING id`;
      const values = [
        method,
        destinationId,
        payload.applyTaxes ?? true,
        payload.addProductsPrefill ?? false,
        referenceType,
        referenceId,
        payload.invoiceNumber || payload.invoice_number || null,
        JSON.stringify({
          ...payload,
          sourceType,
          vendorIds: Array.isArray(payload.vendorIds) ? payload.vendorIds : [],
          vendorNames: Array.isArray(payload.vendorNames)
            ? payload.vendorNames
            : [],
          createdBy: createdById,
          createdByName: auth.user?.name || "",
          createdByEmail: auth.user?.email || "",
        }),
        createdById,
      ];
      const res = await client.query(insertText, values);
      const id = res.rows[0].id;
      const finalTransactionId = `STK-${String(id).padStart(4, "0")}`;
      const finalReferenceId = referenceId || finalTransactionId;
      await client.query(
        "UPDATE stock_in SET transaction_id = $1, reference_id = COALESCE(reference_id, $1) WHERE id = $2",
        [finalTransactionId, id],
      );
      await client.query("COMMIT");
      return NextResponse.json(
        {
          id,
          transactionId: finalTransactionId,
          referenceType,
          referenceId: finalReferenceId,
        },
        { status: 201 },
      );
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[stockin POST]", err.message);
    return NextResponse.json(
      { error: "Failed to create stock in" },
      { status: 500 },
    );
  }
}
