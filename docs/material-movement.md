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

The workflow requires `MANAGE_INVENTORY` for changes and `VIEW_INVENTORY` or `MANAGE_INVENTORY` for reads. Source actions check the assigned source; receipt checks the assigned destination. System-super-admin access follows existing policy.

### Phase 2 construction ops (shipped)

Schema: `src/lib/constructionOpsSchema.js` (`ensureConstructionOpsSchema`).

| Area | APIs | UI |
|------|------|-----|
| Evidence + approval limits | `/api/construction/evidence`, `/api/construction/approval-limits` | `/construction/evidence` |
| Quarantine release | `/api/construction/quarantine` | `/construction/quarantine` |
| Activity–stockout link | `/api/construction/activity-issue` | (API; used with material issue) |
| Transfer QR | `/api/construction/transfer-qr?transferId=` | Construction dashboard QR card |
| Contractors + BOQ variance | `/api/construction/contractors`, `/api/construction/boq-variance` | `/construction/contractors` |
| Labour / schedule | `/api/construction/labour`, `/api/construction/schedule` | `/construction/labour`, `/construction/schedule` |
| Docs / RFIs / equipment / RA | `/api/construction/documents`, `rfis`, `equipment`, `ra-bills` | matching `/construction/*` pages |

Documented approval-limit permission keys (limits table; RBAC still uses inventory/project permissions): `SITE_RECEIVER`, `DISPATCHER`, `QC_APPROVE`. Evidence accepts `file_url` (+ optional `signature_data`) normalized under `/uploads/…`.

### Enhancements (follow-up)

- Evidence: multipart file upload to `public/uploads` (+ signature data-URL save).
- Movement tracker: transfer QR display + scan-to-receive (JSON payload from QR accepted).
- Material issue (`stock_out`): work activity required; links via `/api/construction/activity-issue`.
- Approval limits enforced on transfer dispatch/receive and PO create (`assertWithinApprovalLimit`).
- Labour attendance CSV export; dedicated BOQ variance dashboard (`/construction/boq-variance`).
- Stock-in: destination picker loaded via `next/dynamic`.

## Data and verification

Additive schema initialization uses the existing application's schema-ensurer pattern. New transfer/receipt event records are append-only. New GRN and transfer batch movements marked `workflowVersion: 2` are protected from UPDATE/DELETE. Existing historical records are not reclassified. The original checkout and repository are retained; only `origin` was changed to the requested repository URL.

Run:

```text
npm run test:movement
npm run test:movement:integration
npm run build
```

The integration check uses a uniquely named PostgreSQL schema inside one transaction, sets an isolated search path, exercises actual allocation/receipt SQL, and rolls the entire schema and fixtures back. It reads the existing local database connection configuration without printing credentials. It does not initialize or migrate production inventory tables.
