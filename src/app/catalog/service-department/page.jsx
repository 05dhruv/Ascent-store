'use client';

import CatalogDataPage from '@/components/CatalogDataPage';

const columns = [
  { key: 'sno',      label: 'S. No.',                sortable: true },
  { key: 'name',     label: 'Service Department',    sortable: true },
  { key: 'group',    label: 'Service Group',         sortable: true },
  { key: 'sequence', label: 'Sort Sequence',         sortable: true },
];

export default function ServiceDepartmentPage() {
  return (
    <CatalogDataPage
      endpoint="/api/catalog/service-departments"
      breadcrumbs={[
        { label: 'Catalog', href: '/catalog' },
        { label: 'Product Classification', href: '/catalog/category' },
        { label: 'Service Department' },
      ]}
      title="Service Department"
      description="Manage service departments under your service groups."
      columns={columns}
      createLabel="Create Department"
      onCreateClick={() => window.location.href = '/catalog/department/create'}
      totalLabel="Service Department(s)"
      emptyMessage="No service departments found"
      mapRecord={(record, index, page, pageSize) => ({
        id: record.id,
        sno: (page - 1) * pageSize + index + 1,
        name: record.name,
        group: record.service_group_name || '—',
        sequence: record.sort_sequence,
      })}
    />
  );
}