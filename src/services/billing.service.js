/**
 * Billing Service Client
 * API calls for billing operations
 */

import { apiClient } from '@/lib/api-client';

export const billingService = {
  /**
   * Create a new sales bill
   */
  async createSalesBill(billData) {
    return await apiClient.post('/billing/sales-bills', billData);
  },

  /**
   * Get bill details
   */
  async getSalesBill(billId) {
    return await apiClient.get(`/billing/sales-bills/${billId}`);
  },

  /**
   * List sales bills
   */
  async listSalesBills(filters = {}) {
    const params = new URLSearchParams();
    if (filters.storeId) params.append('storeId', filters.storeId);
    if (filters.userId) params.append('userId', filters.userId);
    if (filters.customerId) params.append('customerId', filters.customerId);
    if (filters.page) params.append('page', filters.page);
    if (filters.pageSize) params.append('pageSize', filters.pageSize);

    return await apiClient.get(`/billing/sales-bills?${params.toString()}`);
  },

  /**
   * Get daily sales summary
   */
  async getDailySummary(storeId, date) {
    return await apiClient.get(`/billing/daily-summary?storeId=${storeId}&date=${date}`);
  },

  /**
   * Get sales report
   */
  async getSalesReport(storeId, startDate, endDate, groupBy = 'daily') {
    const params = new URLSearchParams({
      storeId,
      startDate,
      endDate,
      groupBy,
    });
    return await apiClient.get(`/billing/sales-report?${params.toString()}`);
  },

  /**
   * Get top selling products
   */
  async getTopProducts(storeId, limit = 10, days = 30) {
    return await apiClient.get(`/billing/top-products?storeId=${storeId}&limit=${limit}&days=${days}`);
  },

  /**
   * Get customer purchase history
   */
  async getCustomerPurchases(customerId, limit = 50) {
    return await apiClient.get(`/billing/customer/${customerId}/purchases?limit=${limit}`);
  },
};

export default billingService;
