import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vouqis Verify",
  description: "CI verification and review evidence for AI code changes",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
