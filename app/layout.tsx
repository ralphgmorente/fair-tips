import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShiftFlow",
  description: "Restaurant business dashboard and tip distribution for Clover reports"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
