/**
 * Inventory Service Client
 * API calls for inventory operations
 */

import { apiClient } from '@/lib/api-client';

export const inventoryService = {
  /**
   * Perform stock in (goods receipt)
   */
  async performStockIn(stockInData) {
    return await apiClient.post('/inventory/stock-in', stockInData);
  },

  /**
   * Confirm stock in
   */
  async confirmStockIn(stockInId) {
    return await apiClient.post(`/inventory/stock-in/${stockInId}/confirm`);
  },

  /**
   * Perform stock out
   */
  async performStockOut(stockOutData) {
    return await apiClient.post('/inventory/stock-out', stockOutData);
  },

  /**
   * Confirm stock out
   */
  async confirmStockOut(stockOutId) {
    return await apiClient.post(`/inventory/stock-out/${stockOutId}/confirm`);
  },

  /**
   * Perform stock transfer
   */
  async performStockTransfer(transferData) {
    return await apiClient.post('/inventory/stock-transfer', transferData);
  },

  /**
   * Get current stock level
   */
  async getStockLevel(productId, storeId) {
    return await apiClient.get(`/inventory/stock-level?productId=${productId}&storeId=${storeId}`);
  },

  /**
   * Get all inventory for store
   */
  async getStoreInventory(storeId) {
    return await apiClient.get(`/inventory/store/${storeId}`);
  },

  /**
   * Get inventory valuation
   */
  async getInventoryValuation(storeId) {
    return await apiClient.get(`/inventory/valuation/${storeId}`);
  },

  /**
   * Get low stock alerts
   */
  async getLowStockAlerts(storeId, threshold = 10) {
    return await apiClient.get(`/inventory/low-stock/${storeId}?threshold=${threshold}`);
  },

  /**
   * Get stock movements for product
   */
  async getStockMovements(productId, storeId) {
    return await apiClient.get(`/inventory/movements?productId=${productId}&storeId=${storeId}`);
  },

  /**
   * List all products
   */
  async listProducts(filters = {}) {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.categoryId) params.append('categoryId', filters.categoryId);
    if (filters.page) params.append('page', filters.page);
    if (filters.pageSize) params.append('pageSize', filters.pageSize);

    return await apiClient.get(`/inventory/products?${params.toString()}`);
  },

  /**
   * Get product details
   */
  async getProduct(productId) {
    return await apiClient.get(`/inventory/products/${productId}`);
  },

  /**
   * Create product
   */
  async createProduct(productData) {
    return await apiClient.post('/inventory/products', productData);
  },
};

export default inventoryService;
