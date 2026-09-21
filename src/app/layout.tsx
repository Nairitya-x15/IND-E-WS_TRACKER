import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Factory Station Tracker",
  description: "Workstation session tracking tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
