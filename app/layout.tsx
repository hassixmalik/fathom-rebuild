import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Delta",
  description: "Find the few moments in a meeting that changed something.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans text-[14px] leading-normal">{children}</body>
    </html>
  );
}
