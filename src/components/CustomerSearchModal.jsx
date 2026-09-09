'use client';

import { useEffect, useMemo, useState } from 'react';

export default function CustomerSearchModal({ open, onClose, onSelect }) {
  const [customers, setCustomers] = useState([]);
  const [searchBy, setSearchBy] = useState('Phone');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fetchCustomers = async (query = '', queryBy = searchBy) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (query.trim()) {
          qs.set('search', query.trim());
          qs.set('searchBy', queryBy);
        }
        const res = await fetch(`/api/customers${qs.toString() ? `?${qs.toString()}` : ''}`);
        const data = await res.json();
        setCustomers(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCustomers(search, searchBy);
  }, [open]);

  const handleSearch = async () => {
    await (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (search.trim()) {
          qs.set('search', search.trim());
          qs.set('searchBy', searchBy);
        }
        const res = await fetch(`/api/customers${qs.toString() ? `?${qs.toString()}` : ''}`);
        const data = await res.json();
        setCustomers(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    })();
  };

  const filtered = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      switch (searchBy) {
        case 'Name':
          return String(c.name || '').toLowerCase().includes(q);
        case 'Phone':
          return String(c.mobile_number || '').toLowerCase().includes(q);
        case 'Email':
          return String(c.email_address || '').toLowerCase().includes(q);
        case 'GST Number':
          return String(c.gst_number || '').toLowerCase().includes(q);
        case 'PAN Number':
          return String(c.pan_number || '').toLowerCase().includes(q);
        case 'ID':
          return String(c.id || '').toLowerCase().includes(q);
        default:
          return [c.name, c.mobile_number, c.email_address, c.customer_code].some(v => String(v||'').toLowerCase().includes(q));
      }
    });
  }, [customers, search, searchBy]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[900px] bg-white rounded-xl border border-gray-300 shadow-xl overflow-hidden my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Customer</h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Close</button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <select value={searchBy} onChange={(e) => setSearchBy(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 bg-white">
              <option>Name</option>
              <option>Phone</option>
              <option>Email</option>
              <option>GST Number</option>
              <option>PAN Number</option>
              <option>ID</option>
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Value"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 bg-white placeholder:text-gray-400"
            />
            <button onClick={handleSearch} className="px-4 py-2 rounded-lg bg-blue-600 text-white">Search</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2 text-left text-[12px] font-semibold text-gray-600">ID</th>
                  <th className="px-4 py-2 text-left text-[12px] font-semibold text-gray-600">Name</th>
                  <th className="px-4 py-2 text-left text-[12px] font-semibold text-gray-600">Phone</th>
                  <th className="px-4 py-2 text-left text-[12px] font-semibold text-gray-600">Email</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-gray-500">Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-gray-500">No Records found</td></tr>
                ) : filtered.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-[13px] text-gray-700">{c.id}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{c.name}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{c.mobile_number}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{c.email_address}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => { onSelect(c); onClose(); }} className="px-3 py-1 rounded-lg bg-blue-600 text-white">Select</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-[13px] text-gray-700">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
