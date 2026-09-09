'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import { formatIndianDateTime } from '@/lib/dateUtils';

const money = (value) =>
  Number(value || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

function firstValue(record, keys, fallback = '-') {
  for (const key of keys) {
    if (record?.[key] !== null && record?.[key] !== undefined && record[key] !== '') return record[key];
  }
  return fallback;
}

export default function InvoiceSalesOrderDetailPage({ params }) {
  const { id } = use(params);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/sales-order/invoice-sales-order/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Failed to load invoice details');
        if (active) setData(json);
      })
      .catch((err) => active && setError(err.message));
    return () => { active = false; };
  }, [id]);

  const record = data?.record;
  const items = data?.items || [];
  const payments = data?.payments || [];
  const subtotal = firstValue(record, ['subtotal', 'gross_bill'], 0);
  const discount = firstValue(record, ['discount_total', 'total_discount'], 0);
  const total = firstValue(record, ['grand_total'], Number(subtotal || 0) - Number(discount || 0));

  return (
    <MainLayout>
      <div className="min-h-screen bg-[#f5f6fa] p-6 text-sm text-gray-800">
        <div className="mx-auto max-w-5xl">
          <Link href="/sales-order/invoice-sales-order" className="text-xs font-medium text-blue-600 hover:underline">
            Back to Invoice Sales Orders
          </Link>

          {error ? (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">{error}</div>
          ) : !record ? (
            <div className="mt-5 rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">Loading invoice...</div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Invoice Sales Order</p>
                  <h1 className="mt-1 text-2xl font-bold text-gray-900">
                    {firstValue(record, ['bill_number', 'invoice_id', 'sales_order_id'], id)}
                  </h1>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatIndianDateTime(firstValue(record, ['created_at', 'invoice_date', 'booking_date'], ''), '-')}
                  </p>
                </div>
                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                  {firstValue(record, ['status'], 'Invoiced')}
                </span>
              </div>

              <div className="grid gap-4 border-b border-gray-100 p-6 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="Customer" value={firstValue(record, ['customer_name'], 'Walk-in Customer')} />
                <Detail label="Store" value={firstValue(record, ['store_name'])} />
                <Detail label="Billing User" value={firstValue(record, ['billing_username', 'created_by'])} />
                <Detail label="Payment Mode" value={firstValue(record, ['payment_mode', 'channel'])} />
              </div>

              <div className="p-6">
                <h2 className="mb-3 font-semibold text-gray-900">Items</h2>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-left text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Product</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right">Rate</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.length ? items.map((item, index) => {
                        const qty = Number(firstValue(item, ['qty', 'quantity'], 0));
                        const rate = Number(firstValue(item, ['selling_price', 'price', 'rate'], 0));
                        return (
                          <tr key={item.id || index}>
                            <td className="px-4 py-3 font-medium text-gray-800">{firstValue(item, ['product_name', 'name', 'product'])}</td>
                            <td className="px-4 py-3 text-gray-500">{firstValue(item, ['sku'])}</td>
                            <td className="px-4 py-3 text-right">{qty}</td>
                            <td className="px-4 py-3 text-right">{money(rate)}</td>
                            <td className="px-4 py-3 text-right font-semibold">{money(firstValue(item, ['line_total', 'amount', 'total'], qty * rate))}</td>
                          </tr>
                        );
                      }) : (
                        <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">No line-item details available</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 flex justify-end">
                  <div className="w-full max-w-xs space-y-2 text-sm">
                    <Total label="Subtotal" value={money(subtotal)} />
                    <Total label="Discount" value={money(discount)} />
                    <Total label="Grand Total" value={money(total)} strong />
                    {payments.length > 0 && <Total label="Payments" value={payments.map((payment) => payment.method).join(', ')} />}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

function Detail({ label, value }) {
  return <div><p className="text-xs text-gray-400">{label}</p><p className="mt-1 font-semibold text-gray-800">{value}</p></div>;
}

function Total({ label, value, strong = false }) {
  return <div className={`flex justify-between border-t border-gray-100 pt-2 ${strong ? 'text-base font-bold text-gray-900' : ''}`}><span>{label}</span><span>{value}</span></div>;
}
