import type { Metadata } from "next";
import { Geist, Geist_Mono, Quicksand } from "next/font/google";
import "./globals.css";
import { Providers } from "@/app/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Tapioca Finance",
  description: "Simple as a Sip. Sweet Rewards. The tastiest way to grow your assets on-chain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="base:app_id" content="699dc4d2c5c1c2a065a21d1b" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${quicksand.variable} box-content antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
