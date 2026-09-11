import { redirect } from 'next/navigation';

// The dashboard is rendered at the application root. Keep this alias for
// existing bookmarks and links that still point to /dashboard.
export default function DashboardPage() {
  redirect('/');
}
