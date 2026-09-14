'use client';

import Link from 'next/link';
import MainLayout from '@/components/MainLayout';

const SETTING_CARDS = [
  {
    label: 'Company profile',
    desc: 'Company name, GSTIN, logo and office contacts.',
    href: '/settings/business-info',
  },
  {
    label: 'Projects & site stores',
    desc: 'Create projects and their site stores for material receipt, issue and tracking.',
    href: '/construction/projects',
  },
  {
    label: 'Warehouses',
    desc: 'Central warehouses, address, contact and assigned employees.',
    href: '/settings/warehouses',
  },
  {
    label: 'Team & access',
    desc: 'Create employees and define their roles, permissions, site and warehouse access.',
    href: '/employee/staff',
  },
  {
    label: 'Regions & zones',
    desc: 'Group projects and sites for reporting and access mapping.',
    href: '/settings/regions',
  },
  {
    label: 'Material master fields',
    desc: 'Manage standard fields used for construction materials.',
    href: '/settings/system-attributes',
  },
  {
    label: 'Custom material fields',
    desc: 'Add company-specific fields such as grade, thickness or source.',
    href: '/settings/custom-attributes',
  },
  {
    label: 'Material movement reasons',
    desc: 'Reasons for issues, returns, damage, shortages and adjustments.',
    href: '/settings/billing/remarks',
  },
  {
    label: 'Platform settings',
    desc: 'Workflow defaults, notifications and feature controls.',
    href: '/settings/app-settings',
  },
  {
    label: 'Measurement units',
    desc: 'Construction units such as bag, MT, CUM, sqm, metre and nos.',
    href: '/settings/inventory/measurement-unit',
  },
  {
    label: 'Stock tracking fields',
    desc: 'Configure batch, serial, quality, condition and stock controls.',
    href: '/settings/inventory/system-attributes',
  },
  {
    label: 'Custom stock fields',
    desc: 'Add stock-specific validation and inspection fields.',
    href: '/settings/inventory/custom-attributes',
  },
  {
    label: 'GRN & transfer print layout',
    desc: 'Set document header, footer, copies and print sections.',
    href: '/settings/billing/customize-receipt-print',
  },
  {
    label: 'Mobile & scanner settings',
    desc: 'Device behaviour, barcode scanning, sync and offline rules.',
    href: '/settings/device-config/application-device-settings',
  },
  {
    label: 'Device assignment',
    desc: 'Map mobile or scanner devices to a warehouse or site store.',
    href: '/settings/device-config/store-device-map',
  },
  {
    label: 'Data sync controls',
    desc: 'Configure sync jobs and frequency for field devices.',
    href: '/settings/device-config/device-data-sync',
  },
  {
    label: 'Sync activity log',
    desc: 'Review device sync status, failures and field notes.',
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
        <span className="text-gray-700 font-medium">Construction Settings</span>
      </nav>

      {/* Header */}
      <div className="mb-7">
        <h1 className="text-3xl font-bold text-blue-600">Construction Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure company, sites, warehouses, materials, stock controls and field-device settings.
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
