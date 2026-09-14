import "./globals.css";
import { RootClientWrapper } from "./RootClientWrapper";

export const metadata = {
  title: "Ascent Sync",
  description: "Construction material and site movement management",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/ascent-sync-icon.svg",
    shortcut: "/ascent-sync-icon.svg",
    apple: "/ascent-sync-icon.svg",
  },
  appleWebApp: {
    capable: true,
    title: "Ascent Sync",
    statusBarStyle: "default",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1C2A35",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="icon" href="/ascent-sync-icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/ascent-sync-icon.svg" />
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
