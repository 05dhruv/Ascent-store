/**
 * Next.js instrumentation — warm DB schemas once per server process.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  try {
    const { warmSchemas, registerBootSchemas } = await import("./src/lib/schemaGuard.js");
    const { ensureInventoryBatchSchema } = await import("./src/lib/inventoryBatching.js");
    const { ensureStoresSchema } = await import("./src/lib/storesSchema.js");
    const { ensureStockRequisitionSchema } = await import(
      "./src/lib/stockRequisitionSchema.js"
    );
    const { ensureConstructionSchema } = await import("./src/lib/constructionSchema.js");
    const { ensureConstructionOpsSchema } = await import(
      "./src/lib/constructionOpsSchema.js"
    );
    const { ensureVendorsSchema } = await import("./src/lib/vendorsSchema.js");
    const { ensurePurchaseOrderSchema } = await import("./src/lib/purchaseOrderSchema.js");
    const { ensureStockInSchema } = await import("./src/lib/stockInSchema.js");
    const { ensureCustomersSchema } = await import("./src/lib/customersSchema.js");
    const { ensureSalesBillingSchema } = await import("./src/lib/salesBillingSchema.js");
    const { ensureVendorInvoicesSchema } = await import("./src/lib/vendorInvoicesSchema.js");

    registerBootSchemas([
      ensureStoresSchema,
      ensureInventoryBatchSchema,
      ensureStockRequisitionSchema,
      ensureConstructionSchema,
      ensureConstructionOpsSchema,
      ensureVendorsSchema,
      ensurePurchaseOrderSchema,
      ensureStockInSchema,
      ensureCustomersSchema,
      ensureSalesBillingSchema,
      ensureVendorInvoicesSchema,
    ]);

    await warmSchemas();
    console.info("[instrumentation] schema warm complete");
  } catch (err) {
    console.error("[instrumentation] schema warm failed:", err?.message || err);
  }
}
