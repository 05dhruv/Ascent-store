# Material movement workflow

Open **Inventory → Material Movement / Receipts** (`/inventory/movement-tracker`).

## Transfer

1. Create a transfer using the item-entry screen. **Submit Transfer** saves the request without moving stock.
2. The warehouse user enters dispatch quantities, vehicle, challan, expected arrival and proof, then selects **Approve & dispatch to site**. The system reserves stock, records the packing event and dispatches in one controlled action. Destination stock remains unchanged until the site confirms receipt.
3. The assigned site user confirms received and accepted quantities. Damaged, rejected, short and excess quantities are entered only when there is an issue. Accepted quantity becomes usable site stock; issue quantities open a case for follow-up.

Excess requires a source approval event before receipt. Enter per-line excess on the tracker, add explanation and approve it. The receiver selects the available approval from the receipt screen; each approval is single-use. Resolution records the investigation/claim; it does not automatically make damaged goods usable.

Receipt retries use request identifiers. Reusing an identifier with changed data is rejected. Submitted, dispatched and received documents cannot be edited through the old transfer edit endpoint. An undispatched request can be cancelled; a physical return uses a separate transfer.

## Stock In / GRN

In the existing Stock In line-item screen, enter physical batch quantities and complete **Receipt inspection**. Enter damaged/rejected quantities per batch, checked-by, proof reference and the inspection acknowledgement. Only the calculated accepted quantity becomes usable. Internal store receipts from warehouse must use Stock Transfer.

Posted GRNs cannot be edited or deleted. Use controlled adjustments/vendor returns linked to the original record. Old and new Stock In list requests are read-only. Existing hold records without inspection data need to be opened and completed before explicit confirmation.

## Reports

The movement tracker provides transfer quantities/status/ETA/cases, current location stock by condition/reservation, and movement ledger with actor and reference. Filter by location, project, date and material/document search; export displayed rows to CSV. Reports explicitly flag the 500-row limit; narrow filters for complete exports. Stock buckets are current balances and are independent of the date filter. The stock screen separates usable, reserved, quarantine, damaged, rejected, expired and inactive material. Usable stock excludes every other bucket.

Historical transfers are labelled historical. No receipt quantities or dispatch evidence are fabricated for previously confirmed instant transfers. The ledger's recorded running balance follows retained historical entries; reconcile legacy corrections/openings before treating it as a certified opening balance.

## Permissions and evidence

The workflow requires `MANAGE_INVENTORY` for changes and `VIEW_INVENTORY` or `MANAGE_INVENTORY` for reads. Source actions check the assigned source; receipt checks the assigned destination. System-super-admin access follows existing policy. Finer job-specific picker/approver/QC permissions and monetary approval limits are not introduced in this release.

Evidence fields currently accept document links/references. They are not a file-upload/signature capture system. QR receipt, GPS/automated ETA notifications, controlled quarantine release, and a dedicated work-activity Material Issue/Return module remain follow-up work. The current feature is material receipt, transfer and movement reporting, not full construction ERP/SOP certification.

## Data and verification

Additive schema initialization uses the existing application's schema-ensurer pattern. New transfer/receipt event records are append-only. New GRN and transfer batch movements marked `workflowVersion: 2` are protected from UPDATE/DELETE. Existing historical records are not reclassified. The original checkout and repository are retained; only `origin` was changed to the requested repository URL.

Run:

```text
npm run test:movement
npm run test:movement:integration
npm run build
```

The integration check uses a uniquely named PostgreSQL schema inside one transaction, sets an isolated search path, exercises actual allocation/receipt SQL, and rolls the entire schema and fixtures back. It reads the existing local database connection configuration without printing credentials. It does not initialize or migrate production inventory tables.
