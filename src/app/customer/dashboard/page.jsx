'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const emptyDashboard = {
  stats: {
    totalCustomers: 0,
    totalSalesLabel: '\u20b9 0.00',
    activeCustomers: 0,
    inactiveCustomers: 0,
  },
  charts: {
    newCustomers: [],
    activeCustomers: [],
  },
  topCustomers: [],
};

export default function CustomerDashboardPage() {
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        const res = await fetch('/api/customer/dashboard', {
          cache: 'no-store',
          credentials: 'include',
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json?.success) {
          throw new Error(json?.message || 'Unable to load customer dashboard');
        }

        if (!cancelled) setDashboard(json.data || emptyDashboard);
      } catch (err) {
        console.error('[CustomerDashboardPage]', err);
        if (!cancelled) {
          setError(err.message || 'Unable to load customer dashboard');
          setDashboard(emptyDashboard);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = [
    { label: 'Total Customers', value: dashboard.stats.totalCustomers },
    { label: 'Total Sales', value: dashboard.stats.totalSalesLabel },
    { label: 'Active Customers', value: dashboard.stats.activeCustomers },
    { label: 'Inactive Customers', value: dashboard.stats.inactiveCustomers },
  ];

  const maxCustomerChartValue = useMemo(() => {
    const values = [
      ...(dashboard.charts.newCustomers || []).map((row) => Number(row.value || 0)),
      ...(dashboard.charts.activeCustomers || []).map((row) => Number(row.value || 0)),
    ];
    return Math.max(1, ...values);
  }, [dashboard]);

  return (
    <MainLayout>
      <div className="min-h-screen bg-[#f5f6fa]">
        <nav className="flex items-center gap-1.5 text-[12.5px] text-gray-500 mb-4">
          <Link href="/customer" className="hover:text-blue-600 transition-colors">Customer</Link>
          <i className="ti ti-chevron-right text-[11px] text-gray-400" />
          <span className="text-blue-600 font-semibold">Customers Dashboard</span>
        </nav>

        <div className="mb-6">
          <h1 className="text-[22px] font-bold text-gray-900">Customers Dashboard</h1>
          <p className="text-[12.5px] text-gray-500 mt-1">
            Real-time customer summary from customer profiles and billed sales{' '}
            <span className="text-blue-600 cursor-pointer hover:underline font-medium">Need Help?</span>
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-[13px] text-gray-500 mb-3">{stat.label}</p>
              <p className="text-[22px] font-semibold text-gray-900">{loading ? '...' : stat.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-[13px] text-gray-600 font-medium mb-4">New Customers</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dashboard.charts.newCustomers || []}>
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, maxCustomerChartValue]}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Line type="monotone" dataKey="value" stroke="#94a3b8" strokeWidth={1.8} dot={{ fill: '#94a3b8', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-[13px] text-gray-600 font-medium mb-4">Active Customers</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dashboard.charts.activeCustomers || []}>
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, maxCustomerChartValue]}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Line type="monotone" dataKey="value" stroke="#B00000" strokeWidth={1.8} dot={{ fill: '#B00000', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-[13px] text-gray-600 font-medium">Top Customers</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">Customer</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">Phone</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">Orders</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">Sales</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-[13px] text-gray-500">Loading...</td>
                  </tr>
                ) : dashboard.topCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-[13px] text-gray-500">No customer sales found</td>
                  </tr>
                ) : (
                  dashboard.topCustomers.map((customer) => (
                    <tr key={customer.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-5 py-3 text-[13px] text-gray-800">{customer.name}</td>
                      <td className="px-5 py-3 text-[13px] text-gray-600">{customer.mobileNumber || '-'}</td>
                      <td className="px-5 py-3 text-[13px] text-gray-600">{customer.orders}</td>
                      <td className="px-5 py-3 text-[13px] text-gray-600">{customer.salesLabel}</td>
                      <td className="px-5 py-3 text-[13px] text-gray-600">{customer.status || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
