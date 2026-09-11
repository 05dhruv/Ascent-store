'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import { useUser } from '@/hooks/useUser';
import { fetchAuthEndpoint } from '@/lib/auth-endpoints';

const Icons = {
  rupee: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 3h12M6 8h12M6 13l6 8M6 8a4 4 0 0 0 0 8h2l6 5" /></svg>,
  receipt: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /></svg>,
  users: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="9" cy="7" r="4" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><path strokeLinecap="round" strokeLinejoin="round" d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.87" /></svg>,
  chartPie: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1 0 20.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0 1 20.488 9z" /></svg>,
  pos: <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><rect x="2" y="5" width="20" height="14" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M2 10h20" /></svg>,
  dashboard: <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>,
  returns: <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a4 4 0 0 1 4 4v1M3 10l4-4M3 10l4 4" /></svg>,
  cart: <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.4 7h12.8M10 21a1 1 0 1 0 2 0 1 1 0 0 0-2 0zm7 0a1 1 0 1 0 2 0 1 1 0 0 0-2 0z" /></svg>,
};

const quickActions = [
  { label: 'Open POS', desc: 'Fast checkout', icon: Icons.pos, path: '/sales/pos', bg: 'linear-gradient(135deg, #B00000, #B00000)' },
  { label: 'Master Dashboard', desc: 'View analytics', icon: Icons.dashboard, path: '/home/master-dashboard', bg: 'linear-gradient(135deg, #539D62, #477f53)' },
  { label: 'Returns', desc: 'Manage returns', icon: Icons.returns, path: '/sales/returns', bg: 'linear-gradient(135deg, #f59e0b, #b45309)' },
  { label: 'Full POS', desc: 'Advanced billing', icon: Icons.cart, path: '/sales/pos', bg: 'linear-gradient(135deg, #dc2626, #920000)' },
];

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function getMonthRange() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    date_from: firstDay.toISOString().split('T')[0],
    date_to: today.toISOString().split('T')[0],
  };
}

export default function RootPage() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    products: 0,
    customers: 0,
    lowStock: 0,
    firstSale: null,
    store: null,
    sales: {
      totalSales: 0,
      todaySales: 0,
      totalRevenue: 0,
      todayRevenue: 0,
      weekRevenue: 0,
      avgOrderValue: 0,
      recentOrders: [],
      topProducts: [],
      dailyData: [],
      totalTax: 0,
    },
  });

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams(getMonthRange());
        const res = await fetchAuthEndpoint(`/api/dashboard/stats?${params.toString()}`);
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Dashboard API returned a non-JSON response');
        }
        const json = await res.json();

        if (!cancelled && res.ok && json?.success) {
          setStats(json.data);
        } else if (!cancelled) {
          setError('Dashboard data could not be loaded');
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        if (!cancelled) setError('Dashboard data could not be loaded');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const kpiData = [
    { label: 'Total Revenue', value: formatCurrency(stats.sales.totalRevenue), icon: Icons.rupee, iconBg: '#fff7ed', iconColor: '#ea580c' },
    { label: 'Transactions', value: String(stats.sales.totalSales), icon: Icons.receipt, iconBg: '#eff6ff', iconColor: '#B00000' },
    { label: 'Customers', value: String(stats.customers), icon: Icons.users, iconBg: '#f0fdf4', iconColor: '#539D62' },
    { label: 'Tax Collected', value: formatCurrency(stats.sales.totalTax), icon: Icons.chartPie, iconBg: '#faf5ff', iconColor: '#B00000' },
  ];

  return (
    <MainLayout>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#111827', letterSpacing: '-0.02em', margin: 0 }}>Welcome to Buyzaar Sync</h1>
        <p style={{ color: '#4b5563', fontSize: '0.95rem', fontWeight: 500, marginTop: '0.5rem' }}>
          Dashboard Summary for Current Month{user?.name ? ` · ${user.name}` : ''}
        </p>
        {error && (
          <p style={{ color: '#b45309', fontSize: '0.85rem', fontWeight: 600, marginTop: '0.5rem' }}>
            {error}
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        {kpiData.map((item) => (
          <div key={item.label} style={{ background: '#fff', borderRadius: '0.75rem', border: '1px solid #e5e7eb', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{item.label}</p>
              <div style={{ width: '3rem', height: '3rem', borderRadius: '0.5rem', background: item.iconBg, color: item.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.icon}
              </div>
            </div>
            <p style={{ fontSize: '1.75rem', fontWeight: 900, color: '#111827', margin: 0 }}>{loading ? '—' : item.value}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#111827', marginBottom: '1.25rem' }}>Quick Actions</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
        {quickActions.map((action) => (
          <Link
            key={action.label}
            href={action.path}
            style={{
              display: 'block',
              textDecoration: 'none',
              background: action.bg,
              border: 'none',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              cursor: 'pointer',
              textAlign: 'left',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
          >
            <div style={{ marginBottom: '0.75rem' }}>{action.icon}</div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', margin: '0 0 0.25rem 0' }}>{action.label}</h3>
            <p style={{ fontSize: '0.85rem', fontWeight: 500, color: 'rgba(255,255,255,0.88)', margin: 0 }}>{action.desc}</p>
          </Link>
        ))}
      </div>
    </MainLayout>
  );
}
