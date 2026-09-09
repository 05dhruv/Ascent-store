'use client';

import CatalogDataPage from '@/components/CatalogDataPage';
const pgColumns = [
  { key: 'sno',      label: 'S. No.',         sortable: true },
  { key: 'name',     label: 'Group Name',     sortable: true },
  { key: 'category', label: 'Category',       sortable: true },
  { key: 'count',    label: 'Products Count', sortable: true },
];

export default function ProductGroupsPage() {
  return (
    <CatalogDataPage
      endpoint="/api/catalog/product-groups"
      bulkImportType="product-groups"
      breadcrumbs={[
        { label: 'Catalog', href: '/catalog' },
        { label: 'Product', href: '/catalog/products' },
        { label: 'Product Groups' },
      ]}
      title="Product Groups"
      description="Group similar products together for easier management."
      columns={pgColumns}
      totalLabel="Product Group(s)"
      emptyMessage="No product groups found"
      mapRecord={(record, index, page, pageSize) => ({
        id: record.id,
        sno: (page - 1) * pageSize + index + 1,
        name: record.name,
        category: record.category_name || '—',
        count: record.description ? String(record.description).length : 0,
      })}
    />
  );
}