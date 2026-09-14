'use client';

import CatalogDataPage from '@/components/CatalogDataPage';

const columns = [
  { key: 'sno',  label: 'S. No.',    sortable: true },
  { key: 'name', label: 'Tax Name',  sortable: true },
  { key: 'rate', label: 'Tax Rate',  sortable: true },
  { key: 'type', label: 'Tax Type',  sortable: true },
  { key: 'hsn',  label: 'HSN Code',  sortable: true },
];

export default function TaxesPage() {
  return (
    <CatalogDataPage
      endpoint="/api/catalog/taxes"
      breadcrumbs={[
        { label: 'Materials', href: '/catalog/products' },
        { label: 'Taxes & Charges', href: '/catalog/taxes' },
        { label: 'Taxes' },
      ]}
      title="Taxes"
      description="Manage GST and other tax slabs used for construction material procurement."
      columns={columns}
      totalLabel="Tax(es)"
      emptyMessage="No taxes found"
      createLabel="Create Tax"
      onCreateClick={() => { window.location.href = '/catalog/taxes/create'; }}
      mapRecord={(record, index, page, pageSize) => ({
        id: record.id,
        sno: (page - 1) * pageSize + index + 1,
        name: record.name,
        rate: `${record.rate}%`,
        type: record.tax_type,
        hsn: record.hsn_code || '-',
      })}
    />
  );
}
