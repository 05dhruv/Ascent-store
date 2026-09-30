'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function StockReorderChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="shortName" tick={{ fontSize: 12 }} interval={0} height={60} angle={-15} textAnchor="end" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="currentStock" stroke="#B00000" strokeWidth={2.5} dot={{ r: 3 }} name="Current stock" />
        <Line type="monotone" dataKey="reorderLevel" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} name="Reorder level" />
      </LineChart>
    </ResponsiveContainer>
  );
}
