"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { formatIndianDate } from '@/lib/dateUtils';
import Icon from "@/components/Icon";
import Pagination from '@/components/ui/Pagination';
import { downloadFromUrl, usePagedList } from '@/hooks/usePagedList';

function formatDate(value) {
  return formatIndianDate(value, '—');
}

function formatCost(value) {
  const n = Number(value || 0);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function mapRecordsToTable(records) {
  return (records || []).map((row) => ({
    'Transaction ID': row.transactionId ? `#${row.transactionId}` : `#GRN-${row.id}`,
    'Invoice Number': row.invoiceNumber || '—',
    'Destination': row.destination || '—',
    'Invoice Date': formatDate(row.invoiceDate),
    'Total Item Number': row.totalItems ?? 0,
    'Cost': formatCost(row.cost),
    'Reference Transaction Type': row.referenceType || '—',
    'Reference ID': row.referenceId || '—',
  }));
}

export default function GrnListPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const listParams = useMemo(() => ({ search: debouncedSearch }), [debouncedSearch]);
  const list = usePagedList('/api/purchase/grns', { params: listParams });
  const loadingList = list.loading;
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const isSuperAdmin = currentUser?.role === 'super_admin';

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => setCurrentUser(json.data?.user || json.user || null))
      .catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleCreate = () => router.push('/purchase/grn/create');

  const tableHeaders = [
    'Transaction ID',
    'Invoice Number',
    'Destination',
    'Invoice Date',
    'Total Item Number',
    'Cost',
    'Reference Transaction Type',
    'Reference ID',
    'Actions',
  ];
  const tableData = useMemo(() => mapRecordsToTable(list.records), [list.records]);

  const handleDownloadSheet = () => downloadFromUrl(list.exportUrl());

  return (
    <MainLayout>
      <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-4">
        <span className="text-blue-600">Purchase</span>
        <Icon name="ti-chevron-right" className="text-[11px] text-gray-400" />
        <span className="font-semibold text-gray-900">GRN</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 leading-tight">Purchase GRN</h1>
          <p className="text-[12.5px] text-gray-400 mt-1">Goods Received Notes linked to Purchase Orders.</p>
        </div>

        {(() => {
          const userPermissions = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
          const canManageGrn = isSuperAdmin || userPermissions.includes('*') || userPermissions.includes('MANAGE_PURCHASE_ORDERS');
          return (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={handleDownloadSheet} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <Icon name="ti-download" className="text-[16px]" />
                Download Sheet
              </button>
              {canManageGrn && (
                <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700 transition-colors">
                  <Icon name="ti-plus" className="text-[16px]" />
                  Create GRN
                </button>
              )}
            </div>
          );
        })()}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 flex-1 min-w-[260px] max-w-[340px] bg-gray-50 rounded-lg px-3 py-2">
            <Icon name="ti-search" className="text-gray-400 text-[16px]" />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="flex-1 bg-transparent text-[13px] text-gray-700 outline-none placeholder:text-gray-400"
            />
          </div>
        </div>
        {list.error && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-[12px] text-red-700">{list.error}</div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="border-b border-gray-100">
                {tableHeaders.map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 tracking-wide uppercase">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr>
                  <td colSpan={tableHeaders.length} className="px-4 py-14 text-center text-[14px] text-gray-500">
                    Loading records...
                  </td>
                </tr>
              ) : tableData.length > 0 ? (
                tableData.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors">
                    {tableHeaders.map((header, colIdx) => {
                      if (header === 'Actions') {
                        const userPermissions = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
                        const canManageGrn = isSuperAdmin || userPermissions.includes('*') || userPermissions.includes('MANAGE_PURCHASE_ORDERS');
                        return (
                          <td key={colIdx} className="px-4 py-3 text-[13px] text-gray-700">
                            {canManageGrn && (
                              <div className="flex gap-2">
                                <button onClick={() => router.push(`/purchase/grn/${encodeURIComponent(row['Reference ID'] || row['Transaction ID'] || '')}/edit`)} className="p-1.5 rounded border border-gray-200 hover:bg-gray-50" title="Edit GRN">
                                  <Icon name="ti-edit" className="text-[15px]" />
                                </button>
                              </div>
                            )}
                          </td>
                        );
                      }
                      return <td key={colIdx} className="px-4 py-3 text-[13px] text-gray-700">{row[header] || '-'}</td>;
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={tableHeaders.length} className="px-4 py-14 text-center text-[14px] text-blue-700 font-medium">No Records Found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination {...list.pagination} />
      </div>
    </MainLayout>
  );
}
