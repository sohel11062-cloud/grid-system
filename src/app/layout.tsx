import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "THE GRID — Loyalty OS",
  description: "A cyberpunk loyalty operating system for fashion-tech members.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-grid-bg text-grid-text antialiased">
        {children}
      </body>
    </html>
  );
}