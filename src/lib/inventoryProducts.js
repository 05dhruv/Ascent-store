import { fetchAllInventoryProducts } from '@/lib/productPagination';

export async function fetchInventoryProducts({ storeId, search = '', pageSize = 500, signal } = {}) {
  const params = {};
  if (storeId !== undefined && storeId !== null && String(storeId).trim() !== '') {
    params.store_id = String(storeId);
  }

  if (search.trim()) {
    params.search = search.trim();
  }

  return fetchAllInventoryProducts({
    params,
    pageSize,
    fetchOptions: { signal },
    mapRecord: normalizeInventoryProduct,
  });
}

export function normalizeInventoryProduct(product) {
  return {
    id: product.id ?? product.product_id,
    productId: product.product_id ?? product.id,
    name: product.name || product.product || '',
    sku: product.sku || '',
    barcode: product.barcode || '',
    mrp: Number(product.mrp || 0),
    sellingPrice: Number(product.sellingPrice ?? product.selling_price ?? product.mrp ?? 0),
    costPrice: Number(product.costPrice ?? product.cost_price ?? 0),
    categoryName: product.categoryName || product.category_name || 'N/A',
    brandName: product.brandName || product.brand_name || '',
    availableStock: Number(product.availableStock ?? product.available_stock ?? 0),
    taxRate: Number(product.taxRate ?? product.tax_rate ?? 0),
  };
}
