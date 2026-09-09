 'use client';

import { useRouter } from 'next/navigation';
import CatalogDataPage from '@/components/CatalogDataPage';

const columns = [
  { key: 'sno',      label: 'S. No.',         sortable: true },
  { key: 'name',     label: 'Service Name',   sortable: true },
  { key: 'group',    label: 'Service Group',  sortable: true },
  { key: 'price',    label: 'Price',          sortable: true },
  { key: 'duration', label: 'Duration',       sortable: true },
];

export default function ServicesPage() {
  const router = useRouter();
  return (
    <CatalogDataPage
      endpoint="/api/catalog/services"
      breadcrumbs={[
        { label: 'Catalog', href: '/catalog' },
        { label: 'Product', href: '/catalog/products' },
        { label: 'Services' },
      ]}
      title="Services"
      description="Manage all services offered at your store."
      columns={columns}
      totalLabel="Service(s)"
      emptyMessage="No services found"
      createLabel="Create Service"
      onCreateClick={() => router.push('/catalog/services/create')}
      mapRecord={(record, index, page, pageSize) => ({
        id: record.id,
        sno: (page - 1) * pageSize + index + 1,
        name: record.name,
        group: record.service_group_name || '—',
        price: `₹${record.price}`,
        duration: record.duration_minutes ? `${record.duration_minutes} min` : '—',
      })}
    />
  );
}