'use client';

import CatalogDataPage from '@/components/CatalogDataPage';

const columns = [
  { key: 'sno', label: 'S. No.', sortable: true },
  { key: 'name', label: 'Make / Brand', sortable: true },
  { key: 'manufacturer', label: 'Manufacturer', sortable: true },
  { key: 'category', label: 'Category', sortable: true },
  { key: 'margin', label: 'Margin (%)', sortable: true },
  { key: 'sequence', label: 'Sort Sequence', sortable: true },
];

export default function BrandPage() {
  return (
    <CatalogDataPage
      endpoint="/api/catalog/brands"
      breadcrumbs={[
          { label: 'Materials', href: '/catalog/products' },
          { label: 'Material Classification', href: '/catalog/category' },
          { label: 'Makes / Brands' },
      ]}
        title="Makes / Brands"
        description="Manage approved makes and brands for construction materials."
      columns={columns}
      createLabel="Create Brand"
      onCreateClick={() => window.location.href = '/catalog/brand/create'}
      showRowActions={true}
      onEdit={(row) => window.location.href = `/catalog/brand/${row.id}/edit`}
      onDelete={(row) => {}}
        totalLabel="Make / Brand(s)"
        emptyMessage="No makes or brands found"
      mapRecord={(record, index, page, pageSize) => ({
        id: record.id,
        sno: (page - 1) * pageSize + index + 1,
        name: record.name,
        manufacturer: record.manufacturer_name || '-',
        category: record.category_name || '-',
        margin: record.margin ?? 0,
        sequence: index + 1,
      })}
    />
  );
}
