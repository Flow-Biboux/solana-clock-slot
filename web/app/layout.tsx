import type { Metadata } from "next";
import { startTelegramPoll } from "@/lib/telegram-poll";
import "./globals.css";

startTelegramPoll();

export const metadata: Metadata = {
  title: "Did your program's clock just double speed?",
  description: "Check whether a Solana account's slot times still assume 400 ms.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
