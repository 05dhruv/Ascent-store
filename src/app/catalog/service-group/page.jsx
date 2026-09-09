'use client';

import CatalogDataPage from '@/components/CatalogDataPage';

const columns = [
  { key: 'sno',      label: 'S. No.',          sortable: true },
  { key: 'name',     label: 'Service Group',   sortable: true },
  { key: 'code',     label: 'Code',            sortable: true },
  { key: 'sequence', label: 'Sort Sequence',   sortable: true },
];

export default function ServiceGroupPage() {
  return (
    <CatalogDataPage
      endpoint="/api/catalog/service-groups"
      breadcrumbs={[
        { label: 'Catalog', href: '/catalog' },
        { label: 'Product Classification', href: '/catalog/category' },
        { label: 'Service Group' },
      ]}
      title="Service Group"
      description="Group your services for better catalog management."
      columns={columns}
      createLabel="Create Service Group"
      onCreateClick={() => window.location.href = '/catalog/service-group/create'}
      showRowActions={true}
      onEdit={(row) => window.location.href = `/catalog/service-group/${row.id}/edit`}
      onDelete={(row) => {/* delete handled by CatalogDataPage */}}
      totalLabel="Service Group(s)"
      emptyMessage="No service groups found"
      mapRecord={(record, index, page, pageSize) => ({
        id: record.id,
        sno: (page - 1) * pageSize + index + 1,
        name: record.name,
        code: record.code || '—',
        sequence: record.sort_sequence,
      })}
    />
  );
}