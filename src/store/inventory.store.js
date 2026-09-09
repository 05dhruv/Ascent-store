/**
 * Zustand Store for Inventory State Management
 * Manages stock levels, transfers, validations
 */

import { create } from 'zustand';

export const useInventoryStore = create((set, get) => ({
  // State
  stockLevels: {}, // { productId: level }
  storeInventory: [],
  selectedStore: null,
  isLoading: false,
  error: null,
  draftStockIn: null,
  draftStockOut: null,
  draftTransfer: null,

  // Actions
  setStockLevels: (stockLevels) => {
    set({ stockLevels });
  },

  updateStockLevel: (productId, level) => {
    set((state) => ({
      stockLevels: {
        ...state.stockLevels,
        [productId]: level,
      },
    }));
  },

  setStoreInventory: (inventory) => {
    set({ storeInventory: inventory });
  },

  setSelectedStore: (storeId) => {
    set({ selectedStore: storeId });
  },

  setIsLoading: (loading) => {
    set({ isLoading: loading });
  },

  setError: (error) => {
    set({ error });
  },

  // Stock In
  addStockInItem: (item) => {
    set((state) => {
      const items = state.draftStockIn?.items || [];
      return {
        draftStockIn: {
          ...state.draftStockIn,
          items: [...items, { ...item, id: Date.now() }],
        },
      };
    });
  },

  removeStockInItem: (itemId) => {
    set((state) => {
      const items = state.draftStockIn?.items || [];
      return {
        draftStockIn: {
          ...state.draftStockIn,
          items: items.filter(item => item.id !== itemId),
        },
      };
    });
  },

  clearStockIn: () => {
    set({ draftStockIn: null });
  },

  // Stock Out
  addStockOutItem: (item) => {
    set((state) => {
      const items = state.draftStockOut?.items || [];
      return {
        draftStockOut: {
          ...state.draftStockOut,
          items: [...items, { ...item, id: Date.now() }],
        },
      };
    });
  },

  removeStockOutItem: (itemId) => {
    set((state) => {
      const items = state.draftStockOut?.items || [];
      return {
        draftStockOut: {
          ...state.draftStockOut,
          items: items.filter(item => item.id !== itemId),
        },
      };
    });
  },

  clearStockOut: () => {
    set({ draftStockOut: null });
  },

  // Stock Transfer
  addTransferItem: (item) => {
    set((state) => {
      const items = state.draftTransfer?.items || [];
      return {
        draftTransfer: {
          ...state.draftTransfer,
          items: [...items, { ...item, id: Date.now() }],
        },
      };
    });
  },

  removeTransferItem: (itemId) => {
    set((state) => {
      const items = state.draftTransfer?.items || [];
      return {
        draftTransfer: {
          ...state.draftTransfer,
          items: items.filter(item => item.id !== itemId),
        },
      };
    });
  },

  clearTransfer: () => {
    set({ draftTransfer: null });
  },

  // Getters
  getStockLevel: (productId) => {
    return get().stockLevels[productId] || 0;
  },

  getStockInItemCount: () => {
    return get().draftStockIn?.items?.length || 0;
  },

  getStockOutItemCount: () => {
    return get().draftStockOut?.items?.length || 0;
  },

  getTransferItemCount: () => {
    return get().draftTransfer?.items?.length || 0;
  },
}));
