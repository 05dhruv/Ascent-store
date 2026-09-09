import { redirect } from 'next/navigation';

export default function InventoryRoot() {
  redirect('/inventory/hub');
}