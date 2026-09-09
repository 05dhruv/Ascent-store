import './globals.css';
import { RootClientWrapper } from './RootClientWrapper';

export const metadata = {
  title: 'Buyzaar Sync',
  description: 'Retail sync and billing software',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/buyzaar-sync-icon.svg',
    shortcut: '/buyzaar-sync-icon.svg',
    apple: '/buyzaar-sync-icon.svg',
  },
  appleWebApp: {
    capable: true,
    title: 'Buyzaar Sync',
    statusBarStyle: 'default',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#B00000',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="icon" href="/buyzaar-sync-icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/buyzaar-sync-icon.svg" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"
        />
      </head>
      <body>
        <RootClientWrapper>{children}</RootClientWrapper>
      </body>
    </html>
  );
}
