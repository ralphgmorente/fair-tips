import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "./register-service-worker";

export const metadata: Metadata = {
  title: "ShiftFlow",
  description: "Restaurant business dashboard and tip distribution for Clover reports",
  applicationName: "ShiftFlow",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    title: "ShiftFlow",
    statusBarStyle: "default",
    startupImage: [
      {
        url: "/splash/launch-1179x2556.png",
        media:
          "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
      },
      {
        url: "/splash/launch-1290x2796.png",
        media:
          "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
      },
      {
        url: "/splash/launch-1170x2532.png",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
      },
      {
        url: "/splash/launch-1284x2778.png",
        media:
          "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
      },
      {
        url: "/splash/launch-1125x2436.png",
        media:
          "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
      },
      {
        url: "/splash/launch-828x1792.png",
        media:
          "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
      },
      {
        url: "/splash/launch-750x1334.png",
        media:
          "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
      }
    ]
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
