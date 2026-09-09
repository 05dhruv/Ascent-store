'use client';

import CatalogDataPage from '@/components/CatalogDataPage';

const columns = [
  { key: 'sno', label: 'S. No.', sortable: true },
  { key: 'name', label: 'Brand Name', sortable: true },
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
        { label: 'Catalog', href: '/catalog' },
        { label: 'Product Classification', href: '/catalog/category' },
        { label: 'Brand' },
      ]}
      title="Brand"
      description="Manage all brands associated with your products."
      columns={columns}
      createLabel="Create Brand"
      onCreateClick={() => window.location.href = '/catalog/brand/create'}
      showRowActions={true}
      onEdit={(row) => window.location.href = `/catalog/brand/${row.id}/edit`}
      onDelete={(row) => {}}
      totalLabel="Brand(s)"
      emptyMessage="No brands found"
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
