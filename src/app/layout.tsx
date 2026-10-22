import type { Metadata } from "next";
import { Newsreader, Source_Sans_3 } from "next/font/google";

import { Toaster } from "@/components/ui/toast";
import { clientEnv } from "@/lib/env-client";

import "./globals.css";

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  display: "swap",
});

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(clientEnv.NEXT_PUBLIC_SITE_URL),
  title: "Adrielli Flores",
  description: "Adrielli Flores",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-surface font-sans text-text">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
