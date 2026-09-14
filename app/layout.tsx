import type { Metadata, Viewport } from "next";
import "./globals.css";
import { splashDevices } from "@/lib/splash-devices";
import { RegisterServiceWorker } from "./register-service-worker";

export const metadata: Metadata = {
  title: "ShiftFlow",
  description: "Restaurant business dashboard and tip distribution for Clover reports",
  applicationName: "ShiftFlow",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      // The SVG wins wherever it is supported, so the tab mark stays sharp on any display.
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    title: "ShiftFlow",
    // The page runs under the status bar so the app's own colour shows there instead of
    // an iOS-white strip. globals.css paints that area and pads the content past it.
    statusBarStyle: "black-translucent",
    // Generated alongside the images themselves; iOS shows a blank white screen for
    // any device size that is not listed here.
    startupImage: splashDevices
  }
};

export const viewport: Viewport = {
  themeColor: "#0f7c67",
  width: "device-width",
  initialScale: 1,
  // Installed apps should not rubber-band like a web page, but pinch zoom stays
  // available: capping it would fail accessibility for anyone who needs to zoom.
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
