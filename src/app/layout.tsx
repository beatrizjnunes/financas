import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const appFont = DM_Sans({ variable: "--font-app", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Finanças", template: "%s · Finanças" },
  description: "Finanças pessoais e do casal",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ecebe6" },
    { media: "(prefers-color-scheme: dark)", color: "#111311" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT">
      <body className={`${appFont.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
