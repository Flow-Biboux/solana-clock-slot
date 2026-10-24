import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Did your program's clock just double speed?",
  description: "Test interface for Solana slot-time checks at /safu.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
