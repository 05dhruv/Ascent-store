'use client';

import Link from 'next/link';
import MainLayout from '@/components/MainLayout';

const SETTING_CARDS = [
  {
    label: 'Business info',
    desc: 'Legal name, GSTIN, logo, contact.',
    href: '/settings/business-info',
  },
  {
    label: 'Stores',
    desc: 'Branches, addresses, GST registration per store.',
    href: '/settings/stores',
  },
  {
    label: 'Warehouses',
    desc: 'Central warehouses and storage rules.',
    href: '/settings/warehouses',
  },
  {
    label: 'Receipts (print)',
    desc: 'Print templates and layout.',
    href: '/settings/receipts-print',
  },
  {
    label: 'KOT printers',
    desc: 'Kitchen printer routing and format.',
    href: '/settings/kot-printers',
  },
  {
    label: 'System attributes',
    desc: 'Built-in fields on products and orders.',
    href: '/settings/system-attributes',
  },
  {
    label: 'Custom attributes',
    desc: 'Your own fields on products and orders.',
    href: '/settings/custom-attributes',
  },
  {
    label: 'Regions',
    desc: 'Geography groupings for reporting.',
    href: '/settings/regions',
  },
  {
    label: 'Rooms & tables',
    desc: 'Dine-in floor plan and table assignments.',
    href: '/settings/rooms-tables',
  },
  {
    label: 'Remarks',
    desc: 'Void and refund reason list.',
    href: '/settings/billing/remarks',
  },
  {
    label: 'Sales targets',
    desc: 'Monthly goals per store and per staff.',
    href: '/settings/sales-targets',
  },
  {
    label: 'App settings',
    desc: 'POS app behaviour and feature toggles.',
    href: '/settings/app-settings',
  },
  {
    label: 'Store payment modes',
    desc: 'Per-store payment-mode mapping.',
    href: '/settings/store-payment-modes',
  },
  {
    label: 'Chain payment settings',
    desc: 'Chain-wide payment providers and settlement defaults.',
    href: '/settings/payment/chain-payment-settings',
  },
  {
    label: 'Store payment settings',
    desc: 'Store-specific merchant IDs, terminals, and toggles.',
    href: '/settings/payment/store-payment-settings',
  },
  {
    label: 'Refund configuration',
    desc: 'Refund limits, modes, and approval rules.',
    href: '/settings/credit-note/refund-configuration',
  },
  {
    label: 'Redemption configuration',
    desc: 'Credit note and voucher redemption rules.',
    href: '/settings/credit-note/redemption-configuration',
  },
  {
    label: 'Measurement units',
    desc: 'Inventory units, symbols, and decimal precision.',
    href: '/settings/inventory/measurement-unit',
  },
  {
    label: 'Inventory system attributes',
    desc: 'Built-in inventory tracking attributes.',
    href: '/settings/inventory/system-attributes',
  },
  {
    label: 'Inventory custom attributes',
    desc: 'Custom stock fields and validation rules.',
    href: '/settings/inventory/custom-attributes',
  },
  {
    label: 'KOT printer config',
    desc: 'Store-wise kitchen print routing.',
    href: '/settings/billing/kot-printer-config',
  },
  {
    label: 'Receipt customization',
    desc: 'Receipt header, footer, copies, and sections.',
    href: '/settings/billing/customize-receipt-print',
  },
  {
    label: 'Chain attributes',
    desc: 'Global billing and workflow attributes.',
    href: '/settings/billing/chain-attributes',
  },
  {
    label: 'Application device settings',
    desc: 'Device behavior, sync, and offline rules.',
    href: '/settings/device-config/application-device-settings',
  },
  {
    label: 'Store device map',
    desc: 'Map devices to stores and counters.',
    href: '/settings/device-config/store-device-map',
  },
  {
    label: 'Device data sync',
    desc: 'Sync jobs and frequency preferences.',
    href: '/settings/device-config/device-data-sync',
  },
  {
    label: 'Device sync logs',
    desc: 'Device sync status records and notes.',
    href: '/settings/device-config/device-sync-logs',
  },
];

export default function SettingsPage() {
  return (
    <MainLayout>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-5">
        <span className="text-blue-500 cursor-pointer hover:underline">Home</span>
        <span>›</span>
        <span className="text-gray-700 font-medium">Settings</span>
      </nav>

      {/* Header */}
      <div className="mb-7">
        <h1 className="text-3xl font-bold text-blue-600">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Business info, stores, taxes, receipts, integrations and billing.
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {SETTING_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-5 hover:shadow-md hover:border-gray-300 transition-all group"
          >
            <div>
              <p className="text-[14px] font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                {card.label}
              </p>
              <p className="text-[12px] text-gray-400 mt-0.5 leading-snug">{card.desc}</p>
            </div>
            <i className="ti ti-chevron-right text-gray-300 text-[18px] group-hover:text-blue-400 transition-colors flex-shrink-0 ml-3" />
          </Link>
        ))}
      </div>
    </MainLayout>
  );
}
