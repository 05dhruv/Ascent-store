'use client';

import CatalogDataPage from '@/components/CatalogDataPage';

const columns = [
  { key: 'sno',      label: 'S. No.',         sortable: true },
  { key: 'name',     label: 'Income Head',    sortable: true },
  { key: 'type',     label: 'Type',           sortable: true },
  { key: 'sequence', label: 'Sort Sequence',  sortable: true },
];

export default function IncomeHeadPage() {
  return (
    <CatalogDataPage
      endpoint="/api/catalog/income-heads"
      breadcrumbs={[
        { label: 'Catalog', href: '/catalog' },
        { label: 'Product Classification', href: '/catalog/category' },
        { label: 'Income Head' },
      ]}
      title="Income Head"
      description="Define income heads for your billing and accounting."
      columns={columns}
      createLabel="Create Income Head"
      onCreateClick={() => window.location.href = '/catalog/income-head/create'}
      showRowActions={true}
      onEdit={(row) => window.location.href = `/catalog/income-head/${row.id}/edit`}
      totalLabel="Income Head(s)"
      emptyMessage="No income heads found"
      mapRecord={(record, index, page, pageSize) => ({
        id: record.id,
        sno: (page - 1) * pageSize + index + 1,
        name: record.name,
        type: record.code || '—',
        sequence: index + 1,
      })}
    />
  );
}