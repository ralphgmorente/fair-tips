import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tip Distribution",
  description: "Fair tip distribution for Clover sales and timesheet reports"
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
