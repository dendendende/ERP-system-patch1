import type { Metadata } from "next";
import { connection } from "next/server";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// one corporate family for text, headings and numbers (it has lined-up digits)
const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Cashflow",
  description: "Money in, money out, and who still owes you.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Every page is rendered per request: the CSP nonce (src/proxy.ts) only reaches pages built
  // at request time; a page built ahead of time would have its scripts blocked.
  await connection();
  return (
    <html lang="en" className={`${plex.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
