import { NextResponse } from 'next/server';
import { applySalesOrderBulkAction, listSalesOrderRows } from '@/lib/salesOrderSectionApi';

export async function GET(request) {
  try {
    const rows = await listSalesOrderRows('invoice-sales-order', request);
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[invoice sales order GET]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to fetch invoice sales orders' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const result = await applySalesOrderBulkAction('invoice-sales-order', request);
    if (result?.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[invoice sales order POST]', err.message);
    return NextResponse.json({ error: 'Failed to process bulk action' }, { status: 500 });
  }
}
