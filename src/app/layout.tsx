import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IndE - Workstation session tracking tool",
  description: "Workstation session tracking tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
